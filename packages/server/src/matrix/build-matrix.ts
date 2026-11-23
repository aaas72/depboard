import {
  compareSeverity,
  type Advisory,
  type CellVulnerability,
  type Matrix,
  type MatrixCell,
  type MatrixRow,
} from '@depboard/shared';
import { computeInsights } from '../insights/compute-insights.js';
import type { AdvisoryLookup, PackageLookup } from '../registry/registry-client.js';
import { versionKey } from '../registry/registry-client.js';
import semver from 'semver';
import type { ScannedDependency, ScannedProject } from '../scanner/scan-projects.js';
import { classifyUpdate, comparableVersion, isRegistryRange } from '../versions/classify.js';

export interface MatrixInputs {
  projects: readonly ScannedProject[];
  packages: ReadonlyMap<string, PackageLookup>;
  advisories: AdvisoryLookup;
  scannedAt: Date;
}

function cellVulnerability(
  name: string,
  version: string | null,
  source: 'installed' | 'declared',
  advisories: AdvisoryLookup,
): MatrixCell['vulnerability'] {
  // Only an exact, installed version can be checked honestly. A range floor might be
  // vulnerable while the version actually used isn't, or the other way round.
  if (version === null || source !== 'installed') return 'unknown';
  const key = versionKey(name, version);
  if (advisories.failed.has(key)) return 'unknown';
  const found = advisories.byVersion.get(key);
  if (found === undefined) return 'unknown';
  if (found.length === 0) return null;

  const severity = found
    .map((a) => a.severity)
    .reduce((highest, s) => (compareSeverity(s, highest) > 0 ? s : highest));
  const vulnerability: CellVulnerability = {
    severity,
    count: found.length,
    advisoryIds: found.map((a) => a.id),
  };
  return vulnerability;
}

const SEVERITY_RISK = { critical: 4, high: 3, moderate: 2, low: 1 } as const;
const UPDATE_RISK = { major: 3, minor: 2, patch: 1, prerelease: 0, none: 0, unknown: 0 } as const;

/**
 * In a monorepo, packages can use one dependency at different versions. The cell shows the most
 * at-risk one: the worst vulnerability, then the furthest behind, then the oldest version.
 */
function mostAtRisk(cells: readonly MatrixCell[]): MatrixCell {
  const risk = (cell: MatrixCell) => {
    const v = cell.vulnerability;
    return [
      v !== null && v !== 'unknown' ? SEVERITY_RISK[v.severity] : 0,
      UPDATE_RISK[cell.updateType],
    ] as const;
  };
  return cells.reduce((worst, cell) => {
    const [ws, wu] = risk(worst);
    const [cs, cu] = risk(cell);
    if (cs !== ws) return cs > ws ? cell : worst;
    if (cu !== wu) return cu > wu ? cell : worst;
    if (
      cell.version !== null &&
      worst.version !== null &&
      semver.valid(cell.version) &&
      semver.valid(worst.version)
    ) {
      return semver.lt(cell.version, worst.version) ? cell : worst;
    }
    return worst;
  });
}

/** Joins scan results with registry data into the packages × projects matrix. Pure: no I/O. */
export function buildMatrix(inputs: MatrixInputs): Matrix {
  const rows = new Map<string, MatrixRow>();

  for (const project of inputs.projects) {
    // A monorepo can declare one dependency in several of its packages.
    const byName = new Map<string, ScannedDependency[]>();
    for (const dep of project.dependencies) {
      const same = byName.get(dep.name);
      if (same) same.push(dep);
      else byName.set(dep.name, [dep]);
    }
    for (const [name, deps] of byName) {
      const dep = deps[0];
      if (dep === undefined) continue;
      let row = rows.get(name);
      if (!row) {
        const lookup = inputs.packages.get(dep.name);
        row = {
          name: dep.name,
          latest: lookup?.status === 'ok' ? lookup.info.latest : null,
          lookup: lookup === undefined ? 'skipped' : lookup.status === 'ok' ? 'ok' : lookup.status,
          cells: {},
          advisories: [],
        };
        rows.set(dep.name, row);
      }

      const latest = row.latest;
      const cells = deps.map((d): MatrixCell => {
        const { version, source } = comparableVersion(d.installed, d.declared);
        return {
          projectId: project.id,
          declared: d.declared,
          installed: d.installed,
          version,
          versionSource: source,
          updateType:
            isRegistryRange(d.declared) || d.installed !== null
              ? classifyUpdate(version, latest)
              : 'unknown',
          depType: d.depType,
          vulnerability: cellVulnerability(name, version, source, inputs.advisories),
        };
      });
      const cell = mostAtRisk(cells);
      const distinct = new Set(deps.map((d) => `${d.declared} ${d.installed ?? ''}`));
      if (distinct.size > 1) {
        cell.variants = deps.map((d) => ({
          member: d.member ?? project.name,
          declared: d.declared,
          installed: d.installed,
        }));
      }
      row.cells[project.id] = cell;
    }
  }

  for (const row of rows.values()) {
    const byId = new Map<number, Advisory>();
    for (const cell of Object.values(row.cells)) {
      // Every installed version counts, a monorepo's other variants included.
      const versions = new Set<string>();
      if (cell.version !== null && cell.versionSource === 'installed') versions.add(cell.version);
      for (const variant of cell.variants ?? []) {
        if (variant.installed !== null) versions.add(variant.installed);
      }
      for (const version of versions) {
        for (const advisory of inputs.advisories.byVersion.get(versionKey(row.name, version)) ??
          []) {
          byId.set(advisory.id, advisory);
        }
      }
    }
    row.advisories = [...byId.values()].sort(
      (a, b) => compareSeverity(b.severity, a.severity) || a.id - b.id,
    );
  }

  const projects = inputs.projects.map(({ id, name, path, manager, workspacePackages }) => ({
    id,
    name,
    path,
    manager,
    ...(workspacePackages === undefined ? {} : { workspacePackages }),
  }));
  const sortedRows = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    projects,
    rows: sortedRows,
    insights: computeInsights(projects, sortedRows),
    scannedAt: inputs.scannedAt.toISOString(),
  };
}
