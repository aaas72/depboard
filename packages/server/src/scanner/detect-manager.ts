import fs from 'node:fs/promises';
import path from 'node:path';
import { isPackageManagerId, type PackageManagerId } from '@depboard/shared';
import { isInside, isSamePath } from '../lib/paths.js';

/** Checked in this order: when a folder has several lock files, the first match wins. */
export const LOCK_FILES: readonly (readonly [file: string, manager: PackageManagerId])[] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

/** Reads `"packageManager": "pnpm@9.1.0"` (Corepack's field), the most explicit signal a project gives. */
export function managerFromField(field: unknown): PackageManagerId | null {
  if (typeof field !== 'string') return null;
  const name = field.split('@')[0];
  return isPackageManagerId(name) ? name : null;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects the project's package manager: the `packageManager` field first, then the nearest lock
 * file, and npm when neither exists.
 *
 * Packages inside a workspace (monorepo) have no lock file of their own: it sits at the workspace
 * root. So the search walks up to the parent folders, but never above `boundary` (the scan root the
 * user chose). Getting this wrong is harmful: running `npm install` inside a pnpm workspace breaks it.
 */
export async function detectManager(
  projectDir: string,
  packageManagerField: unknown,
  boundary: string = projectDir,
): Promise<PackageManagerId> {
  const fromField = managerFromField(packageManagerField);
  if (fromField) return fromField;

  for (const dir of ancestorsWithin(projectDir, boundary)) {
    for (const [file, manager] of LOCK_FILES) {
      if (await exists(path.join(dir, file))) return manager;
    }
  }
  return 'npm';
}

/** `dir`, then each parent folder, stopping at `boundary` (inclusive). Never leaves `boundary`. */
export function ancestorsWithin(dir: string, boundary: string): string[] {
  if (!isInside(boundary, dir)) return [];
  const chain: string[] = [];
  let current = path.resolve(dir);
  for (;;) {
    chain.push(current);
    if (isSamePath(current, boundary)) return chain;
    const parent = path.dirname(current);
    if (parent === current) return chain;
    current = parent;
  }
}
