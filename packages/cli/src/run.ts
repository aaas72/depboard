import { DepboardError, describeInsightText, type Matrix } from '@depboard/shared';
import {
  analyze,
  displayPath,
  pickHeadlines,
  resolveRoots,
  suggestRoots,
  type AnalyzeResult,
  type RegistryClient,
} from '@depboard/server';
import { HELP_TEXT, parseCliArgs } from './args.js';
import { buildJsonReport, countMatrixSummary } from './json-report.js';

export const EXIT_OK = 0;
export const EXIT_RUNTIME_ERROR = 1;
export const EXIT_USAGE_ERROR = 2;

/** Everything `run` needs from the outside world, so tests can drive it without a real terminal. */
export interface CliIO {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  cwd: string;
  homedir: string;
  version: string;
  /** null when there is no interactive terminal (CI, pipes): never prompt then. */
  confirm: ((question: string) => Promise<boolean>) | null;
  registry: RegistryClient;
  /**
   * Starts the local server and keeps it running until the user stops it.
   * Injected so tests never open real ports or browsers.
   */
  startServer: (options: ServeOptions) => Promise<{ url: string }>;
  openBrowser: (url: string) => void;
  /** Throws PORT_IN_USE when a port chosen with --port is taken. Checked before scanning. */
  checkPort: (port: number) => Promise<void>;
  /** The built UI, when it ships with this build. Without it only the API is served. */
  staticDir: string | undefined;
}

export interface ServeOptions {
  roots: readonly string[];
  registry: RegistryClient;
  depth: number;
  port: number | undefined;
  initial: AnalyzeResult;
  staticDir: string | undefined;
  debug: boolean;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export const HEADLINE_LIMIT = 5;

/**
 * A plain-text summary of the matrix, insights first: the core question answered in a terminal,
 * printed before the browser opens and on its own with --summary.
 */
function reportMatrix(matrix: Matrix, io: CliIO): void {
  const projectName = new Map(matrix.projects.map((p) => [p.id, p.name]));

  const headlines = pickHeadlines(matrix.insights, HEADLINE_LIMIT);
  if (headlines.length === 0) {
    io.stdout('');
    io.stdout('✔ Nothing hiding: shared packages agree and no known vulnerabilities were found.');
  } else {
    io.stdout('');
    io.stdout("What's hiding in your projects:");
    for (const insight of headlines) {
      io.stdout(`  ● ${describeInsightText(insight)}`);
      const names = insight.projectIds.map((id) => projectName.get(id) ?? id);
      const shown = names.slice(0, 6).join(', ');
      io.stdout(`      ${names.length > 6 ? `${shown}, +${names.length - 6} more` : shown}`);
    }
    const shownPackages = new Set(headlines.map((i) => i.package));
    const more = matrix.insights.filter((i) => !shownPackages.has(i.package)).length;
    if (more > 0) io.stdout(`  + ${plural(more, 'more finding')}`);
  }

  const { outdated, vulnerable, estimated } = countMatrixSummary(matrix);
  io.stdout('');
  io.stdout(
    outdated.total === 0
      ? '  Every package is up to date'
      : `  ${plural(outdated.total, 'package')} outdated: ${outdated.major} major · ${outdated.minor} minor · ${outdated.patch} patch`,
  );
  io.stdout(`  ${plural(vulnerable, 'package')} with known vulnerabilities`);

  if (estimated > 0) {
    io.stderr(
      `ℹ ${plural(estimated, 'dependency', 'dependencies')} not installed: versions estimated from package.json, vulnerability status unknown.`,
    );
  }
}

async function reportEmpty(roots: string[], io: CliIO): Promise<void> {
  const shown = roots.map((r) => displayPath(r, io.homedir)).join(', ');
  io.stderr(`No projects found in ${shown}.`);
  const suggestions = (await suggestRoots(io.homedir)).filter((s) => !roots.includes(s));
  if (suggestions.length > 0) {
    io.stderr('Did you mean:');
    for (const suggestion of suggestions) {
      io.stderr(`  npx depboard ${displayPath(suggestion, io.homedir)}`);
    }
  } else {
    io.stderr('Point DepBoard at the folder that holds your projects: npx depboard <folder>');
  }
}

export async function run(argv: readonly string[], io: CliIO): Promise<number> {
  const debug = argv.includes('--debug');
  try {
    const options = parseCliArgs(argv);
    if (options.help) {
      io.stdout(HELP_TEXT);
      return EXIT_OK;
    }
    if (options.version) {
      io.stdout(io.version);
      return EXIT_OK;
    }

    const { roots, includesHome } = await resolveRoots(options.paths, {
      cwd: io.cwd,
      homedir: io.homedir,
    });

    if (includesHome && !options.yes) {
      const question = 'Scan your whole home folder? This can be slow. [y/N] ';
      if (!io.confirm) {
        throw new DepboardError(
          'CONFIRMATION_REQUIRED',
          'Scanning your whole home folder needs confirmation.',
          {
            hint: 'Pass --yes to confirm, or point DepBoard at your projects folder instead.',
          },
        );
      }
      if (!(await io.confirm(question))) {
        io.stderr('Cancelled. Nothing was scanned.');
        return EXIT_OK;
      }
    }

    // A taken --port would only fail after the scan: say so before spending seconds on it.
    if (!options.summary && !options.json && options.port !== undefined) {
      await io.checkPort(options.port);
    }

    const result = await analyze(roots, io.registry, { depth: options.depth });
    const { matrix } = result;
    const shownRoots = roots.map((r) => displayPath(r, io.homedir)).join(', ');

    if (options.json) {
      io.stdout(JSON.stringify(buildJsonReport(result, roots, io.homedir), null, 2));
      if (matrix.projects.length === 0) {
        await reportEmpty(roots, io);
        return EXIT_OK;
      }
    } else {
      if (matrix.projects.length === 0) {
        await reportEmpty(roots, io);
        return EXIT_OK;
      }

      io.stdout(
        `Scanned ${shownRoots} · ${plural(matrix.projects.length, 'project')} · ${plural(
          matrix.rows.length,
          'package',
        )}`,
      );
      reportMatrix(matrix, io);
    }

    for (const issue of result.issues) {
      io.stderr(`⚠ Skipped ${displayPath(issue.path, io.homedir)}: ${issue.reason}`);
    }
    if (result.failedLookups.length > 0) {
      io.stderr(
        `⚠ Couldn't reach the npm registry for ${plural(result.failedLookups.length, 'package')}. Their latest versions are unknown.`,
      );
    }
    if (result.advisoriesIncomplete) {
      io.stderr(
        "⚠ Couldn't check every version for vulnerabilities. Unchecked ones are shown as unknown, not safe.",
      );
    }
    if (!options.json && matrix.projects.length === 1) {
      io.stderr('Found 1 project. To compare projects, run: npx depboard ..');
    }
    if (options.summary || options.json) return EXIT_OK;

    const server = await io.startServer({
      roots,
      registry: io.registry,
      depth: options.depth,
      port: options.port,
      initial: result,
      staticDir: io.staticDir,
      debug,
    });
    io.stdout('');
    io.stdout(`  ➜ Open: ${server.url}`);
    io.stdout('  Press Ctrl+C to stop.');
    if (options.open && io.staticDir !== undefined) io.openBrowser(server.url);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof DepboardError) {
      io.stderr(`✖ ${error.message}`);
      if (error.hint) io.stderr(`  ${error.hint}`);
    } else {
      io.stderr('✖ Unexpected error. Run again with --debug for details.');
    }
    if (debug) io.stderr(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return error instanceof DepboardError && error.code === 'INVALID_USAGE'
      ? EXIT_USAGE_ERROR
      : EXIT_RUNTIME_ERROR;
  }
}
