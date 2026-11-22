import { useEffect, useRef, useState } from 'react';
import type { JobStatus, Project } from '@depboard/shared';
import { t } from '../../lib/i18n.js';
import type { JobView } from './useActivity.js';

const STATUS_STYLE: Record<JobStatus, string> = {
  running: 'text-accent',
  success: 'text-update-patch',
  failed: 'text-warning',
};

const STATUS_GLYPH: Record<JobStatus, string> = { running: '●', success: '✓', failed: '✕' };

function seconds(ms: number | null): string {
  return ms === null ? '' : t('activity.duration', { s: (ms / 1000).toFixed(1) });
}

export interface ActivityPanelProps {
  jobs: readonly JobView[];
  projects: readonly Project[];
}

/**
 * The live install log, at the bottom of the screen. It opens by itself when an update starts,
 * and shows the exact command, its output, its status, and how long it took.
 */
export function ActivityPanel({ jobs, projects }: ActivityPanelProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const newest = jobs[0];

  // A new job opens the panel on it.
  const [seenNewest, setSeenNewest] = useState(newest?.job.id);
  if (newest !== undefined && newest.job.id !== seenNewest) {
    setSeenNewest(newest.job.id);
    if (newest.job.status === 'running') {
      setOpen(true);
      setSelected(newest.job.id);
    }
  }

  const shown = jobs.find((v) => v.job.id === selected) ?? newest;
  const lineCount = shown?.lines.length ?? 0;

  // Follow the output as it arrives.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lineCount, open]);

  if (jobs.length === 0) return null;

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const running = jobs.filter((v) => v.job.status === 'running').length;

  return (
    <section
      aria-label={t('activity.title')}
      className="flex-none border-t border-border-strong bg-surface-raised"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-start text-sm font-semibold hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {t('activity.title')}
        <span className="font-normal text-text-muted">
          {running > 0
            ? t('activity.running', { n: running })
            : t('activity.count', { n: jobs.length })}
        </span>
      </button>

      {open && shown && (
        <div className="flex h-56 border-t border-border">
          <ul className="w-72 flex-none overflow-y-auto border-e border-border">
            {jobs.map(({ job }) => (
              <li key={job.id}>
                <button
                  type="button"
                  aria-current={job.id === shown.job.id}
                  onClick={() => {
                    setSelected(job.id);
                  }}
                  className={`w-full px-3 py-2 text-start text-sm hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${job.id === shown.job.id ? 'bg-surface-sunken' : ''}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className={STATUS_STYLE[job.status]}>
                      {STATUS_GLYPH[job.status]}
                    </span>
                    <span className="truncate font-medium">
                      {job.package}@{job.version}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {projectName(job.projectId)} · {t(`activity.status.${job.status}`)}{' '}
                    {seconds(job.durationMs)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="border-b border-border px-3 py-1.5 font-mono text-xs">
              <span className="text-text-muted">{projectName(shown.job.projectId)} $ </span>
              {shown.job.command}
            </p>
            <pre
              ref={logRef}
              role="log"
              aria-label={t('activity.output')}
              className="min-h-0 flex-1 overflow-auto bg-surface-sunken px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap"
            >
              {shown.lines.map((l, i) => (
                <span key={i} className={l.stream === 'stderr' ? 'text-text-muted' : ''}>
                  {l.line}
                  {'\n'}
                </span>
              ))}
              {shown.job.status !== 'running' && (
                <span className={`font-semibold ${STATUS_STYLE[shown.job.status]}`}>
                  {shown.job.status === 'success'
                    ? t('activity.done', { s: ((shown.job.durationMs ?? 0) / 1000).toFixed(1) })
                    : t('activity.failedWith', { code: String(shown.job.exitCode ?? '—') })}
                </span>
              )}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
