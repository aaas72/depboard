import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DepboardError } from '@depboard/shared';
import { makeTree, trySymlink } from '../testing/tmp-tree.js';
import { resolveRoots } from './resolve-roots.js';

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(DepboardError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('resolveRoots', () => {
  it('uses the current directory when no path is given', async () => {
    const dir = await makeTree({ 'a/.keep': '' });
    const result = await resolveRoots([], { cwd: dir, homedir: '/nonexistent-home' });
    expect(result).toEqual({ roots: [dir], includesHome: false });
  });

  it('resolves relative paths against cwd and keeps the given order', async () => {
    const dir = await makeTree({ 'work/.keep': '', 'clients/.keep': '' });
    const result = await resolveRoots(['work', 'clients'], { cwd: dir, homedir: dir });
    expect(result.roots).toEqual([path.join(dir, 'work'), path.join(dir, 'clients')]);
  });

  it('expands ~ itself, since cmd.exe and PowerShell do not', async () => {
    const home = await makeTree({ 'projects/.keep': '' });
    const result = await resolveRoots(['~/projects'], { cwd: '/', homedir: home });
    expect(result.roots).toEqual([path.join(home, 'projects')]);
  });

  it('drops a root nested inside another root', async () => {
    const dir = await makeTree({ 'work/app/.keep': '' });
    const result = await resolveRoots(['work/app', 'work'], { cwd: dir, homedir: dir });
    expect(result.roots).toEqual([path.join(dir, 'work')]);
  });

  it('handles spaces and Unicode in folder names', async () => {
    const dir = await makeTree({ 'My Projects/مشاريع/.keep': '' });
    const target = path.join(dir, 'My Projects', 'مشاريع');
    const result = await resolveRoots([target], { cwd: dir, homedir: dir });
    expect(result.roots).toEqual([target]);
  });

  it('flags the home folder so the caller asks for confirmation', async () => {
    const home = await makeTree({ '.keep': '' });
    const result = await resolveRoots(['~'], { cwd: home, homedir: home });
    expect(result.includesHome).toBe(true);
  });

  it('refuses a filesystem root', async () => {
    const driveRoot = path.parse(process.cwd()).root;
    await expectCode(
      resolveRoots([driveRoot], { cwd: driveRoot, homedir: driveRoot }),
      'ROOT_NOT_ALLOWED',
    );
  });

  it('reports a missing folder clearly', async () => {
    const dir = await makeTree({});
    await expectCode(resolveRoots(['nope'], { cwd: dir, homedir: dir }), 'ROOT_NOT_FOUND');
  });

  it('rejects a file', async () => {
    const dir = await makeTree({ 'file.txt': 'x' });
    await expectCode(resolveRoots(['file.txt'], { cwd: dir, homedir: dir }), 'ROOT_NOT_FOUND');
  });

  it('resolves symlinks to their real location', async () => {
    const dir = await makeTree({ 'real/.keep': '' });
    const link = path.join(dir, 'link');
    if (!(await trySymlink(path.join(dir, 'real'), link))) return;
    const result = await resolveRoots(['link'], { cwd: dir, homedir: dir });
    expect(result.roots).toEqual([await fs.realpath(path.join(dir, 'real'))]);
  });
});
