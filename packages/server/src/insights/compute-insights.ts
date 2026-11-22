import semver from 'semver';
import {
  compareSeverity,
  type Insight,
  type MajorLagInsight,
  type MatrixRow,
  type Project,
  type Severity,
  type VersionDriftInsight,
  type VulnerableSpreadInsight,
} from '@depboard/shared';

/**
 * Scores only order insights. The bands encode the product's priorities (docs/architecture.md, Insights):
 * high and critical vulnerabilities always come first, then version drift, then moderate/low
 * vulnerabilities, then major lag. Within a band, more projects and bigger gaps rank higher.
 */
const SEVERITY_BAND: Record<Severity, number> = {
  critical: 10_000,
  high: 8_000,
  moderate: 3_000,
  low: 1_000,
};
const DRIFT_BAND = 5_000;
const LAG_BAND = 500;

/** The part of a version where SemVer allows breaking changes: "18", or "0.3" before 1.0. */
export function releaseLine(version: string): string | null {
  const parsed = semver.parse(version);
  if (!parsed) return null;
  return parsed.major === 0 ? `0.${parsed.minor}` : String(parsed.major);
}

function compareLinesDesc(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0] = a.split('.').map(Number);
  const [bMajor = 0, bMinor = 0] = b.split('.').map(Number);
  return bMajor - aMajor || bMinor - aMinor;
}

function vulnerableSpread(
  row: MatrixRow,
  sortIds: (ids: string[]) => string[],
): VulnerableSpreadInsight | null {
  let severity: Severity | null = null;
  const projectIds: string[] = [];
  for (const cell of Object.values(row.cells)) {
    if (cell.vulnerability === null || cell.vulnerability === 'unknown') continue;
    projectIds.push(cell.projectId);
    if (severity === null || compareSeverity(cell.vulnerability.severity, severity) > 0) {
      severity = cell.vulnerability.severity;
    }
  }
  if (severity === null) return null;
  return {
    kind: 'vulnerable-spread',
    package: row.name,
    related: [],
    severity,
    projectIds: sortIds(projectIds),
    advisories: row.advisories.map(({ id, title, url, severity: s }) => ({
      id,
      title,
      url,
      severity: s,
    })),
    score: SEVERITY_BAND[severity] + projectIds.length * 10,
  };
}

function versionDrift(
  row: MatrixRow,
  sortIds: (ids: string[]) => string[],
): VersionDriftInsight | null {
  // Installed versions only: a declared range is a guess, and a guess can't prove a difference.
  // Prereleases are left out: being on a release candidate is a choice, not drift.
  const cells = Object.values(row.cells).filter(
    (cell) =>
      cell.versionSource === 'installed' &&
      cell.version !== null &&
      semver.prerelease(cell.version) === null,
  );
  const lines = new Set<string>();
  const versions = new Set<string>();
  for (const cell of cells) {
    const line = cell.version === null ? null : releaseLine(cell.version);
    if (line === null || cell.version === null) continue;
    lines.add(line);
    versions.add(cell.version);
  }
  if (lines.size < 2) return null;

  return {
    kind: 'version-drift',
    package: row.name,
    related: [],
    lines: [...lines].sort(compareLinesDesc),
    versions: [...versions].sort(semver.rcompare),
    projectIds: sortIds(cells.map((cell) => cell.projectId)),
    score: DRIFT_BAND + lines.size * 100 + cells.length * 10,
  };
}

function majorLag(row: MatrixRow, sortIds: (ids: string[]) => string[]): MajorLagInsight | null {
  if (row.latest === null) return null;
  const latestMajor = semver.major(row.latest);
  const behind = Object.values(row.cells).filter((cell) => cell.updateType === 'major');
  if (behind.length < 2) return null;

  const majorsBehind = Math.max(
    ...behind.map((cell) => (cell.version === null ? 0 : latestMajor - semver.major(cell.version))),
  );
  return {
    kind: 'major-lag',
    package: row.name,
    related: [],
    latest: row.latest,
    majorsBehind,
    projectIds: sortIds(behind.map((cell) => cell.projectId)),
    score: LAG_BAND + behind.length * 10 + majorsBehind * 20,
  };
}

/** "@angular/core" → "@angular". Unscoped packages have no family. */
function scopeOf(name: string): string | null {
  return name.startsWith('@') ? (name.split('/')[0] ?? null) : null;
}

/** What makes two insights "the same story": same kind, same scope, same shape, same projects. */
function familyKey(insight: Insight): string | null {
  const scope = scopeOf(insight.package);
  if (scope === null) return null;
  const projects = insight.projectIds.join(',');
  switch (insight.kind) {
    case 'version-drift':
      return `drift|${scope}|${insight.lines.join(',')}|${projects}`;
    case 'major-lag':
      return `lag|${scope}|${String(insight.majorsBehind)}|${projects}`;
    case 'vulnerable-spread':
      // Never merged: each package has its own advisories and its own fix.
      return null;
  }
}

/**
 * Folds insights of one scope that tell exactly the same story into one, e.g. eight
 * `@angular/*` packages on the same three majors in the same four projects.
 */
function groupFamilies(insights: Insight[]): Insight[] {
  const groups = new Map<string, Insight[]>();
  const result: Insight[] = [];
  for (const insight of insights) {
    const key = familyKey(insight);
    if (key === null) {
      result.push(insight);
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(insight);
    else {
      const fresh = [insight];
      groups.set(key, fresh);
      result.push(insight); // placeholder, replaced below by the merged insight
    }
  }
  return result.map((insight) => {
    const key = familyKey(insight);
    const group = key === null ? undefined : groups.get(key);
    if (!group || group.length === 1) return insight;
    const [first, ...rest] = [...group].sort((a, b) => a.package.localeCompare(b.package));
    if (!first) return insight;
    // A whole family on the same story is a bigger signal than one package.
    return { ...first, related: rest.map((r) => r.package), score: first.score + rest.length * 5 };
  });
}

const KIND_ORDER: Record<Insight['kind'], number> = {
  'vulnerable-spread': 0,
  'version-drift': 1,
  'major-lag': 2,
};

/**
 * Finds what's hiding across all projects. Pure and deterministic: the same matrix always
 * yields the same insights in the same order. A wrong insight costs more trust than a missing
 * one, so every rule only reports what the data proves.
 */
export function computeInsights(
  projects: readonly Project[],
  rows: readonly MatrixRow[],
): Insight[] {
  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  const sortIds = (ids: string[]) =>
    [...new Set(ids)].sort((a, b) => (nameOf.get(a) ?? a).localeCompare(nameOf.get(b) ?? b));

  const insights: Insight[] = [];
  for (const row of [...rows].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const insight of [
      vulnerableSpread(row, sortIds),
      versionDrift(row, sortIds),
      majorLag(row, sortIds),
    ]) {
      if (insight) insights.push(insight);
    }
  }

  return groupFamilies(insights).sort(
    (a, b) =>
      b.score - a.score ||
      a.package.localeCompare(b.package) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}

// Headline picking is shared with the UI: it lives in @depboard/shared.
export { MAX_HEADLINES_PER_KIND, pickHeadlines } from '@depboard/shared';
