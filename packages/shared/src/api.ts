import type { Matrix, Project, UpdateType } from './domain.js';

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

/** `POST /api/update` body. In the MVP, `projectIds` holds exactly one project. */
export interface UpdateRequest {
  package: string;
  /** An exact version, or `latest` (resolved by the server to the registry's latest). */
  version: string;
  projectIds: string[];
  /** Required for a major update: the user saw the command and confirmed it. */
  confirmMajor?: boolean | undefined;
  /** Return the commands that would run, without running anything. */
  dryRun?: boolean | undefined;
}

/** A command as the user should read it before it runs, e.g. `npm install react@19.1.0`. */
export interface PlannedCommand {
  projectId: string;
  display: string;
}

/** `POST /api/update` with `dryRun: true` */
export interface UpdatePreview {
  version: string;
  updateType: UpdateType;
  commands: PlannedCommand[];
}

/** `POST /api/update` → 202 */
export interface UpdateAccepted {
  jobId: string;
  commands: PlannedCommand[];
}

export type JobStatus = 'running' | 'success' | 'failed';

export interface Job {
  id: string;
  projectId: string;
  package: string;
  version: string;
  command: string;
  status: JobStatus;
  exitCode: number | null;
  startedAt: string;
  /** Null while running. */
  durationMs: number | null;
}

/**
 * One NDJSON line of `GET /api/jobs/:id/stream`. The stream replays the log so far, then
 * follows it live, and ends after the `end` event.
 */
export type JobEvent =
  | { type: 'start'; job: Job }
  | { type: 'output'; stream: 'stdout' | 'stderr'; line: string }
  | { type: 'end'; job: Job };
