import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import * as z from 'zod/mini';
import {
  DepboardError,
  type ErrorCode,
  type ErrorResponse,
  type Matrix,
  type MatrixResponse,
  type Job,
  type ProjectsResponse,
  type UpdateAccepted,
  type UpdatePreview,
} from '@depboard/shared';
import { analyze, type AnalyzeResult } from './analyze.js';
import type { RegistryClient } from './registry/registry-client.js';
import { registerGuard } from './security/guard.js';
import { createJobManager } from './updates/jobs.js';
import { planUpdate } from './updates/plan-update.js';
import { runCommand, type Runner } from './updates/runner.js';

export interface AppOptions {
  token: string;
  /** The listening port, read per request. */
  port: () => number;
  roots: readonly string[];
  registry: RegistryClient;
  depth?: number;
  /** A finished analysis to serve first (the CLI already ran one), instead of scanning again. */
  initial?: AnalyzeResult;
  /** Built UI files. Without them, only the API is served. */
  staticDir?: string | undefined;
  devOrigins?: readonly string[];
  logger?: boolean;
  /** Starts install commands. Tests inject a fake, so they never run npm. */
  runner?: Runner;
}

const STATUS: Partial<Record<ErrorCode, number>> = {
  INVALID_USAGE: 400,
  INVALID_PACKAGE_NAME: 400,
  INVALID_VERSION: 400,
  FORBIDDEN_PATH: 403,
  FORBIDDEN_REQUEST: 403,
  PROJECT_NOT_FOUND: 404,
  NOT_FOUND: 404,
  PROJECT_BUSY: 409,
  MAJOR_NOT_CONFIRMED: 409,
  MANAGER_NOT_SUPPORTED: 409,
  NOT_UPDATABLE: 409,
  REGISTRY_UNAVAILABLE: 502,
};

function errorBody(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}

const updateBody = z.object({
  package: z.string().check(z.minLength(1), z.maxLength(214)),
  version: z.string().check(z.minLength(1), z.maxLength(64)),
  projectIds: z.array(z.string().check(z.maxLength(64))).check(z.minLength(1), z.maxLength(1)),
  confirmMajor: z.optional(z.boolean()),
  dryRun: z.optional(z.boolean()),
});

const jobParams = z.object({ id: z.string().check(z.regex(/^j_[0-9a-f]{12}$/)) });

const matrixQuery = z.object({
  onlyOutdated: z.optional(z.enum(['true', 'false'])),
});

/** Removes rows where no project is behind. Insights are kept: they describe the whole picture. */
function onlyOutdated(matrix: Matrix): Matrix {
  return {
    ...matrix,
    rows: matrix.rows.filter((row) =>
      Object.values(row.cells).some(
        (c) => c.updateType === 'patch' || c.updateType === 'minor' || c.updateType === 'major',
      ),
    ),
  };
}

/**
 * The local server, not yet listening. Every route sits behind the security guard.
 * Services are injected, so tests drive it with `app.inject()` and a fake registry.
 */
export async function createApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 64 * 1024,
    // Our own error handler decides what reaches the client.
    return503OnClosing: true,
  });

  registerGuard(app, {
    token: options.token,
    port: options.port,
    devOrigins: options.devOrigins ?? [],
  });

  // One analysis at a time. A rescan replaces it; readers always get the latest finished or running one.
  let current: Promise<AnalyzeResult> = options.initial
    ? Promise.resolve(options.initial)
    : analyze(options.roots, options.registry, { depth: options.depth ?? 6 });

  const latest = () => current;
  const rescan = () => {
    current = analyze(options.roots, options.registry, { depth: options.depth ?? 6 });
    return current;
  };

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DepboardError) {
      return reply.code(STATUS[error.code] ?? 500).send(errorBody(error.code, error.message));
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send(errorBody('INVALID_USAGE', 'Invalid request.'));
    }
    app.log.error(error);
    // Never leak internals (paths, stack traces) to the client.
    return reply
      .code(500)
      .send(
        errorBody(
          'INTERNAL_ERROR',
          'Something failed on the DepBoard server. Run with --debug for details.',
        ),
      );
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(errorBody('NOT_FOUND', 'No such route.')),
  );

  const toResponse = (result: AnalyzeResult, matrix = result.matrix): MatrixResponse => ({
    ...matrix,
    failedLookups: result.failedLookups,
    advisoriesIncomplete: result.advisoriesIncomplete,
  });

  app.get('/api/projects', async (): Promise<ProjectsResponse> => {
    const result = await latest();
    const count = result.matrix.projects.length;
    return {
      roots: [...options.roots],
      projects: result.matrix.projects,
      issues: result.issues,
      hint: count === 0 ? 'no-projects' : count === 1 ? 'single-project' : null,
    };
  });

  app.get('/api/matrix', async (request): Promise<MatrixResponse> => {
    const query = matrixQuery.safeParse(request.query);
    if (!query.success) throw new DepboardError('INVALID_USAGE', 'Invalid query.');
    const result = await latest();
    return toResponse(
      result,
      query.data.onlyOutdated === 'true' ? onlyOutdated(result.matrix) : result.matrix,
    );
  });

  app.post('/api/rescan', async (): Promise<MatrixResponse> => toResponse(await rescan()));

  const jobs = createJobManager({
    runner: options.runner ?? runCommand,
    // The update changed the project: rescan so the matrix shows the new version.
    afterSuccess: rescan,
  });
  // Clean exit: never leave an install running after the server stops.
  app.addHook('onClose', (_instance, done) => {
    jobs.stopAll();
    done();
  });

  app.post('/api/update', async (request, reply): Promise<UpdatePreview | UpdateAccepted> => {
    const body = updateBody.safeParse(request.body);
    if (!body.success) throw new DepboardError('INVALID_USAGE', 'Invalid update request.');
    const plan = planUpdate((await latest()).matrix, options.roots, body.data);
    const commands = [{ projectId: plan.project.id, display: plan.command.display }];
    if (body.data.dryRun === true) {
      return { version: plan.version, updateType: plan.updateType, commands };
    }
    const job = jobs.start({
      projectId: plan.project.id,
      cwd: plan.project.path,
      package: body.data.package,
      version: plan.version,
      command: plan.command,
    });
    void reply.code(202);
    return { jobId: job.id, commands };
  });

  app.get('/api/jobs', (): Promise<{ jobs: Job[] }> => Promise.resolve({ jobs: jobs.list() }));

  // Live install output as NDJSON over a plain streaming response: the token stays in a header,
  // and the same guard applies as for every other request (see api.md).
  app.get('/api/jobs/:id/stream', (request, reply) => {
    const params = jobParams.safeParse(request.params);
    if (!params.success) throw new DepboardError('NOT_FOUND', 'No such job.');
    const stream = new PassThrough();
    const unsubscribe = jobs.subscribe(params.data.id, (event) => {
      stream.write(`${JSON.stringify(event)}
`);
      if (event.type === 'end') stream.end();
    });
    request.raw.on('close', () => {
      unsubscribe();
      stream.end();
    });
    return reply.type('application/x-ndjson; charset=utf-8').send(stream);
  });

  if (options.staticDir !== undefined && fs.existsSync(options.staticDir)) {
    await app.register(fastifyStatic, { root: options.staticDir, index: 'index.html' });
  }

  return app;
}
