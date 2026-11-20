import fs from 'node:fs/promises';
import path from 'node:path';
import { pathKey } from '../lib/paths.js';

/** Folder names developers commonly keep their projects in, relative to the home folder. */
export const COMMON_PROJECT_FOLDERS = [
  'projects',
  'Projects',
  'dev',
  'code',
  'Code',
  'src',
  'repos',
  'workspace',
  path.join('Documents', 'GitHub'),
] as const;

/**
 * Lists common project folders that exist, to suggest when a scan finds nothing.
 * It only checks that each folder exists. It never reads or scans them (see security.md).
 */
export async function suggestRoots(homedir: string): Promise<string[]> {
  const candidates = COMMON_PROJECT_FOLDERS.map((name) => path.join(homedir, name));
  const checks = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return (await fs.stat(candidate)).isDirectory() ? candidate : null;
      } catch {
        return null;
      }
    }),
  );

  // `projects` and `Projects` are the same folder on case-insensitive file systems.
  const seen = new Set<string>();
  const found: string[] = [];
  for (const candidate of checks) {
    if (candidate === null) continue;
    const key = pathKey(await fs.realpath(candidate));
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(candidate);
  }
  return found;
}
