import {
  compareSeverity,
  type Insight,
  type MatrixCell,
  type MatrixRow,
  type Project,
  type Severity,
  type UpdateType,
} from '@depboard/shared';

/**
 * Pure view logic for the matrix: ordering, filtering, and drift groups.
 * No React here, so every rule is unit-tested directly.
 */

export function isOutdated(type: UpdateType): boolean {
  return type === 'patch' || type === 'minor' || type === 'major';
}

const UPDATE_RANK: Record<UpdateType, number> = {
  major: 3,
  minor: 2,
  patch: 1,
  prerelease: 0,
  none: 0,
  unknown: 0,
};

/** The worst update across a row's cells: how far behind its most outdated project is. */
export function worstUpdate(row: MatrixRow): UpdateType {
  let worst: UpdateType = 'none';
  for (const cell of Object.values(row.cells)) {
    if (UPDATE_RANK[cell.updateType] > UPDATE_RANK[worst]) worst = cell.updateType;
  }
  return worst;
}

/** The highest known severity in a row, or null. */
export function rowSeverity(row: MatrixRow): Severity | null {
  let highest: Severity | null = null;
  for (const cell of Object.values(row.cells)) {
    const v = cell.vulnerability;
    if (v === null || v === 'unknown') continue;
    if (highest === null || compareSeverity(v.severity, highest) > 0) highest = v.severity;
  }
  return highest;
}

/**
 * The release line of a version, matching the server's insight rules: the major, or
 * `0.minor` before 1.0 (where SemVer allows breaking changes between minors).
 */
export function releaseLine(version: string): string {
  const [major = version, minor = '0'] = version.split('.');
  return major === '0' ? `0.${minor}` : major;
}

function compareLines(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0] = a.split('.').map(Number);
  const [bMajor = 0, bMinor = 0] = b.split('.').map(Number);
  return bMajor - aMajor || bMinor - aMinor;
}

/** Distinct release lines used in a row, highest first. */
export function rowLines(row: MatrixRow): string[] {
  const lines = new Set<string>();
  for (const cell of Object.values(row.cells)) {
    if (cell.version !== null) lines.add(releaseLine(cell.version));
  }
  return [...lines].sort(compareLines);
}

/**
 * Which drift group each cell belongs to (0 = the highest release line), so cells on
 * different lines can be told apart at a glance. Empty when the row has only one line.
 */
export function driftGroups(row: MatrixRow): Map<string, number> {
  const lines = rowLines(row);
  const groups = new Map<string, number>();
  if (lines.length < 2) return groups;
  for (const [projectId, cell] of Object.entries(row.cells)) {
    if (cell.version !== null) groups.set(projectId, lines.indexOf(releaseLine(cell.version)));
  }
  return groups;
}

/**
 * The default order (docs/ui-guidelines.md): high/critical vulnerabilities first, then drift
 * (most release lines), then most outdated (major, minor, patch), then alphabetical.
 */
export function sortRows(rows: readonly MatrixRow[]): MatrixRow[] {
  const keyed = rows.map((row) => {
    const severity = rowSeverity(row);
    return {
      row,
      danger: severity === 'critical' ? 2 : severity === 'high' ? 1 : 0,
      lines: rowLines(row).length,
      update: UPDATE_RANK[worstUpdate(row)],
    };
  });
  keyed.sort(
    (a, b) =>
      b.danger - a.danger ||
      b.lines - a.lines ||
      b.update - a.update ||
      a.row.name.localeCompare(b.row.name),
  );
  return keyed.map((k) => k.row);
}

/** A drift-strip insight the matrix is narrowed to. */
export interface Focus {
  insight: Insight;
  packages: ReadonlySet<string>;
  projectIds: ReadonlySet<string>;
}

export function focusOn(insight: Insight): Focus {
  return {
    insight,
    packages: new Set([insight.package, ...insight.related]),
    projectIds: new Set(insight.projectIds),
  };
}

export interface MatrixFilters {
  query: string;
  outdatedOnly: boolean;
  focus: Focus | null;
}

export interface MatrixView {
  rows: MatrixRow[];
  projects: Project[];
}

/**
 * Narrows the matrix. Search matches package names first; when no package matches, it
 * matches project names and shows those columns instead. Rows left with no cell in the
 * visible projects are dropped, so the view never shows an all-empty row.
 */
export function filterMatrix(
  rows: readonly MatrixRow[],
  projects: readonly Project[],
  filters: MatrixFilters,
): MatrixView {
  let visibleProjects = [...projects];
  let visibleRows = [...rows];

  const { focus } = filters;
  if (focus !== null) {
    visibleRows = visibleRows.filter((row) => focus.packages.has(row.name));
    visibleProjects = visibleProjects.filter((p) => focus.projectIds.has(p.id));
  }

  const query = filters.query.trim().toLowerCase();
  if (query !== '') {
    const byName = visibleRows.filter((row) => row.name.toLowerCase().includes(query));
    if (byName.length > 0) {
      visibleRows = byName;
    } else {
      visibleProjects = visibleProjects.filter((p) => p.name.toLowerCase().includes(query));
    }
  }

  if (filters.outdatedOnly) {
    visibleRows = visibleRows.filter((row) =>
      visibleProjects.some((p) => {
        const cell = row.cells[p.id];
        return cell !== undefined && isOutdated(cell.updateType);
      }),
    );
  }

  const ids = visibleProjects.map((p) => p.id);
  visibleRows = visibleRows.filter((row) => ids.some((id) => row.cells[id] !== undefined));
  return { rows: visibleRows, projects: visibleProjects };
}

/** What a cell shows as its version: the installed one, or the declared range when not installed. */
export function cellVersionText(cell: MatrixCell): string {
  return cell.installed ?? cell.declared;
}

/** Severity words as npm audit and GitHub Advisories print them. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  critical: 'critical',
};

/** The word on an update badge: the semver part that changed (empty for up to date: a check mark). */
export const UPDATE_LABEL: Record<UpdateType, string> = {
  none: '',
  patch: 'patch',
  minor: 'minor',
  major: 'major',
  prerelease: 'pre',
  unknown: '?',
};

export const NAME_MIN_W = 168;
export const NAME_MAX_W = 232;

/**
 * The package column's width: as wide as the longest package name needs, never narrower than
 * its header ("PACKAGE · 13 PACKAGES") and never wider than before, where longer names truncate
 * with the full name on hover. Computed over every package, so filtering doesn't make it jump.
 * About 7.5 px per character at text-sm medium, plus the cell's 24 px of padding.
 */
export function nameColumnWidth(names: readonly string[]): number {
  const longest = names.reduce((max, name) => Math.max(max, name.length), 0);
  return Math.min(NAME_MAX_W, Math.max(NAME_MIN_W, Math.ceil(longest * 7.5) + 24));
}

/** Packages up to date in every project: what "Hide up-to-date" would hide. */
export function countUpToDate(rows: readonly MatrixRow[]): number {
  return rows.filter((row) => !Object.values(row.cells).some((cell) => isOutdated(cell.updateType)))
    .length;
}
