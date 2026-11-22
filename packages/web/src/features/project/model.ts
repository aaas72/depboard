import { compareSeverity, type MatrixCell, type MatrixRow, type Severity } from '@depboard/shared';
import { isOutdated } from '../matrix/model.js';

/** One dependency of one project. */
export interface ProjectEntry {
  row: MatrixRow;
  cell: MatrixCell;
}

export interface ProjectSections {
  dependencies: ProjectEntry[];
  devDependencies: ProjectEntry[];
}

export interface ProjectStats {
  total: number;
  major: number;
  minor: number;
  patch: number;
  vulnerable: number;
  notInstalled: number;
}

const UPDATE_RANK = { major: 3, minor: 2, patch: 1, prerelease: 0, none: 0, unknown: 0 } as const;

function severityOf(cell: MatrixCell): Severity | null {
  const v = cell.vulnerability;
  return v === null || v === 'unknown' ? null : v.severity;
}

/** Most dangerous first, then most outdated, then by name: what needs attention comes first. */
function compareEntries(a: ProjectEntry, b: ProjectEntry): number {
  const sa = severityOf(a.cell);
  const sb = severityOf(b.cell);
  if (sa !== sb) {
    if (sa === null) return 1;
    if (sb === null) return -1;
    return compareSeverity(sb, sa);
  }
  return (
    UPDATE_RANK[b.cell.updateType] - UPDATE_RANK[a.cell.updateType] ||
    a.row.name.localeCompare(b.row.name)
  );
}

/**
 * A project's packages, split into dependencies and devDependencies, with the same search and
 * "Hide up-to-date" filters as the matrix.
 */
export function projectSections(
  rows: readonly MatrixRow[],
  projectId: string,
  filters: { query: string; outdatedOnly: boolean },
): ProjectSections {
  const query = filters.query.trim().toLowerCase();
  const sections: ProjectSections = { dependencies: [], devDependencies: [] };
  for (const row of rows) {
    const cell = row.cells[projectId];
    if (cell === undefined) continue;
    if (query !== '' && !row.name.toLowerCase().includes(query)) continue;
    if (filters.outdatedOnly && !isOutdated(cell.updateType)) continue;
    sections[cell.depType].push({ row, cell });
  }
  sections.dependencies.sort(compareEntries);
  sections.devDependencies.sort(compareEntries);
  return sections;
}

/** Counts over every package of the project, ignoring filters. */
export function projectStats(rows: readonly MatrixRow[], projectId: string): ProjectStats {
  const stats: ProjectStats = {
    total: 0,
    major: 0,
    minor: 0,
    patch: 0,
    vulnerable: 0,
    notInstalled: 0,
  };
  for (const row of rows) {
    const cell = row.cells[projectId];
    if (cell === undefined) continue;
    stats.total++;
    if (cell.updateType === 'major' || cell.updateType === 'minor' || cell.updateType === 'patch') {
      stats[cell.updateType]++;
    }
    if (severityOf(cell) !== null) stats.vulnerable++;
    if (cell.installed === null) stats.notInstalled++;
  }
  return stats;
}
