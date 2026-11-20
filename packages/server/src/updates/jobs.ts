import { randomBytes } from 'node:crypto';
import { DepboardError, type Job, type JobEvent } from '@depboard/shared';
import type { InstallCommand } from '../adapters/npm.js';
import type { Runner } from './runner.js';

/** Enough to see what went wrong in a failed install, without growing without bound. */
const MAX_LOG_LINES = 2000;

export interface StartJob {
  projectId: string;
  cwd: string;
  package: string;
  version: string;
  command: InstallCommand;
}

export interface JobManagerOptions {
  runner: Runner;
  /** Runs after a successful job, before its `end` event, so readers see fresh data. */
  afterSuccess?: () => Promise<unknown>;
  now?: () => number;
}

interface JobRecord {
  job: Job;
  started: number;
  log: Extract<JobEvent, { type: 'output' }>[];
  listeners: Set<(event: JobEvent) => void>;
  kill: () => void;
}

export interface JobManager {
  start: (input: StartJob) => Job;
  list: () => Job[];
  /** Replays the job so far, then follows it. Returns an unsubscribe function. */
  subscribe: (id: string, listener: (event: JobEvent) => void) => () => void;
  isBusy: (projectId: string) => boolean;
  /** Stops every running job (on shutdown). */
  stopAll: () => void;
}

export function createJobManager(options: JobManagerOptions): JobManager {
  const now = options.now ?? Date.now;
  const jobs = new Map<string, JobRecord>();

  const emit = (record: JobRecord, event: JobEvent) => {
    for (const listener of record.listeners) listener(event);
  };

  const isBusy = (projectId: string) =>
    [...jobs.values()].some((r) => r.job.projectId === projectId && r.job.status === 'running');

  return {
    start(input) {
      // One job per project: two installs in one folder would fight over node_modules.
      if (isBusy(input.projectId)) {
        throw new DepboardError('PROJECT_BUSY', 'This project is already being updated.', {
          hint: 'Wait for the current update to finish.',
        });
      }
      const started = now();
      const job: Job = {
        id: `j_${randomBytes(6).toString('hex')}`,
        projectId: input.projectId,
        package: input.package,
        version: input.version,
        command: input.command.display,
        status: 'running',
        exitCode: null,
        startedAt: new Date(started).toISOString(),
        durationMs: null,
      };
      const record: JobRecord = { job, started, log: [], listeners: new Set(), kill: () => {} };
      jobs.set(job.id, record);

      const running = options.runner(input.command, input.cwd, (stream, line) => {
        // npm opens with a blank line; a log that starts with nothing reads as broken.
        if (record.log.length === 0 && line.trim() === '') return;
        const event = { type: 'output', stream, line } as const;
        record.log.push(event);
        if (record.log.length > MAX_LOG_LINES) record.log.shift();
        emit(record, event);
      });
      record.kill = running.kill;

      void running.done.then(async (exitCode) => {
        const success = exitCode === 0;
        if (success && options.afterSuccess) {
          // A failed refresh must not turn a successful install into a failed job.
          await options.afterSuccess().catch(() => undefined);
        }
        record.job = {
          ...record.job,
          status: success ? 'success' : 'failed',
          exitCode,
          durationMs: now() - started,
        };
        emit(record, { type: 'end', job: record.job });
        record.listeners.clear();
      });

      return job;
    },

    list: () => [...jobs.values()].map((r) => r.job).reverse(),

    subscribe(id, listener) {
      const record = jobs.get(id);
      if (!record) throw new DepboardError('NOT_FOUND', 'No such job.');
      listener({ type: 'start', job: record.job });
      for (const event of record.log) listener(event);
      if (record.job.status !== 'running') {
        listener({ type: 'end', job: record.job });
        return () => {};
      }
      record.listeners.add(listener);
      return () => {
        record.listeners.delete(listener);
      };
    },

    isBusy,

    stopAll() {
      for (const record of jobs.values()) {
        if (record.job.status === 'running') record.kill();
      }
    },
  };
}
