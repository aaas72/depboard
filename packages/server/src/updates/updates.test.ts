import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JobEvent, Matrix, MatrixCell, Project, UpdateRequest } from '@depboard/shared';
import { buildInstallCommand } from '../adapters/npm.js';
import { buildPnpmInstallCommand } from '../adapters/pnpm.js';
import { createJobManager } from './jobs.js';
import { planUpdate } from './plan-update.js';
import type { Runner } from './runner.js';

const ROOT = path.resolve('/work');

function project(id: string, manager: Project['manager'] = 'npm'): Project {
  return { id, name: `app-${id}`, path: path.join(ROOT, id), manager };
}

function cell(
  projectId: string,
  version: string,
  depType: MatrixCell['depType'] = 'dependencies',
): MatrixCell {
  return {
    projectId,
    declared: `^${version}`,
    installed: version,
    version,
    versionSource: 'installed',
    updateType: 'none',
    depType,
    vulnerability: null,
  };
}

function matrix(): Matrix {
  return {
    projects: [
      project('a'),
      project('b', 'pnpm'),
      project('y', 'yarn'),
      { ...project('c'), path: path.resolve('/elsewhere/c') },
      { ...project('m'), workspacePackages: 3 },
    ],
    rows: [
      {
        name: 'react',
        latest: '19.1.0',
        lookup: 'ok',
        advisories: [],
        cells: {
          a: cell('a', '18.3.1'),
          b: cell('b', '18.3.1'),
          y: cell('y', '18.3.1'),
          c: cell('c', '18.3.1'),
          m: cell('m', '18.3.1'),
        },
      },
      {
        name: 'vitest',
        latest: '3.2.4',
        lookup: 'ok',
        advisories: [],
        cells: { a: cell('a', '3.2.0', 'devDependencies') },
      },
      {
        name: 'local-lib',
        latest: null,
        lookup: 'skipped',
        advisories: [],
        cells: { a: cell('a', '1.0.0') },
      },
    ],
    insights: [],
    scannedAt: '2026-11-20T10:00:00.000Z',
  };
}

describe('buildInstallCommand', () => {
  it('builds an argument array with the exact version', () => {
    expect(
      buildInstallCommand({ name: 'react', version: '19.1.0', depType: 'dependencies' }),
    ).toEqual({
      file: 'npm',
      args: ['install', 'react@19.1.0', '--no-audit', '--no-fund'],
      display: 'npm install react@19.1.0 --no-audit --no-fund',
    });
  });

  it('keeps a devDependency in devDependencies', () => {
    expect(
      buildInstallCommand({ name: '@types/node', version: '24.0.0', depType: 'devDependencies' })
        .args,
    ).toEqual(['install', '@types/node@24.0.0', '--save-dev', '--no-audit', '--no-fund']);
  });

  it.each(['react; rm -rf ~', '--registry=evil', '../../x', 'a b', ''])(
    'refuses the name %j',
    (name) => {
      expect(() =>
        buildInstallCommand({ name, version: '1.0.0', depType: 'dependencies' }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_PACKAGE_NAME' }));
    },
  );

  it.each(['^1.0.0', 'latest', '1.0', 'github:x/y', 'file:../x', '1.0.0 --force', ' 1.0.0'])(
    'refuses the version %j',
    (version) => {
      expect(() =>
        buildInstallCommand({ name: 'react', version, depType: 'dependencies' }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_VERSION' }));
    },
  );
});

describe('buildPnpmInstallCommand', () => {
  it('builds a pnpm add argument array with the exact version', () => {
    expect(
      buildPnpmInstallCommand({ name: 'react', version: '19.1.0', depType: 'dependencies' }),
    ).toEqual({
      file: 'pnpm',
      args: ['add', 'react@19.1.0'],
      display: 'pnpm add react@19.1.0',
    });
  });

  it('keeps a devDependency in devDependencies with --save-dev', () => {
    expect(
      buildPnpmInstallCommand({
        name: '@types/node',
        version: '24.0.0',
        depType: 'devDependencies',
      }),
    ).toEqual({
      file: 'pnpm',
      args: ['add', '@types/node@24.0.0', '--save-dev'],
      display: 'pnpm add @types/node@24.0.0 --save-dev',
    });
  });

  it.each(['react; rm -rf ~', '--registry=evil', '-D', '../../x', 'a b', ''])(
    'refuses the name %j',
    (name) => {
      expect(() =>
        buildPnpmInstallCommand({ name, version: '1.0.0', depType: 'dependencies' }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_PACKAGE_NAME' }));
    },
  );

  it.each(['^1.0.0', 'latest', '1.0', 'github:x/y', 'file:../x', '1.0.0 --force', ' 1.0.0'])(
    'refuses the version %j',
    (version) => {
      expect(() =>
        buildPnpmInstallCommand({ name: 'react', version, depType: 'dependencies' }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_VERSION' }));
    },
  );
});

describe('planUpdate', () => {
  const plan = (request: Partial<Parameters<typeof planUpdate>[2]>) =>
    planUpdate(matrix(), [ROOT], {
      package: 'react',
      version: '19.1.0',
      projectIds: ['a'],
      ...request,
    });

  it('plans the exact command, with the folder taken from the scan', () => {
    const result = plan({ confirmMajor: true });
    expect(result.project.path).toBe(path.join(ROOT, 'a'));
    expect(result.updateType).toBe('major');
    expect(result.command.display).toBe('npm install react@19.1.0 --no-audit --no-fund');
  });

  it('resolves "latest" to the registry version, so the command is exact', () => {
    expect(plan({ version: 'latest', confirmMajor: true }).command.args[1]).toBe('react@19.1.0');
  });

  it('refuses a major update without confirmation, but previews it', () => {
    expect(() => plan({})).toThrow(expect.objectContaining({ code: 'MAJOR_NOT_CONFIRMED' }));
    expect(plan({ dryRun: true }).updateType).toBe('major');
  });

  it('needs no confirmation for minor or patch updates', () => {
    expect(plan({ package: 'vitest', version: '3.2.4' }).updateType).toBe('patch');
  });

  it('plans a pnpm add command for standalone pnpm projects', () => {
    const result = plan({ projectIds: ['b'], confirmMajor: true });
    expect(result.project.path).toBe(path.join(ROOT, 'b'));
    expect(result.command).toEqual({
      file: 'pnpm',
      args: ['add', 'react@19.1.0'],
      display: 'pnpm add react@19.1.0',
    });
  });

  const refusals: [Partial<UpdateRequest>, string][] = [
    [{ projectIds: [] }, 'INVALID_USAGE'],
    [{ projectIds: ['a', 'b'] }, 'INVALID_USAGE'],
    [{ projectIds: ['zzz'] }, 'PROJECT_NOT_FOUND'],
    [{ package: '-x' }, 'INVALID_PACKAGE_NAME'],
    [{ package: 'lodash' }, 'NOT_FOUND'],
    [{ version: '^19.0.0' }, 'INVALID_VERSION'],
    [{ package: 'local-lib', version: '1.0.1' }, 'NOT_UPDATABLE'],
    [{ projectIds: ['y'], confirmMajor: true }, 'MANAGER_NOT_SUPPORTED'],
    [{ projectIds: ['c'], confirmMajor: true }, 'FORBIDDEN_PATH'],
    [{ projectIds: ['m'], confirmMajor: true }, 'WORKSPACE_NOT_SUPPORTED'],
  ];
  it.each(refusals)('refuses %j with %s', (request, code) => {
    expect(() => plan(request)).toThrow(expect.objectContaining({ code }));
  });
});

/** A runner that records what it was asked to run and finishes when told to. */
function fakeRunner() {
  const runs: {
    args: string[];
    cwd: string;
    finish: (code: number | null) => void;
    killed: boolean;
  }[] = [];
  let emit: (stream: 'stdout' | 'stderr', line: string) => void = () => {};
  const runner: Runner = (command, cwd, onLine) => {
    emit = onLine;
    let finish: (code: number | null) => void = () => {};
    const done = new Promise<number | null>((resolve) => {
      finish = resolve;
    });
    const run = { args: command.args, cwd, finish, killed: false };
    runs.push(run);
    return {
      done,
      kill: () => {
        run.killed = true;
        finish(null);
      },
    };
  };
  return {
    runner,
    runs,
    print: (line: string) => {
      emit('stdout', line);
    },
  };
}

const command = buildInstallCommand({ name: 'react', version: '19.1.0', depType: 'dependencies' });
const start = { projectId: 'a', cwd: '/work/a', package: 'react', version: '19.1.0', command };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createJobManager', () => {
  it('runs the command in the project folder and streams its output', async () => {
    const fake = fakeRunner();
    let clock = 1000;
    const jobs = createJobManager({ runner: fake.runner, now: () => clock });
    const job = jobs.start(start);
    expect(job).toMatchObject({ status: 'running', command: command.display, projectId: 'a' });
    expect(fake.runs[0]).toMatchObject({ args: command.args, cwd: '/work/a' });

    const events: JobEvent[] = [];
    fake.print('before subscribing');
    jobs.subscribe(job.id, (e) => events.push(e));
    fake.print('added 1 package');
    clock = 3500;
    fake.runs[0]?.finish(0);
    await flush();

    expect(events.map((e) => e.type)).toEqual(['start', 'output', 'output', 'end']);
    expect(events[1]).toEqual({ type: 'output', stream: 'stdout', line: 'before subscribing' });
    expect(events.at(-1)).toMatchObject({
      type: 'end',
      job: { status: 'success', exitCode: 0, durationMs: 2500 },
    });
  });

  it('refreshes the data before announcing success', async () => {
    const fake = fakeRunner();
    const order: string[] = [];
    const jobs = createJobManager({
      runner: fake.runner,
      afterSuccess: () => {
        order.push('rescan');
        return Promise.resolve();
      },
    });
    const job = jobs.start(start);
    jobs.subscribe(job.id, (e) => {
      if (e.type === 'end') order.push('end');
    });
    fake.runs[0]?.finish(0);
    await flush();
    expect(order).toEqual(['rescan', 'end']);
  });

  it('marks a non-zero exit as failed, and does not rescan', async () => {
    const fake = fakeRunner();
    let rescans = 0;
    const jobs = createJobManager({
      runner: fake.runner,
      afterSuccess: () => {
        rescans++;
        return Promise.resolve();
      },
    });
    const job = jobs.start(start);
    fake.runs[0]?.finish(1);
    await flush();
    expect(jobs.list()[0]).toMatchObject({ id: job.id, status: 'failed', exitCode: 1 });
    expect(rescans).toBe(0);
  });

  it('allows one job per project at a time', async () => {
    const fake = fakeRunner();
    const jobs = createJobManager({ runner: fake.runner });
    jobs.start(start);
    expect(() => jobs.start(start)).toThrow(expect.objectContaining({ code: 'PROJECT_BUSY' }));
    expect(() => jobs.start({ ...start, projectId: 'b', cwd: '/work/b' })).not.toThrow();
    fake.runs[0]?.finish(0);
    await flush();
    expect(() => jobs.start(start)).not.toThrow();
  });

  it('replays a finished job in full to a late subscriber', async () => {
    const fake = fakeRunner();
    const jobs = createJobManager({ runner: fake.runner });
    const job = jobs.start(start);
    fake.print('done');
    fake.runs[0]?.finish(0);
    await flush();
    const events: JobEvent[] = [];
    jobs.subscribe(job.id, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(['start', 'output', 'end']);
  });

  it('stops running jobs on shutdown', () => {
    const fake = fakeRunner();
    const jobs = createJobManager({ runner: fake.runner });
    jobs.start(start);
    jobs.stopAll();
    expect(fake.runs[0]?.killed).toBe(true);
  });

  it('refuses an unknown job id', () => {
    const jobs = createJobManager({ runner: fakeRunner().runner });
    expect(() => jobs.subscribe('j_000000000000', () => {})).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });
});
