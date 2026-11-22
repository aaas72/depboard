import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Insight } from '@depboard/shared';
import { Alert } from '../../components/ui/Alert.js';
import { Button } from '../../components/ui/Button.js';
import { CopyCommand } from '../../components/ui/CopyCommand.js';
import { LogoMark, RefreshIcon } from '../../components/ui/icons.js';
import { t } from '../../lib/i18n.js';
import { UpdateBadge, VulnerabilityMarker } from './badges.js';
import type { ApiClient } from '../../lib/api.js';
import { ActivityPanel } from '../activity/ActivityPanel.js';
import { useActivity } from '../activity/useActivity.js';
import { ProjectView } from '../project/ProjectView.js';
import { shortenPath } from '../../lib/paths.js';
import { routeHref, useRoute } from '../../lib/route.js';
import { CellDrawer } from './CellDrawer.js';
import { DriftStrip, InsightSentence } from './DriftStrip.js';
import { MatrixGrid, type CellRef } from './MatrixGrid.js';
import { countUpToDate, filterMatrix, focusOn, nameColumnWidth, sortRows } from './model.js';
import type { MatrixData } from './useMatrix.js';

export interface MatrixScreenProps {
  data: MatrixData;
  api: ApiClient;
  /** Re-reads the matrix after an update (the server has already rescanned). */
  refresh: () => void;
  rescan: () => void;
  rescanning: boolean;
  rescanError: Error | null;
}

/** The whole product on one screen: insights on top, the matrix below, details on the side. */
export function MatrixScreen({
  data,
  api,
  refresh,
  rescan,
  rescanning,
  rescanError,
}: MatrixScreenProps) {
  const activity = useActivity(api, (job) => {
    if (job.status === 'success') refresh();
  });
  const { matrix, projects: info } = data;
  const [query, setQuery] = useState('');
  const [outdatedOnly, setOutdatedOnly] = useState(false);
  const [focused, setFocused] = useState<Insight | null>(null);
  const [open, setOpen] = useState<{ rowName: string; projectId: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Where focus was when the drawer opened, so closing it goes back there (grid or table row).
  const returnFocus = useRef<HTMLElement | null>(null);
  const route = useRoute();
  const routedProject =
    route.view === 'project'
      ? (matrix.projects.find((p) => p.id === route.projectId) ?? null)
      : undefined;

  // A rescan replaces the insight objects: drop a focus that no longer exists.
  const focus = useMemo(
    () => (focused !== null && matrix.insights.includes(focused) ? focusOn(focused) : null),
    [focused, matrix.insights],
  );

  const sorted = useMemo(() => sortRows(matrix.rows), [matrix.rows]);
  // "Hide up-to-date" names how many rows it hides, and only shows when there is something to hide.
  const upToDate = useMemo(() => countUpToDate(matrix.rows), [matrix.rows]);
  const nameWidth = useMemo(
    () => nameColumnWidth(matrix.rows.map((row) => row.name)),
    [matrix.rows],
  );
  const view = useMemo(
    () => filterMatrix(sorted, matrix.projects, { query, outdatedOnly, focus }),
    [sorted, matrix.projects, query, outdatedOnly, focus],
  );

  // "/" jumps to search from anywhere except a text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, [contenteditable="true"]') != null;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const openRow = open ? matrix.rows.find((r) => r.name === open.rowName) : undefined;
  const openProject = open ? matrix.projects.find((p) => p.id === open.projectId) : undefined;

  const onOpenCell = useCallback(({ row, project }: CellRef) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen({ rowName: row.name, projectId: project.id });
  }, []);
  const closeDrawer = useCallback(() => {
    setOpen(null);
    // Back to where the user was.
    returnFocus.current?.focus();
  }, []);

  const drawer = openRow && openProject && (
    <CellDrawer
      row={openRow}
      project={openProject}
      projects={matrix.projects}
      api={api}
      activity={activity}
      onClose={closeDrawer}
    />
  );

  const projectCount = matrix.projects.length;
  const fullRoots = info.roots.join(', ');
  const roots = info.roots.map((root) => shortenPath(root, info.home)).join(', ');

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="flex items-center gap-2 self-center text-base font-bold tracking-tight">
            <LogoMark className="size-8" />
            DepBoard
          </h1>
          <p className="truncate text-sm text-text-muted" title={fullRoots}>
            <span className="font-mono">{roots}</span> · {t('header.projects', { n: projectCount })}
          </p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">{t('search.label')}</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder={t('search.placeholder')}
              className="h-8 w-64 rounded-md border border-border-strong bg-surface ps-3 pe-8 text-sm placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded border border-border px-1 font-mono text-xs text-text-muted"
            >
              /
            </kbd>
          </label>
          {(upToDate > 0 || outdatedOnly) && (
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-surface-raised">
              <input
                type="checkbox"
                checked={outdatedOnly}
                onChange={(e) => {
                  setOutdatedOnly(e.target.checked);
                }}
                className="size-4 accent-accent"
              />
              {t('filter.hideUpToDate', { n: upToDate })}
            </label>
          )}
          <Button onClick={rescan} disabled={rescanning} aria-busy={rescanning}>
            <RefreshIcon className={`size-3.5 ${rescanning ? 'animate-spin' : ''}`} />
            {rescanning ? t('action.rescanning') : t('action.rescan')}
          </Button>
        </div>
      </header>

      <div className="space-y-2 px-4 empty:hidden [&:not(:empty)]:pt-3">
        {rescanError && <Alert>{rescanError.message}</Alert>}
        {matrix.failedLookups.length > 0 && (
          <Alert>{t('alert.failedLookups', { n: matrix.failedLookups.length })}</Alert>
        )}
        {matrix.advisoriesIncomplete && <Alert>{t('alert.advisoriesIncomplete')}</Alert>}
        {info.issues.length > 0 && (
          <Alert>
            <details>
              <summary className="cursor-pointer">
                {t('alert.issues', { n: info.issues.length })}
              </summary>
              <ul className="mt-1 space-y-0.5 font-mono text-xs">
                {info.issues.map((issue) => (
                  <li key={issue.path}>
                    {shortenPath(issue.path, info.home)}: {issue.reason}
                  </li>
                ))}
              </ul>
            </details>
          </Alert>
        )}
        {info.hint === 'single-project' && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm">
            <span>{t('state.single')}</span>
            <CopyCommand command="npx depboard .." />
          </div>
        )}
      </div>

      {info.hint === 'no-projects' ? (
        <div className="mx-auto mt-16 max-w-lg px-4 text-center">
          <h2 className="text-lg font-semibold">{t('state.empty.title', { roots })}</h2>
          <p className="mt-2 text-sm text-text-muted">{t('state.empty.body')}</p>
          <div className="mt-4">
            <CopyCommand command="npx depboard ~/projects" />
          </div>
        </div>
      ) : routedProject !== undefined ? (
        <div className="flex min-h-0 flex-1 border-t border-border">
          <div className="min-w-0 flex-1 overflow-y-auto">
            {routedProject === null ? (
              <div className="p-8 text-center text-sm">
                <p>{t('project.notFound')}</p>
                <a
                  href={routeHref({ view: 'matrix' })}
                  className="mt-2 inline-block text-accent hover:underline"
                >
                  ← {t('project.back')}
                </a>
              </div>
            ) : (
              <ProjectView
                project={routedProject}
                home={info.home}
                rows={matrix.rows}
                query={query}
                outdatedOnly={outdatedOnly}
                openPackage={open?.projectId === routedProject.id ? open.rowName : null}
                onOpen={(row) => {
                  onOpenCell({ row, project: routedProject });
                }}
              />
            )}
          </div>
          {drawer || <DetailsPlaceholder />}
        </div>
      ) : (
        <>
          <DriftStrip
            insights={matrix.insights}
            projectCount={projectCount}
            focused={focus?.insight ?? null}
            onFocus={setFocused}
          />
          {focus && (
            <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-text-muted">{t('drift.filtering')}</span>
              <span>
                <InsightSentence insight={focus.insight} />
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  setFocused(null);
                }}
              >
                ✕ {t('action.clearFilter')}
              </Button>
            </div>
          )}

          <div className="flex min-h-0 flex-1 border-t border-border">
            <div className="flex min-w-0 flex-1 flex-col">
              {view.rows.length === 0 ? (
                <p className="p-8 text-center text-sm text-text-muted">{t('state.noMatches')}</p>
              ) : (
                <MatrixGrid
                  rows={view.rows}
                  projects={view.projects}
                  onOpenCell={onOpenCell}
                  openCell={open}
                  nameWidth={nameWidth}
                />
              )}
              <Legend />
            </div>
            {drawer || <DetailsPlaceholder />}
          </div>
        </>
      )}
      <ActivityPanel jobs={activity.jobs} projects={matrix.projects} />
    </div>
  );
}

/**
 * The drawer's space, kept while no cell is open (on wide screens), so opening one fills it
 * instead of pushing the matrix aside: the table never moves under the pointer.
 */
function DetailsPlaceholder() {
  return (
    <aside
      aria-label={t('drawer.emptyTitle')}
      className="hidden w-96 flex-none flex-col items-center justify-center gap-2 border-s border-border bg-surface p-8 text-center lg:flex"
    >
      <LogoMark className="size-10 opacity-60" />
      <p className="text-sm font-semibold">{t('drawer.emptyTitle')}</p>
      <p className="max-w-64 text-sm text-text-muted">{t('drawer.emptyBody')}</p>
    </aside>
  );
}

/** Every symbol in the matrix, grouped by the question it answers. */
function Legend() {
  const label = 'font-medium text-text';
  return (
    <footer
      aria-label={t('legend.label')}
      className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-4 py-1.5 text-xs text-text-muted"
    >
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={label}>{t('legend.age')}</span>
        {(['none', 'patch', 'minor', 'major', 'unknown'] as const).map((type) => (
          <span key={type} className="inline-flex items-center gap-1">
            <UpdateBadge type={type} /> {t(`legend.${type}`)}
          </span>
        ))}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={label}>{t('legend.danger')}</span>
        <VulnerabilityMarker vulnerability={{ severity: 'high', count: 1, advisoryIds: [] }} />
        {t('legend.severities')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={label}>{t('legend.drift')}</span>
        <span aria-hidden="true" className="inline-flex gap-1 font-mono">
          <span className="border-b-2 border-drift-1">18</span>
          <span className="border-b-2 border-drift-2">17</span>
        </span>
        {t('legend.driftBody')}
      </span>
      <span className="italic">{t('legend.estimated')}</span>
    </footer>
  );
}
