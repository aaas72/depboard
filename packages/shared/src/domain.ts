export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;
export type PackageManagerId = (typeof PACKAGE_MANAGERS)[number];

export type UpdateType = 'none' | 'patch' | 'minor' | 'major' | 'prerelease' | 'unknown';

export const SEVERITIES = ['low', 'moderate', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export type DependencyType = 'dependencies' | 'devDependencies';

export interface Project {
  /** Stable hash of the absolute path. Never use the path itself as an identifier. */
  id: string;
  name: string;
  path: string;
  manager: PackageManagerId;
  /**
   * Set for a monorepo shown as one project: how many package.json files (the root and its
   * workspace packages) it brings together.
   */
  workspacePackages?: number;
}

export interface Advisory {
  id: number;
  title: string;
  url: string;
  severity: Severity;
  /** semver range of affected versions, e.g. "<4.17.21". */
  vulnerableVersions: string;
}

export interface CellVulnerability {
  severity: Severity;
  count: number;
  advisoryIds: number[];
}

/**
 * Where a cell's version comes from:
 * - `installed`: read from node_modules (exact)
 * - `declared`: not installed, so the lowest version the package.json range allows (an estimate)
 */
export type VersionSource = 'installed' | 'declared';

export interface MatrixCell {
  projectId: string;
  /** The range written in package.json, e.g. "^18.2.0". */
  declared: string;
  /** The version found in node_modules, or null when not installed. */
  installed: string | null;
  /** The version used for comparisons, or null when it can't be determined. */
  version: string | null;
  versionSource: VersionSource;
  updateType: UpdateType;
  depType: DependencyType;
  /**
   * null = no known advisory for this exact version.
   * 'unknown' = can't tell: the lookup failed, or the exact version isn't known (not installed).
   */
  vulnerability: CellVulnerability | null | 'unknown';
  /**
   * In a monorepo, when several of its packages use this dependency at different versions:
   * each one. The cell itself shows the most at-risk of them.
   */
  variants?: CellVariant[];
}

/** One workspace package's use of a dependency, inside a monorepo cell. */
export interface CellVariant {
  /** The workspace package's name. */
  member: string;
  declared: string;
  installed: string | null;
}

export interface MatrixRow {
  name: string;
  latest: string | null;
  /** Why `latest` is null, when it is. */
  lookup: 'ok' | 'not-found' | 'failed' | 'skipped';
  cells: Record<string, MatrixCell>;
  /** Every advisory affecting at least one version used in this row. */
  advisories: Advisory[];
  /** Safe HTTPS link to GitHub Releases or repository changelog, when known. */
  changelogUrl?: string;
}

export interface Matrix {
  projects: Project[];
  rows: MatrixRow[];
  /** Ranked findings across all projects, most important first. */
  insights: Insight[];
  scannedAt: string;
}

interface InsightBase {
  package: string;
  /**
   * Other packages of the same scope showing exactly the same pattern (e.g. all of
   * `@angular/*`), folded into this insight so one story is told once. Usually empty.
   */
  related: string[];
  /** Projects involved, sorted by project name. */
  projectIds: string[];
  /** Higher is more important. Only meaningful for ordering. */
  score: number;
}

/** A package with a known vulnerability in one or more projects. */
export interface VulnerableSpreadInsight extends InsightBase {
  kind: 'vulnerable-spread';
  /** The highest severity found. */
  severity: Severity;
  advisories: Pick<Advisory, 'id' | 'title' | 'url' | 'severity'>[];
}

/**
 * The same package on different release lines across projects: different majors
 * (17 vs 18), or for 0.x packages different minors (0.2 vs 0.3), where SemVer allows breaks.
 */
export interface VersionDriftInsight extends InsightBase {
  kind: 'version-drift';
  /** Distinct release lines, highest first: ["19", "18", "17"] or ["0.3", "0.2"]. */
  lines: string[];
  /** Distinct installed versions, highest first. */
  versions: string[];
}

/** A package one or more major versions behind `latest` in two or more projects. */
export interface MajorLagInsight extends InsightBase {
  kind: 'major-lag';
  latest: string;
  /** The largest gap in major versions among the projects. */
  majorsBehind: number;
}

export type Insight = VulnerableSpreadInsight | VersionDriftInsight | MajorLagInsight;
export type InsightKind = Insight['kind'];

export function isPackageManagerId(value: unknown): value is PackageManagerId {
  return typeof value === 'string' && (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/** Orders severities so callers can keep the highest one. */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b);
}
