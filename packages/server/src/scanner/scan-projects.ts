import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import type { DependencyType, PackageManagerId, Project } from '@depboard/shared';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { isSafePackageName } from '../lib/package-name.js';
import { pathKey } from '../lib/paths.js';
import { ancestorsWithin, detectManager } from './detect-manager.js';
import { parsePackageJson } from './package-json.js';

export const DEFAULT_SCAN_DEPTH = 6;

/**
 * Folders that never contain the user's own projects, only installs, builds, caches, and other
 * ecosystems' packages. Hidden folders (`.git`, `.next`, `.venv`, `.next-verify`, …) are skipped
 * entirely, because tools keep inventing new ones and a list could never keep up.
 */
export const IGNORED_FOLDERS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
  // Python virtualenvs and installs ship package.json files for Jupyter extensions.
  'venv',
  'site-packages',
  // PHP (Composer) and other vendored copies.
  'vendor',
] as const;

const FS_CONCURRENCY = 32;

export interface ScannedDependency {
  name: string;
  declared: string;
  installed: string | null;
  depType: DependencyType;
}

export interface ScannedProject extends Project {
  dependencies: ScannedDependency[];
}

export interface ScanIssue {
  path: string;
  reason: string;
}

export interface ScanResult {
  projects: ScannedProject[];
  /** Files DepBoard skipped, reported instead of failing the whole scan. */
  issues: ScanIssue[];
}

export interface ScanOptions {
  depth?: number;
}

/** Stable, opaque id: the same folder always gets the same id, and paths never appear in URLs. */
export function projectId(projectDir: string): string {
  return createHash('sha256').update(pathKey(projectDir)).digest('hex').slice(0, 12);
}

async function findPackageJsonFiles(root: string, depth: number): Promise<string[]> {
  const files = await fg('**/package.json', {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    // Never follow symlinks: they can point outside the root or loop forever.
    followSymbolicLinks: false,
    deep: depth + 1,
    // Skip every hidden folder (see IGNORED_FOLDERS).
    dot: false,
    ignore: IGNORED_FOLDERS.map((folder) => `**/${folder}/**`),
    // Unreadable folders (permissions) are skipped instead of failing the scan.
    suppressErrors: true,
  });
  return files.map((file) => path.resolve(file));
}

async function readVersionFile(file: string): Promise<string | null> {
  try {
    const json: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (typeof json === 'object' && json !== null && 'version' in json) {
      return typeof json.version === 'string' ? json.version : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The version actually installed, or null when not installed. Follows Node's own lookup:
 * the project's node_modules first, then parent folders (npm and yarn workspaces hoist
 * dependencies to the workspace root), never above the scan root.
 */
async function readInstalledVersion(
  projectDir: string,
  dependency: string,
  boundary: string,
): Promise<string | null> {
  if (!isSafePackageName(dependency)) return null;
  for (const dir of ancestorsWithin(projectDir, boundary)) {
    const version = await readVersionFile(
      path.join(dir, 'node_modules', ...dependency.split('/'), 'package.json'),
    );
    if (version !== null) return version;
  }
  return null;
}

async function scanProject(
  file: string,
  root: string,
): Promise<{ project: ScannedProject } | { issue: ScanIssue }> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return { issue: { path: file, reason: "couldn't be read" } };
  }

  const parsed = parsePackageJson(text);
  if (!parsed.ok) return { issue: { path: file, reason: parsed.reason } };

  const dir = path.dirname(file);
  const manager: PackageManagerId = await detectManager(dir, parsed.value.packageManager, root);
  const dependencies = await mapWithConcurrency(
    parsed.value.dependencies,
    FS_CONCURRENCY,
    async (dep) => ({ ...dep, installed: await readInstalledVersion(dir, dep.name, root) }),
  );

  return {
    project: {
      id: projectId(dir),
      name: parsed.value.name ?? path.basename(dir),
      path: dir,
      manager,
      dependencies,
    },
  };
}

/**
 * Finds every project (a folder with a package.json) under the given roots.
 * Read-only: it never writes anything. A broken package.json becomes an issue, not a failure.
 */
export async function scanProjects(
  roots: readonly string[],
  options: ScanOptions = {},
): Promise<ScanResult> {
  const depth = options.depth ?? DEFAULT_SCAN_DEPTH;
  const found = (
    await Promise.all(
      roots.map(async (root) =>
        (await findPackageJsonFiles(root, depth)).map((file) => ({ file, root })),
      ),
    )
  ).flat();

  // Overlapping roots can find the same file twice.
  const unique = [...new Map(found.map((entry) => [pathKey(entry.file), entry])).values()];

  const results = await mapWithConcurrency(unique, FS_CONCURRENCY, ({ file, root }) =>
    scanProject(file, root),
  );

  const projects: ScannedProject[] = [];
  const issues: ScanIssue[] = [];
  for (const result of results) {
    if ('project' in result) projects.push(result.project);
    else issues.push(result.issue);
  }

  projects.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return { projects, issues };
}
