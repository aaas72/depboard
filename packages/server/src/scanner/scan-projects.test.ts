import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTree, trySymlink } from '../testing/tmp-tree.js';
import { isSafePackageName } from '../lib/package-name.js';
import { projectId, scanProjects } from './scan-projects.js';

describe('scanProjects', () => {
  it('finds projects with their manager and installed versions', async () => {
    const root = await makeTree({
      'web/package.json': { name: 'web', dependencies: { react: '^18.2.0' } },
      'web/package-lock.json': '{}',
      'web/node_modules/react/package.json': { name: 'react', version: '18.3.1' },
      'api/package.json': { name: 'api', devDependencies: { typescript: '^5.0.0' } },
      'api/pnpm-lock.yaml': '',
    });

    const { projects, issues } = await scanProjects([root]);

    expect(issues).toEqual([]);
    expect(projects.map((p) => [p.name, p.manager])).toEqual([
      ['api', 'pnpm'],
      ['web', 'npm'],
    ]);
    const web = projects.find((p) => p.name === 'web');
    expect(web?.dependencies).toEqual([
      { name: 'react', declared: '^18.2.0', installed: '18.3.1', depType: 'dependencies' },
    ]);
    const api = projects.find((p) => p.name === 'api');
    expect(api?.dependencies[0]?.installed).toBeNull();
  });

  it('reads installed versions of scoped packages', async () => {
    const root = await makeTree({
      'app/package.json': { name: 'app', devDependencies: { '@types/node': '^20.0.0' } },
      'app/node_modules/@types/node/package.json': { version: '20.19.1' },
    });
    const { projects } = await scanProjects([root]);
    expect(projects[0]?.dependencies[0]?.installed).toBe('20.19.1');
  });

  it('never scans node_modules, build output, or .git', async () => {
    const root = await makeTree({
      'app/package.json': { name: 'app' },
      'app/node_modules/lib/package.json': { name: 'lib' },
      'app/dist/package.json': { name: 'dist-copy' },
      'app/.next/package.json': { name: 'next-copy' },
      '.git/package.json': { name: 'git-copy' },
    });
    const { projects } = await scanProjects([root]);
    expect(projects.map((p) => p.name)).toEqual(['app']);
  });

  // Regressions found by running DepBoard on a real projects folder.
  it('skips hidden folders, Python virtualenvs, and generated build folders', async () => {
    const root = await makeTree({
      'app/package.json': { name: 'app' },
      'app/.next-verify/package.json': { name: '.next-verify' },
      'app/.next/types/package.json': { name: 'types' },
      'py/.venv/share/jupyter/labextensions/ext/package.json': { name: 'jupyterlab-ext' },
      'py/venv/Lib/site-packages/plotly/labextension/package.json': { name: 'plotly-ext' },
      'php/vendor/lib/package.json': { name: 'vendored' },
    });
    const { projects } = await scanProjects([root]);
    expect(projects.map((p) => p.name)).toEqual(['app']);
  });

  it('uses the workspace lock file for packages inside a monorepo', async () => {
    const root = await makeTree({
      'mono/package.json': { name: 'mono' },
      'mono/pnpm-lock.yaml': '',
      'mono/packages/server/package.json': { name: '@mono/server' },
    });
    const { projects } = await scanProjects([root]);
    expect(projects.find((p) => p.name === '@mono/server')?.manager).toBe('pnpm');
  });

  it('shows a monorepo as one project, reading versions hoisted to its root', async () => {
    const root = await makeTree({
      'mono/package.json': { name: 'mono', workspaces: ['packages/*'] },
      'mono/package-lock.json': '{}',
      'mono/node_modules/react/package.json': { version: '19.1.0' },
      'mono/packages/web/package.json': { name: 'web', dependencies: { react: '^19.0.0' } },
    });
    const { projects } = await scanProjects([root]);
    expect(projects.map((p) => p.name)).toEqual(['mono']);
    expect(projects[0]?.workspacePackages).toBe(2);
    expect(projects[0]?.dependencies).toEqual([
      {
        name: 'react',
        declared: '^19.0.0',
        installed: '19.1.0',
        depType: 'dependencies',
        member: 'web',
      },
    ]);
  });

  it('never looks above the scan root for lock files or installed versions', async () => {
    const outer = await makeTree({
      'pnpm-lock.yaml': '',
      'node_modules/react/package.json': { version: '1.0.0' },
      'root/app/package.json': { name: 'app', dependencies: { react: '^18.0.0' } },
    });
    const { projects } = await scanProjects([path.join(outer, 'root')]);
    expect(projects[0]?.manager).toBe('npm');
    expect(projects[0]?.dependencies[0]?.installed).toBeNull();
  });

  it('respects the depth limit', async () => {
    const root = await makeTree({
      'a/package.json': { name: 'level-1' },
      'a/b/c/package.json': { name: 'level-3' },
    });
    expect((await scanProjects([root], { depth: 2 })).projects.map((p) => p.name)).toEqual([
      'level-1',
    ]);
    expect((await scanProjects([root], { depth: 3 })).projects).toHaveLength(2);
  });

  it('reports a broken package.json as an issue and keeps scanning', async () => {
    const root = await makeTree({
      'good/package.json': { name: 'good' },
      'broken/package.json': '{ oops',
    });
    const { projects, issues } = await scanProjects([root]);
    expect(projects.map((p) => p.name)).toEqual(['good']);
    expect(issues).toEqual([
      { path: path.join(root, 'broken', 'package.json'), reason: 'not valid JSON' },
    ]);
  });

  it('falls back to the folder name for an unnamed project', async () => {
    const root = await makeTree({ 'my-side-project/package.json': {} });
    expect((await scanProjects([root])).projects[0]?.name).toBe('my-side-project');
  });

  it('works with spaces and Arabic folder names', async () => {
    const root = await makeTree({ 'عميل أ/موقع/package.json': { name: 'site' } });
    const { projects } = await scanProjects([root]);
    expect(projects[0]?.path).toBe(path.join(root, 'عميل أ', 'موقع'));
  });

  it('does not report the same project twice from overlapping roots', async () => {
    const root = await makeTree({ 'app/package.json': { name: 'app' } });
    const { projects } = await scanProjects([root, path.join(root, 'app')]);
    expect(projects).toHaveLength(1);
  });

  it('does not follow symlinks out of the root', async () => {
    const outside = await makeTree({ 'secret/package.json': { name: 'outside' } });
    const root = await makeTree({ 'app/package.json': { name: 'app' } });
    if (!(await trySymlink(path.join(outside, 'secret'), path.join(root, 'link')))) return;
    const { projects } = await scanProjects([root]);
    expect(projects.map((p) => p.name)).toEqual(['app']);
  });

  it('never reads outside node_modules for a crafted dependency name', async () => {
    const root = await makeTree({
      'app/package.json': { name: 'app', dependencies: { '../../secret': '1.0.0' } },
      'secret/package.json': { version: '6.6.6' },
    });
    const { projects } = await scanProjects([root]);
    expect(projects.find((p) => p.name === 'app')?.dependencies[0]?.installed).toBeNull();
  });

  it('is read-only', async () => {
    const root = await makeTree({ 'app/package.json': { name: 'app' } });
    const writes = [
      vi.spyOn(fs, 'writeFile'),
      vi.spyOn(fs, 'mkdir'),
      vi.spyOn(fs, 'rm'),
      vi.spyOn(fs, 'rename'),
    ];
    await scanProjects([root]);
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('projectId', () => {
  it('is stable and opaque', () => {
    const id = projectId('/home/me/projects/app');
    expect(id).toBe(projectId('/home/me/projects/app'));
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(id).not.toContain('app');
  });
});

describe('isSafePackageName', () => {
  it.each(['react', '@types/node', 'lodash.merge', 'left-pad', 'JSONStream', '@scope/a_b'])(
    'accepts %s',
    (name) => {
      expect(isSafePackageName(name)).toBe(true);
    },
  );

  it.each(['../x', '..', '.', '@scope/../x', 'a/b', 'a\\b', '@/x', '', 'a b'])(
    'rejects %s',
    (name) => {
      expect(isSafePackageName(name)).toBe(false);
    },
  );
});
