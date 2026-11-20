import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTree } from '../testing/tmp-tree.js';
import { suggestRoots } from './suggest-roots.js';

describe('suggestRoots', () => {
  it('lists only common folders that exist', async () => {
    const home = await makeTree({ 'projects/.keep': '', 'code/.keep': '', 'music/.keep': '' });
    const suggestions = await suggestRoots(home);
    expect(suggestions.map((s) => path.basename(s)).sort()).toEqual(['code', 'projects']);
  });

  it('ignores a file that happens to have a common name', async () => {
    const home = await makeTree({ dev: 'not a folder' });
    expect(await suggestRoots(home)).toEqual([]);
  });

  it('never reads inside the suggested folders', async () => {
    const home = await makeTree({ 'projects/app/package.json': { name: 'app' } });
    const readdir = vi.spyOn(fs, 'readdir');
    const readFile = vi.spyOn(fs, 'readFile');
    await suggestRoots(home);
    expect(readdir).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
