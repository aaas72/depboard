import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRegistryClient, type RegistryClient } from '@depboard/server';
import {
  EXIT_OK,
  EXIT_RUNTIME_ERROR,
  EXIT_USAGE_ERROR,
  run,
  type CliIO,
  type ServeOptions,
} from './run.js';

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

/** A tiny in-memory registry: `latest` per package, advisories per package. No network. */
function stubRegistry(
  latest: Record<string, string> = {},
  advisories: Record<string, object[]> = {},
): RegistryClient {
  return createRegistryClient({
    fetch: (url, init) => {
      if (init?.method === 'POST') {
        const body = typeof init.body === 'string' ? init.body : '{}';
        const asked = JSON.parse(body) as Record<string, string[]>;
        return Promise.resolve(
          Response.json(
            Object.fromEntries(Object.keys(asked).map((n) => [n, advisories[n] ?? []])),
          ),
        );
      }
      const name = decodeURIComponent(/\/([^/]+)\/latest$/.exec(url)?.[1] ?? '');
      const version = latest[name];
      return Promise.resolve(
        version ? Response.json({ name, version }) : new Response('not found', { status: 404 }),
      );
    },
  });
}

function io(overrides: Partial<CliIO> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const served: ServeOptions[] = [];
  const opened: string[] = [];
  const value: CliIO = {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    cwd: process.cwd(),
    homedir: '/nonexistent-home',
    version: '1.2.3',
    confirm: null,
    registry: stubRegistry(),
    startServer: (options) => {
      served.push(options);
      return Promise.resolve({ url: 'http://127.0.0.1:4319/?token=t' });
    },
    openBrowser: (url) => opened.push(url),
    staticDir: undefined,
    ...overrides,
  };
  return { value, out, err, served, opened };
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

  it('summarizes outdated and vulnerable packages across projects', async () => {
    const root = await tree({
      'web/package.json': { name: 'web', dependencies: { react: '^18.0.0', lodash: '^4.0.0' } },
      'web/node_modules/react/package.json': { version: '18.3.1' },
      'web/node_modules/lodash/package.json': { version: '4.17.15' },
      'api/package.json': { name: 'api', dependencies: { lodash: '^4.0.0' } },
      'api/node_modules/lodash/package.json': { version: '4.17.15' },
    });
    const registry = stubRegistry(
      { react: '19.1.0', lodash: '4.17.21' },
      {
        lodash: [
          { id: 1, title: 't', url: 'u', severity: 'high', vulnerable_versions: '<4.17.21' },
        ],
      },
    );
    const t = io({ cwd: root, registry });
    expect(await run(['--summary'], t.value)).toBe(EXIT_OK);
    expect(t.out).toEqual([
      expect.stringContaining('2 projects · 2 packages'),
      '',
      "What's hiding in your projects:",
      '  ● lodash has a high vulnerability in 2 projects',
      '      api, web',
      '',
      '  2 packages outdated: 1 major · 0 minor · 1 patch',
      '  1 package with known vulnerabilities',
    ]);
  });

  it('says so plainly when nothing is hiding', async () => {
    const root = await tree({
      'web/package.json': { name: 'web', dependencies: { react: '^19.0.0' } },
      'web/node_modules/react/package.json': { version: '19.1.0' },
      'api/package.json': { name: 'api', dependencies: { react: '^19.0.0' } },
      'api/node_modules/react/package.json': { version: '19.1.0' },
    });
    const t = io({ cwd: root, registry: stubRegistry({ react: '19.1.0' }) });
    await run([], t.value);
    expect(t.out).toContain(
      '✔ Nothing hiding: shared packages agree and no known vulnerabilities were found.',
    );
  });

  it('keeps working offline and says what is unknown', async () => {
    const root = await tree({
      'web/package.json': { name: 'web', dependencies: { react: '^18.0.0' } },
      'web/node_modules/react/package.json': { version: '18.3.1' },
      'api/package.json': { name: 'api', dependencies: { react: '^18.0.0' } },
    });
    const offline = createRegistryClient({ fetch: () => Promise.reject(new TypeError('offline')) });
    const t = io({ cwd: root, registry: offline });
    expect(await run([], t.value)).toBe(EXIT_OK);
    expect(t.out[0]).toContain('2 projects · 1 package');
    expect(t.err.join('\n')).toContain("Couldn't reach the npm registry for 1 package");
    expect(t.err.join('\n')).toContain('not safe');
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

  describe('server', () => {
    async function twoProjects() {
      return tree({
        'web/package.json': { name: 'web', dependencies: { react: '^18.0.0' } },
        'api/package.json': { name: 'api', dependencies: { react: '^18.0.0' } },
      });
    }

    it('starts the server with the analysis it already ran, and prints the launch URL', async () => {
      const root = await twoProjects();
      const t = io({ cwd: root });
      expect(await run(['--port', '5000', '--depth', '3'], t.value)).toBe(EXIT_OK);
      expect(t.served).toHaveLength(1);
      expect(t.served[0]).toMatchObject({ roots: [root], port: 5000, depth: 3 });
      expect(t.served[0]?.initial.matrix.projects).toHaveLength(2);
      expect(t.out).toContain('  ➜ Open: http://127.0.0.1:4319/?token=t');
    });

    it('opens the browser when the UI ships with the build', async () => {
      const t = io({ cwd: await twoProjects(), staticDir: '/ui' });
      await run([], t.value);
      expect(t.opened).toEqual(['http://127.0.0.1:4319/?token=t']);
    });

    it('does not open the browser with --no-open', async () => {
      const t = io({ cwd: await twoProjects(), staticDir: '/ui' });
      await run(['--no-open'], t.value);
      expect(t.served).toHaveLength(1);
      expect(t.opened).toEqual([]);
    });

    it('does not open a browser to a page that does not exist yet', async () => {
      const t = io({ cwd: await twoProjects(), staticDir: undefined });
      await run([], t.value);
      expect(t.opened).toEqual([]);
    });

    it('starts nothing with --summary', async () => {
      const t = io({ cwd: await twoProjects(), staticDir: '/ui' });
      await run(['--summary'], t.value);
      expect(t.served).toEqual([]);
      expect(t.opened).toEqual([]);
    });

    it('starts nothing when no projects were found', async () => {
      const empty = await tree({});
      const t = io({ cwd: empty });
      await run([], t.value);
      expect(t.served).toEqual([]);
    });
  });
});
