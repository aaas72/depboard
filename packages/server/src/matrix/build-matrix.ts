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
import type { ScannedProject } from '../scanner/scan-projects.js';
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

/** Joins scan results with registry data into the packages × projects matrix. Pure: no I/O. */
export function buildMatrix(inputs: MatrixInputs): Matrix {
  const rows = new Map<string, MatrixRow>();

  for (const project of inputs.projects) {
    for (const dep of project.dependencies) {
      let row = rows.get(dep.name);
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

      const { version, source } = comparableVersion(dep.installed, dep.declared);
      row.cells[project.id] = {
        projectId: project.id,
        declared: dep.declared,
        installed: dep.installed,
        version,
        versionSource: source,
        updateType:
          isRegistryRange(dep.declared) || dep.installed !== null
            ? classifyUpdate(version, row.latest)
            : 'unknown',
        depType: dep.depType,
        vulnerability: cellVulnerability(dep.name, version, source, inputs.advisories),
      };
    }
  }

  for (const row of rows.values()) {
    const byId = new Map<number, Advisory>();
    for (const cell of Object.values(row.cells)) {
      if (cell.version === null || cell.versionSource !== 'installed') continue;
      for (const advisory of inputs.advisories.byVersion.get(versionKey(row.name, cell.version)) ??
        []) {
        byId.set(advisory.id, advisory);
      }
    }
    row.advisories = [...byId.values()].sort(
      (a, b) => compareSeverity(b.severity, a.severity) || a.id - b.id,
    );
  }

  const projects = inputs.projects.map(({ id, name, path, manager }) => ({
    id,
    name,
    path,
    manager,
  }));
  const sortedRows = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    projects,
    rows: sortedRows,
    insights: computeInsights(projects, sortedRows),
    scannedAt: inputs.scannedAt.toISOString(),
  };
}
