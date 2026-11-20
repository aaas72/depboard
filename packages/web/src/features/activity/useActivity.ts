import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, JobEvent, UpdateRequest } from '@depboard/shared';
import type { ApiClient } from '../../lib/api.js';

export interface OutputLine {
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface JobView {
  job: Job;
  lines: OutputLine[];
}

/** Keeps the browser light even if npm prints a lot. The server keeps its own capped copy. */
const MAX_LINES = 2000;

/**
 * Every update the user started, with its live output. Nothing runs without showing up here
 * (engineering-standards.md: "No surprises"). `onFinished` lets the matrix refresh after a
 * successful update.
 */
export function useActivity(api: ApiClient, onFinished: (job: Job) => void) {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  });

  const apply = useCallback((jobId: string, event: JobEvent) => {
    setJobs((current) =>
      current.map((view) => {
        if (view.job.id !== jobId) return view;
        if (event.type === 'output') {
          const lines = [...view.lines, { stream: event.stream, line: event.line }];
          return { ...view, lines: lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines };
        }
        // `start` replays the log from the beginning: reset so lines aren't doubled.
        return { job: event.job, lines: event.type === 'start' ? [] : view.lines };
      }),
    );
    if (event.type === 'end') finished.current(event.job);
  }, []);

  const follow = useCallback(
    (job: Job, signal?: AbortSignal) => {
      setJobs((current) =>
        current.some((v) => v.job.id === job.id) ? current : [{ job, lines: [] }, ...current],
      );
      api
        .streamJob(
          job.id,
          (event) => {
            apply(job.id, event);
          },
          signal,
        )
        .catch(() => {
          // The stream broke (server stopped, page closing). The job list still shows the last state.
        });
    },
    [api, apply],
  );

  // After a reload, show earlier updates and keep following any that are still running.
  useEffect(() => {
    const controller = new AbortController();
    api.listJobs().then(
      ({ jobs: known }) => {
        if (controller.signal.aborted) return;
        setJobs(known.map((job) => ({ job, lines: [] })));
        for (const job of known) follow(job, controller.signal);
      },
      () => {
        // No history is fine: the panel just starts empty.
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, follow]);

  const start = useCallback(
    async (request: UpdateRequest): Promise<void> => {
      const accepted = await api.startUpdate(request);
      const [first] = accepted.commands;
      follow({
        id: accepted.jobId,
        projectId: first?.projectId ?? '',
        package: request.package,
        version: request.version,
        command: first?.display ?? '',
        status: 'running',
        exitCode: null,
        startedAt: new Date().toISOString(),
        durationMs: null,
      });
    },
    [api, follow],
  );

  const isBusy = useCallback(
    (projectId: string) =>
      jobs.some((v) => v.job.projectId === projectId && v.job.status === 'running'),
    [jobs],
  );

  return { jobs, start, isBusy };
}

export type Activity = ReturnType<typeof useActivity>;
