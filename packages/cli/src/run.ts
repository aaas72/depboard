import { DepboardError } from '@depboard/shared';
import {
  displayPath,
  resolveRoots,
  scanProjects,
  suggestRoots,
  type ScanResult,
} from '@depboard/server';
import { HELP_TEXT, parseCliArgs } from './args.js';

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
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function uniquePackageCount(result: ScanResult): number {
  return new Set(result.projects.flatMap((p) => p.dependencies.map((d) => d.name))).size;
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

    const result = await scanProjects(roots, { depth: options.depth });
    const shownRoots = roots.map((r) => displayPath(r, io.homedir)).join(', ');

    if (result.projects.length === 0) {
      await reportEmpty(roots, io);
      return EXIT_OK;
    }

    io.stdout(
      `Scanned ${shownRoots} · ${plural(result.projects.length, 'project')} · ${plural(
        uniquePackageCount(result),
        'package',
      )}`,
    );
    for (const project of result.projects) {
      io.stdout(
        `  ${project.name}  (${project.manager}, ${plural(project.dependencies.length, 'dependency', 'dependencies')})`,
      );
    }
    for (const issue of result.issues) {
      io.stderr(`⚠ Skipped ${displayPath(issue.path, io.homedir)}: ${issue.reason}`);
    }
    if (result.projects.length === 1) {
      io.stderr('Found 1 project. To compare projects, run: npx depboard ..');
    }
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
