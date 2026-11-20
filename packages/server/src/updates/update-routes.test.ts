import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  Job,
  JobEvent,
  MatrixResponse,
  UpdateAccepted,
  UpdatePreview,
} from '@depboard/shared';
import { createApp } from '../app.js';
import { createRegistryClient } from '../registry/registry-client.js';
import { fakeRegistry } from '../testing/fake-registry.js';
import { makeTree } from '../testing/tmp-tree.js';
import type { Runner } from './runner.js';

const PORT = 4319;
const HOST = `127.0.0.1:${String(PORT)}`;
const ORIGIN = `http://${HOST}`;
const TOKEN = 'd'.repeat(64);
const headers = { host: HOST, origin: ORIGIN, 'x-depboard-token': TOKEN };

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function setup() {
  const root = await makeTree({
    'web/package.json': {
      name: 'web',
      dependencies: { react: '^18.0.0' },
      devDependencies: { vitest: '^3.2.0' },
    },
    'web/package-lock.json': {},
    'web/node_modules/react/package.json': { version: '18.3.1' },
    'web/node_modules/vitest/package.json': { version: '3.2.0' },
  });
  const registry = fakeRegistry({
    packages: { react: { latest: '19.1.0' }, vitest: { latest: '3.2.4' } },
  });

  const runs: { args: string[]; cwd: string; finish: (code: number) => void }[] = [];
  const runner: Runner = (command, cwd, onLine) => {
    let finish: (code: number) => void = () => {};
    const done = new Promise<number | null>((resolve) => {
      finish = (code) => {
        onLine('stdout', `changed 1 package (${command.args[1] ?? ''})`);
        resolve(code);
      };
    });
    runs.push({ args: command.args, cwd, finish });
    return { done, kill: () => {} };
  };

  const app = await createApp({
    token: TOKEN,
    port: () => PORT,
    roots: [root],
    registry: createRegistryClient({ fetch: registry.fetch }),
    runner,
  });
  apps.push(app);
  const matrix = (await app.inject({ url: '/api/matrix', headers })).json<MatrixResponse>();
  const web = matrix.projects.find((p) => p.name === 'web');
  if (!web) throw new Error('fixture');
  return { app, runs, web, root };
}

const update = (app: FastifyInstance, body: unknown, extra: Record<string, string> = headers) =>
  app.inject({ method: 'POST', url: '/api/update', headers: extra, payload: body as object });

describe('POST /api/update', () => {
  it('previews the exact command without running anything', async () => {
    const { app, runs, web } = await setup();
    const response = await update(app, {
      package: 'react',
      version: 'latest',
      projectIds: [web.id],
      dryRun: true,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<UpdatePreview>()).toEqual({
      version: '19.1.0',
      updateType: 'major',
      commands: [{ projectId: web.id, display: 'npm install react@19.1.0 --no-audit --no-fund' }],
    });
    expect(runs).toHaveLength(0);
  });

  it('refuses a major update that was not confirmed', async () => {
    const { app, runs, web } = await setup();
    const response = await update(app, {
      package: 'react',
      version: '19.1.0',
      projectIds: [web.id],
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'MAJOR_NOT_CONFIRMED' } });
    expect(runs).toHaveLength(0);
  });

  it('runs a confirmed update in the project folder, then rescans', async () => {
    const { app, runs, web } = await setup();
    const response = await update(app, {
      package: 'react',
      version: '19.1.0',
      projectIds: [web.id],
      confirmMajor: true,
    });
    expect(response.statusCode).toBe(202);
    const accepted = response.json<UpdateAccepted>();
    expect(accepted.jobId).toMatch(/^j_[0-9a-f]{12}$/);
    expect(runs[0]).toMatchObject({
      args: ['install', 'react@19.1.0', '--no-audit', '--no-fund'],
      cwd: web.path,
    });

    const busy = await update(app, { package: 'vitest', version: '3.2.4', projectIds: [web.id] });
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toMatchObject({ error: { code: 'PROJECT_BUSY' } });

    runs[0]?.finish(0);
    const stream = await app.inject({ url: `/api/jobs/${accepted.jobId}/stream`, headers });
    expect(stream.headers['content-type']).toContain('application/x-ndjson');
    const events = stream.body
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as JobEvent);
    expect(events.map((e) => e.type)).toEqual(['start', 'output', 'end']);
    expect(events.at(-1)).toMatchObject({ job: { status: 'success', exitCode: 0 } });

    const { jobs } = (await app.inject({ url: '/api/jobs', headers })).json<{ jobs: Job[] }>();
    expect(jobs).toHaveLength(1);
  });

  it('keeps a devDependency in devDependencies', async () => {
    const { app, runs, web } = await setup();
    await update(app, { package: 'vitest', version: '3.2.4', projectIds: [web.id] });
    expect(runs[0]?.args).toContain('--save-dev');
  });

  it.each([
    [{ package: 'react; rm -rf ~', version: '19.1.0' }, 400, 'INVALID_PACKAGE_NAME'],
    [{ package: '--registry=evil', version: '19.1.0' }, 400, 'INVALID_PACKAGE_NAME'],
    [{ package: 'react', version: '^19.0.0' }, 400, 'INVALID_VERSION'],
    [{ package: 'react', version: '19.1.0 --force' }, 400, 'INVALID_VERSION'],
    [{ package: 'lodash', version: '4.17.21' }, 404, 'NOT_FOUND'],
  ])('refuses %j', async (body, status, code) => {
    const { app, runs, web } = await setup();
    const response = await update(app, { ...body, projectIds: [web.id], confirmMajor: true });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code } });
    expect(runs).toHaveLength(0);
  });

  it('refuses a path in place of a project id, and malformed bodies', async () => {
    const { app, runs, root } = await setup();
    for (const body of [
      { package: 'react', version: '19.1.0', projectIds: [root] },
      { package: 'react', version: '19.1.0', projectIds: ['a', 'b'] },
      { package: 'react', version: '19.1.0', projectIds: 'x' },
      { package: 'react', version: 19 },
      { package: 'react', version: '19.1.0', projectIds: ['x'], cwd: '/tmp' },
    ]) {
      const response = await update(app, body);
      expect([400, 404]).toContain(response.statusCode);
    }
    expect(runs).toHaveLength(0);
  });

  it('is unreachable without the token, from another site, or without an Origin', async () => {
    const { app, runs, web } = await setup();
    const body = { package: 'vitest', version: '3.2.4', projectIds: [web.id] };
    expect((await update(app, body, { host: HOST, origin: ORIGIN })).statusCode).toBe(401);
    expect(
      (await update(app, body, { ...headers, origin: 'http://evil.example' })).statusCode,
    ).toBe(403);
    expect((await update(app, body, { host: HOST, 'x-depboard-token': TOKEN })).statusCode).toBe(
      403,
    );
    expect(runs).toHaveLength(0);
  });
});

describe('job routes', () => {
  it('need the token', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/api/jobs', headers: { host: HOST } })).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/api/jobs/j_000000000000/stream', headers: { host: HOST } }))
        .statusCode,
    ).toBe(401);
  });

  it('never accept the token from the URL, only from the header', async () => {
    const { app } = await setup();
    const response = await app.inject({ url: `/api/jobs?token=${TOKEN}`, headers: { host: HOST } });
    expect(response.statusCode).toBe(401);
  });

  it('answer 404 for unknown or malformed job ids', async () => {
    const { app } = await setup();
    for (const id of ['j_000000000000', '..%2F..%2Fetc', 'x']) {
      expect((await app.inject({ url: `/api/jobs/${id}/stream`, headers })).statusCode).toBe(404);
    }
  });
});
