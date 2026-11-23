import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { pathKey } from '../lib/paths.js';
import type { ScannedProject } from './scan-projects.js';

/**
 * Monorepos: a root package.json with `workspaces` (npm, yarn, bun) or a pnpm-workspace.yaml,
 * plus the workspace packages its globs select. DepBoard shows a monorepo as ONE project, the way
 * its owner thinks of it, instead of one column per internal package.
 */

/**
 * The `packages:` globs of a pnpm-workspace.yaml. Only that one list is read, with a small line
 * parser: a full YAML parser would be a dependency for a handful of strings.
 */
export function parsePnpmWorkspaceGlobs(text: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (/^\S/.test(line)) {
      inPackages = /^packages\s*:/.test(line);
      // The flow form: packages: ['apps/*', 'libs/*']
      const inline = /^packages\s*:\s*\[(.*)\]\s*$/.exec(line);
      if (inline?.[1] !== undefined) {
        globs.push(...inline[1].split(',').map(unquote));
        inPackages = false;
      }
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s*-\s*(.+)$/.exec(line);
    if (item?.[1] !== undefined) globs.push(unquote(item[1]));
  }
  return globs.filter((glob) => glob.length > 0);
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

/** The pnpm-workspace.yaml globs in a folder, or null when it has none. */
export async function readPnpmWorkspaceGlobs(dir: string): Promise<string[] | null> {
  try {
    return parsePnpmWorkspaceGlobs(
      await fs.readFile(path.join(dir, 'pnpm-workspace.yaml'), 'utf8'),
    );
  } catch {
    return null;
  }
}

/** The package.json files a root's workspace globs select; globs starting with `!` exclude. */
export async function findWorkspaceManifests(
  rootDir: string,
  globs: readonly string[],
): Promise<Set<string>> {
  const patterns = globs.map((glob) => {
    const negated = glob.startsWith('!');
    const body = (negated ? glob.slice(1) : glob)
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/+$/, '');
    return `${negated ? '!' : ''}${body}/package.json`;
  });
  const files = await fg(patterns, {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**'],
    suppressErrors: true,
  });
  return new Set(files.map((file) => pathKey(path.resolve(file))));
}

/**
 * One project for a monorepo: the root's name, path, and manager, with the dependencies of the
 * root and every workspace package. Dependencies between its own packages are internal links,
 * not npm packages, so they are left out.
 */
export function mergeWorkspace(
  root: ScannedProject,
  members: readonly ScannedProject[],
): ScannedProject {
  const internal = new Set([root.name, ...members.map((member) => member.name)]);
  const dependencies = [root, ...members].flatMap((pkg) =>
    pkg.dependencies
      .filter((dep) => !internal.has(dep.name))
      .map((dep) => ({ ...dep, member: pkg.name })),
  );
  return { ...root, dependencies, workspacePackages: members.length + 1 };
}

/** A scanned project and the workspace globs it declares, when it is a monorepo root. */
export interface ProjectWithGlobs {
  project: ScannedProject;
  globs: string[] | null;
}

/**
 * Folds workspace packages into their monorepo root. Outer roots claim first, so a package is
 * never counted in two monorepos. A root whose globs match nothing stays an ordinary project.
 */
export async function groupWorkspaces(
  found: readonly ProjectWithGlobs[],
): Promise<ScannedProject[]> {
  const roots = found
    .filter(
      (entry): entry is { project: ScannedProject; globs: string[] } =>
        entry.globs !== null && entry.globs.length > 0,
    )
    .sort((a, b) => a.project.path.length - b.project.path.length);
  const byManifest = new Map(
    found.map((entry) => [pathKey(path.join(entry.project.path, 'package.json')), entry.project]),
  );

  const claimed = new Set<string>();
  const merged = new Map<string, ScannedProject>();
  for (const { project: root, globs } of roots) {
    if (claimed.has(root.id)) continue;
    const members: ScannedProject[] = [];
    for (const manifest of await findWorkspaceManifests(root.path, globs)) {
      const member = byManifest.get(manifest);
      if (member === undefined || member.id === root.id || claimed.has(member.id)) continue;
      members.push(member);
    }
    if (members.length === 0) continue;
    for (const member of members) claimed.add(member.id);
    claimed.add(root.id);
    merged.set(root.id, mergeWorkspace(root, members));
  }

  return found
    .map((entry) => merged.get(entry.project.id) ?? entry.project)
    .filter((project) => merged.has(project.id) || !claimed.has(project.id));
}
