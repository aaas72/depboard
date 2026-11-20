import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

export type Tree = Record<string, string | object>;

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/**
 * Creates a real temporary folder tree for a test, removed automatically afterwards.
 * Object values are written as JSON, so `{ 'app/package.json': { name: 'app' } }` just works.
 */
export async function makeTree(tree: Tree): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'depboard-test-')));
  created.push(root);
  for (const [relative, content] of Object.entries(tree)) {
    const file = path.join(root, ...relative.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

/** Symlinks need admin rights or Developer Mode on Windows. Tests skip when they're unavailable. */
export async function trySymlink(target: string, link: string): Promise<boolean> {
  try {
    await fs.symlink(target, link, 'junction');
    return true;
  } catch {
    return false;
  }
}
