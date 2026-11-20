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
}

export interface CellVulnerability {
  severity: Severity;
  count: number;
}

export interface MatrixCell {
  projectId: string;
  /** The range written in package.json, e.g. "^18.2.0". */
  declared: string;
  /** The version found in node_modules, or null when not installed. */
  installed: string | null;
  updateType: UpdateType;
  depType: DependencyType;
  /** null = no known advisory, 'unknown' = the advisory lookup failed. */
  vulnerability: CellVulnerability | null | 'unknown';
}

export interface MatrixRow {
  name: string;
  latest: string | null;
  cells: Record<string, MatrixCell>;
}

export function isPackageManagerId(value: unknown): value is PackageManagerId {
  return typeof value === 'string' && (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/** Orders severities so callers can keep the highest one. */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b);
}
