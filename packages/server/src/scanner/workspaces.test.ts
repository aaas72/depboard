import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanProjects } from './scan-projects.js';
import { parsePnpmWorkspaceGlobs } from './workspaces.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function makeTree(files: Record<string, object | string>): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'depboard-ws-')));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, ...rel.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

describe('parsePnpmWorkspaceGlobs', () => {
  it.each([
    ['packages:\n  - packages/*\n  - apps/*\n', ['packages/*', 'apps/*']],
    ['packages:\n  - \'packages/*\'\n  - "!**/test/**"\n', ['packages/*', '!**/test/**']],
    ["packages: ['libs/*', 'tools/cli']\n", ['libs/*', 'tools/cli']],
    [
      '# monorepo\npackages:\n  - packages/* # all of them\ncatalog:\n  react: ^19\n',
      ['packages/*'],
    ],
    ['catalog:\n  react: ^19\n', []],
  ])('reads %j', (text, globs) => {
    expect(parsePnpmWorkspaceGlobs(text)).toEqual(globs);
  });
});

describe('monorepos', () => {
  it('merges a pnpm workspace into one project, without its internal links', async () => {
    const root = await makeTree({
      'repo/package.json': { name: 'repo', devDependencies: { typescript: '^5.6.0' } },
      'repo/pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'repo/pnpm-lock.yaml': '',
      'repo/packages/server/package.json': {
        name: '@repo/server',
        dependencies: { fastify: '^5.0.0', '@repo/shared': 'workspace:*' },
      },
      'repo/packages/shared/package.json': {
        name: '@repo/shared',
        dependencies: { zod: '^4.0.0' },
      },
      'other/package.json': { name: 'other', dependencies: { react: '^19.0.0' } },
    });
    const { projects } = await scanProjects([root]);
    expect(projects.map((p) => p.name)).toEqual(['other', 'repo']);
    const repo = projects.find((p) => p.name === 'repo');
    expect(repo?.manager).toBe('pnpm');
    expect(repo?.workspacePackages).toBe(3);
    expect(repo?.dependencies.map((d) => `${d.member ?? ''}:${d.name}`).sort()).toEqual([
      '@repo/server:fastify',
      '@repo/shared:zod',
      'repo:typescript',
    ]);
    expect(projects.find((p) => p.name === 'other')?.workspacePackages).toBeUndefined();
  });

  it('keeps folders its globs leave out, and honors negated globs, as separate projects', async () => {
    const root = await makeTree({
      'repo/package.json': {
        name: 'repo',
        workspaces: { packages: ['packages/*', '!packages/legacy'] },
      },
      'repo/packages/app/package.json': { name: 'app' },
      'repo/packages/legacy/package.json': { name: 'legacy' },
      'repo/examples/demo/package.json': { name: 'demo' },
    });
    const { projects } = await scanProjects([root]);
    expect(projects.map((p) => p.name)).toEqual(['demo', 'legacy', 'repo']);
    expect(projects.find((p) => p.name === 'repo')?.workspacePackages).toBe(2);
  });

  it('leaves a root whose globs match nothing as an ordinary project', async () => {
    const root = await makeTree({
      'repo/package.json': { name: 'repo', workspaces: ['packages/*'] },
    });
    const { projects } = await scanProjects([root]);
    expect(projects.map((p) => p.name)).toEqual(['repo']);
    expect(projects[0]?.workspacePackages).toBeUndefined();
  });
});
