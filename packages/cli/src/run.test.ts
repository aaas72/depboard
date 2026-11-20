import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EXIT_OK, EXIT_RUNTIME_ERROR, EXIT_USAGE_ERROR, run, type CliIO } from './run.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function tree(files: Record<string, object>): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'depboard-cli-')));
  dirs.push(root);
  for (const [rel, json] of Object.entries(files)) {
    const file = path.join(root, ...rel.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(json));
  }
  return root;
}

function io(overrides: Partial<CliIO> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const value: CliIO = {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    cwd: process.cwd(),
    homedir: '/nonexistent-home',
    version: '1.2.3',
    confirm: null,
    ...overrides,
  };
  return { value, out, err };
}

describe('run', () => {
  it('prints the version', async () => {
    const t = io();
    expect(await run(['--version'], t.value)).toBe(EXIT_OK);
    expect(t.out).toEqual(['1.2.3']);
  });

  it('exits with 2 on invalid usage and explains why on stderr', async () => {
    const t = io();
    expect(await run(['--depth', 'deep'], t.value)).toBe(EXIT_USAGE_ERROR);
    expect(t.out).toEqual([]);
    expect(t.err[0]).toMatch(/^✖ --depth/);
  });

  it('summarizes the projects it found', async () => {
    const root = await tree({
      'web/package.json': { name: 'web', dependencies: { react: '^18.0.0', lodash: '^4.0.0' } },
      'api/package.json': { name: 'api', dependencies: { lodash: '^4.0.0' } },
    });
    const t = io({ cwd: root });
    expect(await run([], t.value)).toBe(EXIT_OK);
    expect(t.out[0]).toContain('2 projects · 2 packages');
    expect(t.out.slice(1)).toEqual(['  api  (npm, 1 dependency)', '  web  (npm, 2 dependencies)']);
  });

  it('suggests running from the parent when only one project is found', async () => {
    const root = await tree({ 'package.json': { name: 'solo' } });
    const t = io({ cwd: root });
    await run([], t.value);
    expect(t.err.join('\n')).toContain('npx depboard ..');
  });

  it('suggests existing common folders when nothing is found', async () => {
    const home = await tree({ 'projects/app/package.json': { name: 'app' } });
    const empty = path.join(home, 'empty');
    await fs.mkdir(empty);
    const t = io({ cwd: empty, homedir: home });
    expect(await run([], t.value)).toBe(EXIT_OK);
    expect(t.err.join('\n')).toContain(`npx depboard ~${path.sep}projects`);
  });

  it('refuses to scan the home folder without confirmation when not interactive', async () => {
    const home = await tree({ 'app/package.json': { name: 'app' } });
    const t = io({ cwd: home, homedir: home, confirm: null });
    expect(await run([], t.value)).toBe(EXIT_RUNTIME_ERROR);
    expect(t.err.join('\n')).toContain('--yes');
    expect(t.out).toEqual([]);
  });

  it('scans the home folder with --yes', async () => {
    const home = await tree({ 'app/package.json': { name: 'app' } });
    const t = io({ cwd: home, homedir: home });
    expect(await run(['--yes'], t.value)).toBe(EXIT_OK);
    expect(t.out[0]).toContain('1 project');
  });

  it('scans nothing when the user declines the home-folder prompt', async () => {
    const home = await tree({ 'app/package.json': { name: 'app' } });
    const t = io({ cwd: home, homedir: home, confirm: () => Promise.resolve(false) });
    expect(await run([], t.value)).toBe(EXIT_OK);
    expect(t.out).toEqual([]);
    expect(t.err).toContain('Cancelled. Nothing was scanned.');
  });

  it('refuses a drive root with a helpful message', async () => {
    const t = io();
    expect(await run([path.parse(process.cwd()).root], t.value)).toBe(EXIT_RUNTIME_ERROR);
    expect(t.err[0]).toContain("doesn't scan whole drives");
    expect(t.err[1]).toContain('npx depboard');
  });
});
