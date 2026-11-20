import type {
  Advisory,
  Insight,
  Job,
  MatrixCell,
  MatrixResponse,
  MatrixRow,
  Project,
  ProjectsResponse,
  UpdateRequest,
} from '@depboard/shared';
import type { ApiClient } from '../lib/api.js';

export function project(id: string, name = id): Project {
  return { id, name, path: `/work/${name}`, manager: 'npm' };
}

export function cell(projectId: string, overrides: Partial<MatrixCell> = {}): MatrixCell {
  const installed = overrides.installed === undefined ? '1.0.0' : overrides.installed;
  return {
    projectId,
    declared: `^${installed ?? '1.0.0'}`,
    installed,
    version: installed,
    versionSource: installed === null ? 'declared' : 'installed',
    updateType: 'none',
    depType: 'dependencies',
    vulnerability: null,
    ...overrides,
  };
}

export function row(
  name: string,
  cells: MatrixCell[],
  overrides: Partial<Omit<MatrixRow, 'cells'>> = {},
): MatrixRow {
  return {
    name,
    latest: '1.0.0',
    lookup: 'ok',
    advisories: [],
    ...overrides,
    cells: Object.fromEntries(cells.map((c) => [c.projectId, c])),
  };
}

export const lodashAdvisory: Advisory = {
  id: 1523,
  title: 'Prototype Pollution in lodash',
  url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
  severity: 'high',
  vulnerableVersions: '<4.17.21',
};

/** Three projects with the classic first-run discoveries: drift, a vulnerability, a lag. */
export function sampleMatrix(): MatrixResponse {
  const projects = [project('a', 'web-app'), project('b', 'api'), project('c', 'admin')];
  const rows: MatrixRow[] = [
    row(
      'react',
      [
        cell('a', { installed: '19.1.0' }),
        cell('b', { installed: '18.3.1', updateType: 'major' }),
        cell('c', { installed: '17.0.2', updateType: 'major' }),
      ],
      { latest: '19.1.0' },
    ),
    row(
      'lodash',
      [
        cell('a', {
          installed: '4.17.20',
          updateType: 'patch',
          vulnerability: { severity: 'high', count: 1, advisoryIds: [1523] },
        }),
        cell('b', { installed: '4.17.21' }),
      ],
      { latest: '4.17.21', advisories: [lodashAdvisory] },
    ),
    row('zod', [cell('b', { installed: '3.22.0', updateType: 'minor' })], { latest: '3.23.0' }),
    row('left-pad', [cell('c', { installed: null, declared: '^1.3.0', version: '1.3.0' })], {
      latest: '1.3.0',
    }),
  ];
  const insights: Insight[] = [
    {
      kind: 'vulnerable-spread',
      package: 'lodash',
      related: [],
      projectIds: ['a'],
      score: 8001,
      severity: 'high',
      advisories: [lodashAdvisory],
    },
    {
      kind: 'version-drift',
      package: 'react',
      related: [],
      projectIds: ['c', 'b', 'a'],
      score: 5003,
      lines: ['19', '18', '17'],
      versions: ['19.1.0', '18.3.1', '17.0.2'],
    },
  ];
  return {
    projects,
    rows,
    insights,
    scannedAt: '2026-11-20T10:00:00.000Z',
    failedLookups: [],
    advisoriesIncomplete: false,
  };
}

export function projectsFor(
  matrix: MatrixResponse,
  overrides: Partial<ProjectsResponse> = {},
): ProjectsResponse {
  const count = matrix.projects.length;
  return {
    roots: ['/work'],
    projects: matrix.projects,
    issues: [],
    hint: count === 0 ? 'no-projects' : count === 1 ? 'single-project' : null,
    ...overrides,
  };
}

/** An API client that answers from memory. */
export function fakeApi(
  matrix: MatrixResponse = sampleMatrix(),
  overrides: Partial<ApiClient> = {},
): ApiClient {
  const commandsFor = (request: UpdateRequest) => [
    {
      projectId: request.projectIds[0] ?? '',
      display: `npm install ${request.package}@${request.version} --no-audit --no-fund`,
    },
  ];
  return {
    getMatrix: () => Promise.resolve(matrix),
    getProjects: () => Promise.resolve(projectsFor(matrix)),
    rescan: () => Promise.resolve(matrix),
    previewUpdate: (request) =>
      Promise.resolve({
        version: request.version,
        updateType: 'minor',
        commands: commandsFor(request),
      }),
    startUpdate: (request) =>
      Promise.resolve({ jobId: 'j_000000000001', commands: commandsFor(request) }),
    listJobs: () => Promise.resolve({ jobs: [] }),
    streamJob: () => Promise.resolve(),
    ...overrides,
  };
}

/** A finished job, as the server reports it. */
export function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j_000000000001',
    projectId: 'b',
    package: 'zod',
    version: '3.23.0',
    command: 'npm install zod@3.23.0 --no-audit --no-fund',
    status: 'success',
    exitCode: 0,
    startedAt: '2026-11-20T10:00:00.000Z',
    durationMs: 2400,
    ...overrides,
  };
}
