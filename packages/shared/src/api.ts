import type { Matrix, Project } from './domain.js';

/** A file DepBoard skipped (e.g. a broken package.json), reported instead of failing the scan. */
export interface ScanIssue {
  path: string;
  reason: string;
}

/** Why the matrix may look sparse: nothing found, or one project with nothing to compare against. */
export type ProjectsHint = 'no-projects' | 'single-project' | null;

/** `GET /api/projects` */
export interface ProjectsResponse {
  roots: string[];
  projects: Project[];
  issues: ScanIssue[];
  hint: ProjectsHint;
}

/** `GET /api/matrix` and `POST /api/rescan` */
export interface MatrixResponse extends Matrix {
  /** Packages whose registry lookup failed (network, timeout): their latest version is unknown. */
  failedLookups: string[];
  /** True when the advisory lookup failed for at least one version: "no advisory" can't be trusted. */
  advisoriesIncomplete: boolean;
}

/** The header that carries the per-launch session token on every API request. */
export const TOKEN_HEADER = 'x-depboard-token';
