import { parseArgs } from 'node:util';
import { DepboardError } from '@depboard/shared';

export interface CliOptions {
  paths: string[];
  port: number | undefined;
  open: boolean;
  yes: boolean;
  summary: boolean;
  depth: number;
  debug: boolean;
  help: boolean;
  version: boolean;
}

export const DEFAULT_DEPTH = 6;

export const HELP_TEXT = `Usage: depboard [paths...] [options]

Discover what's hiding in your projects.
Scans only the folders you give it (default: the current directory).

Options:
  --port <n>      Port to use (default: random free port)
  --no-open       Don't open the browser
  --summary       Print the summary and exit (no server, no browser): for CI and scripts
  -y, --yes       Skip confirmations (non-interactive use)
  --depth <n>     Max folder depth (default: ${DEFAULT_DEPTH})
  --debug         Verbose logs to stderr
  -v, --version   Print the version
  -h, --help      Show this help

Examples:
  npx depboard
  npx depboard ~/projects
  npx depboard ~/work ~/clients
  npx depboard ~/projects --summary`;

function parsePositiveInt(flag: string, raw: string | undefined, max: number): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new DepboardError(
      'INVALID_USAGE',
      `--${flag} must be a whole number between 1 and ${max}.`,
      {
        hint: `Got "${raw}".`,
      },
    );
  }
  return value;
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      allowNegative: true,
      options: {
        port: { type: 'string' },
        open: { type: 'boolean', default: true },
        yes: { type: 'boolean', short: 'y', default: false },
        summary: { type: 'boolean', default: false },
        depth: { type: 'string' },
        debug: { type: 'boolean', default: false },
        version: { type: 'boolean', short: 'v', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new DepboardError('INVALID_USAGE', message, { hint: 'Run `depboard --help`.', cause });
  }

  const { values, positionals } = parsed;
  return {
    paths: positionals,
    port: parsePositiveInt('port', values.port, 65535),
    open: values.open,
    yes: values.yes,
    summary: values.summary,
    depth: parsePositiveInt('depth', values.depth, 32) ?? DEFAULT_DEPTH,
    debug: values.debug,
    help: values.help,
    version: values.version,
  };
}
