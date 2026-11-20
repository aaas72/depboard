import { createInterface } from 'node:readline';
import { execa } from 'execa';
import type { InstallCommand } from '../adapters/npm.js';

export type OutputStream = 'stdout' | 'stderr';

export interface RunningCommand {
  /** Resolves with the exit code (null when killed or it couldn't start). Never rejects. */
  done: Promise<number | null>;
  kill: () => void;
}

/** Runs a command in a folder and reports its output line by line. Injected, so tests never install. */
export type Runner = (
  command: InstallCommand,
  cwd: string,
  onLine: (stream: OutputStream, line: string) => void,
) => RunningCommand;

/** No install should take this long; a hung one is stopped instead of blocking the project forever. */
const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * The only place DepBoard starts a process (security.md). `execa` with `shell: false` and an
 * argument array: on Windows it runs `npm.cmd` correctly with escaped arguments, and nothing a
 * user typed ever reaches a shell.
 */
export const runCommand: Runner = (command, cwd, onLine) => {
  const child = execa(command.file, command.args, {
    cwd,
    shell: false,
    reject: false,
    stdin: 'ignore',
    timeout: TIMEOUT_MS,
    env: { NO_UPDATE_NOTIFIER: '1', npm_config_update_notifier: 'false' },
  });

  for (const [name, stream] of [
    ['stdout', child.stdout],
    ['stderr', child.stderr],
  ] as const) {
    createInterface({ input: stream }).on('line', (line) => {
      onLine(name, line);
    });
  }

  const done = child.then(
    (result) => {
      if (result.failed && result.exitCode === undefined) {
        onLine('stderr', result.shortMessage ?? 'The command could not start.');
      }
      return result.exitCode ?? null;
    },
    (error: unknown) => {
      onLine('stderr', error instanceof Error ? error.message : String(error));
      return null;
    },
  );

  return {
    done,
    kill: () => {
      child.kill();
    },
  };
};
