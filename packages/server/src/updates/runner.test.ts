import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { runCommand, type OutputStream } from './runner.js';

function collect() {
  const lines: [OutputStream, string][] = [];
  return { lines, onLine: (stream: OutputStream, line: string) => lines.push([stream, line]) };
}

// These start real processes on purpose: they prove the one place we spawn works on every OS.
describe('runCommand', () => {
  it('runs npm itself without a shell (npm.cmd on Windows) and streams its output', async () => {
    const { lines, onLine } = collect();
    const running = runCommand(
      { file: 'npm', args: ['--version'], display: 'npm --version' },
      os.tmpdir(),
      onLine,
    );
    expect(await running.done).toBe(0);
    expect(lines.some(([stream, line]) => stream === 'stdout' && /^\d+\.\d+\.\d+/.test(line))).toBe(
      true,
    );
  });

  it('reports stdout and stderr separately, and the exit code', async () => {
    const { lines, onLine } = collect();
    const script = 'console.log("out"); console.error("err"); process.exit(3)';
    const running = runCommand(
      { file: process.execPath, args: ['-e', script], display: 'node' },
      os.tmpdir(),
      onLine,
    );
    expect(await running.done).toBe(3);
    expect(lines).toEqual(
      expect.arrayContaining([
        ['stdout', 'out'],
        ['stderr', 'err'],
      ]),
    );
  });

  it('passes arguments literally: shell syntax is never interpreted', async () => {
    const { lines, onLine } = collect();
    const tricky = 'a; echo pwned && $(whoami) | %PATH% > x';
    const running = runCommand(
      {
        file: process.execPath,
        args: ['-e', 'console.log(process.argv[1])', tricky],
        display: 'node',
      },
      os.tmpdir(),
      onLine,
    );
    expect(await running.done).toBe(0);
    expect(lines).toEqual([['stdout', tricky]]);
  });

  it('never throws for a command that cannot start', async () => {
    const { lines, onLine } = collect();
    const running = runCommand(
      { file: 'depboard-no-such-command', args: [], display: 'x' },
      os.tmpdir(),
      onLine,
    );
    expect(await running.done).not.toBe(0);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('can be stopped', async () => {
    const running = runCommand(
      { file: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], display: 'node' },
      os.tmpdir(),
      () => {},
    );
    running.kill();
    expect(await running.done).not.toBe(0);
  });
});
