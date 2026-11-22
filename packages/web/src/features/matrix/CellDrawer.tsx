import { useEffect, useRef, type ReactNode } from 'react';
import type { MatrixRow, Project } from '@depboard/shared';
import type { ApiClient } from '../../lib/api.js';
import { t } from '../../lib/i18n.js';
import type { Activity } from '../activity/useActivity.js';
import { UpdateBadge, VulnerabilityMarker, showsUpdateBadge } from './badges.js';
import { cellVersionText } from './model.js';
import { UpdateSection, canUpdate } from './UpdateSection.js';

export interface CellDrawerProps {
  row: MatrixRow;
  project: Project;
  projects: readonly Project[];
  api: ApiClient;
  activity: Activity;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="min-w-0 text-end font-mono text-sm break-all">{children}</dd>
    </div>
  );
}

/**
 * Details for one package in one project: versions, status, and advisories.
 * A side panel, not a modal: the matrix stays visible. Esc closes it.
 */
export function CellDrawer({ row, project, projects, api, activity, onClose }: CellDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const cell = row.cells[project.id];

  useEffect(() => {
    closeRef.current?.focus();
  }, [row.name, project.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (cell === undefined) return null;

  const vulnerability = cell.vulnerability;
  const advisoryIds =
    vulnerability !== null && vulnerability !== 'unknown'
      ? new Set(vulnerability.advisoryIds)
      : null;
  const advisories = advisoryIds ? row.advisories.filter((a) => advisoryIds.has(a.id)) : [];
  const others = projects.filter((p) => p.id !== project.id && row.cells[p.id] !== undefined);
  const titleId = `drawer-${project.id}`;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="flex w-full max-w-sm min-h-0 flex-none flex-col overflow-hidden border-s border-border bg-surface sm:w-96"
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate font-mono text-base font-semibold">
            {row.name}
          </h2>
          <p className="truncate text-sm text-text-muted" title={project.path}>
            {t('drawer.inProject', { project: project.name })}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('action.close')}
          className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-raised hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
        >
          ✕
        </button>
      </header>

      {/* min-h-0 lets this area scroll instead of growing; relative keeps the absolutely
          positioned screen-reader text inside it, or that text stretches the whole page. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <dl className="divide-y divide-border">
          <Field label={t('drawer.declared')}>{cell.declared}</Field>
          <Field label={t('drawer.installed')}>
            {cell.installed ?? (
              <span className="font-sans text-text-muted italic">{t('drawer.notInstalled')}</span>
            )}
          </Field>
          <Field label={t('drawer.latest')}>
            {row.latest ?? (
              <span className="font-sans text-text-muted">{t('drawer.unknownLatest')}</span>
            )}
          </Field>
          {showsUpdateBadge(row, cell) && (
            <Field label={t('drawer.status')}>
              <span className="inline-flex items-center gap-1.5 font-sans">
                <UpdateBadge type={cell.updateType} />
                {t(`update.${cell.updateType}`)}
              </span>
            </Field>
          )}
          <Field label={t('drawer.depType')}>{cell.depType}</Field>
        </dl>

        {row.lookup !== 'ok' && (
          <p className="mt-3 text-sm text-text-muted">{t(`drawer.lookup.${row.lookup}`)}</p>
        )}
        {cell.installed === null && row.lookup === 'ok' && (
          <p className="mt-3 text-sm text-text-muted">{t('drawer.estimated')}</p>
        )}

        {canUpdate(row, cell) && (
          <section aria-labelledby="drawer-update" className="mt-5">
            <h3 id="drawer-update" className="mb-2 text-sm font-semibold">
              {t('drawer.update')}
            </h3>
            <UpdateSection
              key={`${row.name}:${project.id}`}
              row={row}
              cell={cell}
              project={project}
              api={api}
              activity={activity}
            />
          </section>
        )}

        <h3 className="mt-5 mb-2 text-sm font-semibold">{t('drawer.advisories')}</h3>
        {vulnerability === 'unknown' ? (
          cell.installed !== null && (
            <p className="text-sm text-text-muted">{t('drawer.vulnUnknown')}</p>
          )
        ) : advisories.length === 0 ? (
          <p className="text-sm text-text-muted">{t('drawer.noAdvisories')}</p>
        ) : (
          <ul className="space-y-2">
            {advisories.map((advisory) => (
              <li key={advisory.id} className="rounded-md border border-border p-2.5">
                <div className="flex items-start gap-2">
                  <VulnerabilityMarker
                    vulnerability={{
                      severity: advisory.severity,
                      count: 1,
                      advisoryIds: [advisory.id],
                    }}
                  />
                  <a
                    href={advisory.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link text-sm font-medium"
                  >
                    {advisory.title}
                  </a>
                </div>
                <p className="mt-1 ps-9 font-mono text-xs text-text-muted">
                  <span className="sr-only">{t(`severity.${advisory.severity}`)}. </span>
                  {t('drawer.affected', { range: advisory.vulnerableVersions })}
                </p>
              </li>
            ))}
          </ul>
        )}

        {others.length > 0 && (
          <>
            <h3 className="mt-5 mb-1 text-sm font-semibold">{t('drawer.otherProjects')}</h3>
            <dl className="divide-y divide-border">
              {others.map((p) => {
                const other = row.cells[p.id];
                return other === undefined ? null : (
                  <Field key={p.id} label={p.name}>
                    {cellVersionText(other)}
                  </Field>
                );
              })}
            </dl>
          </>
        )}

        {row.lookup === 'ok' && (
          <a
            href={`https://www.npmjs.com/package/${row.name}`}
            target="_blank"
            rel="noreferrer noopener"
            className="link mt-5 inline-block text-sm"
          >
            {t('drawer.npm')} ↗
          </a>
        )}
      </div>
    </aside>
  );
}
