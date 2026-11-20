import type { Matrix } from '@depboard/shared';
import { buildMatrix } from './matrix/build-matrix.js';
import type { PackageLookup, RegistryClient } from './registry/registry-client.js';
import { scanProjects, type ScanIssue, type ScanOptions } from './scanner/scan-projects.js';
import { isRegistryRange } from './versions/classify.js';

export interface AnalyzeResult {
  matrix: Matrix;
  issues: ScanIssue[];
  /** Packages whose registry lookup failed (network, timeout). Shown, never hidden. */
  failedLookups: string[];
  /** True when the advisory lookup failed for at least one version. */
  advisoriesIncomplete: boolean;
}

/**
 * The full pipeline: scan the roots, look up each unique package once, check advisories for
 * every installed version in one bulk request, and join everything into the matrix.
 */
export async function analyze(
  roots: readonly string[],
  registry: RegistryClient,
  options: ScanOptions & { now?: () => Date } = {},
): Promise<AnalyzeResult> {
  const scan = await scanProjects(roots, options);

  // Only packages declared with a plain registry range are looked up. Workspace, file, and git
  // dependencies stay on this machine.
  const lookupNames = new Set<string>();
  const installedVersions = new Map<string, Set<string>>();
  for (const project of scan.projects) {
    for (const dep of project.dependencies) {
      if (!isRegistryRange(dep.declared)) continue;
      lookupNames.add(dep.name);
      if (dep.installed !== null) {
        const set = installedVersions.get(dep.name) ?? new Set<string>();
        set.add(dep.installed);
        installedVersions.set(dep.name, set);
      }
    }
  }

  const [lookups, advisories] = await Promise.all([
    Promise.all(
      [...lookupNames].map(async (name) => [name, await registry.getPackage(name)] as const),
    ),
    registry.getAdvisories(installedVersions),
  ]);
  const packages = new Map<string, PackageLookup>(lookups);

  return {
    matrix: buildMatrix({
      projects: scan.projects,
      packages,
      advisories,
      scannedAt: options.now?.() ?? new Date(),
    }),
    issues: scan.issues,
    failedLookups: lookups.filter(([, l]) => l.status === 'failed').map(([name]) => name),
    advisoriesIncomplete: advisories.failed.size > 0,
  };
}
