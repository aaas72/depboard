import { useMemo } from 'react';
import type { MatrixRow, Project } from '@depboard/shared';
import { t } from '../../lib/i18n.js';
import { routeHref } from '../../lib/route.js';
import { UpdateBadge, VulnerabilityMarker, showsUpdateBadge } from '../matrix/badges.js';
import { projectSections, projectStats, type ProjectEntry } from './model.js';

export interface ProjectViewProps {
  project: Project;
  rows: readonly MatrixRow[];
  query: string;
  outdatedOnly: boolean;
  /** The package open in the drawer, highlighted here. */
  openPackage: string | null;
  onOpen: (row: MatrixRow) => void;
}

function Section({
  title,
  entries,
  openPackage,
  onOpen,
}: {
  title: string;
  entries: ProjectEntry[];
  openPackage: string | null;
  onOpen: (row: MatrixRow) => void;
}) {
  const headingId = `section-${title}`;
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h3 id={headingId} className="mb-2 text-sm font-semibold">
        {title} <span className="font-normal text-text-muted">({entries.length})</span>
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">{t('project.noneHere')}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-strong text-start text-xs tracking-wide text-text-muted uppercase">
              <th scope="col" className="py-2 pe-3 text-start font-semibold">
                {t('matrix.package')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start font-semibold">
                {t('drawer.declared')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start font-semibold">
                {t('drawer.installed')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start font-semibold">
                {t('drawer.latest')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start font-semibold">
                {t('drawer.status')}
              </th>
              <th scope="col" className="py-2 text-start font-semibold">
                {t('drawer.advisories')}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ row, cell }) => {
              const v = cell.vulnerability;
              return (
                <tr
                  key={row.name}
                  className={`border-b border-border hover:bg-surface-raised ${openPackage === row.name ? 'bg-surface-sunken' : ''}`}
                >
                  <th scope="row" className="py-1.5 pe-3 text-start font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(row);
                      }}
                      aria-label={t('project.open', { name: row.name })}
                      className="rounded text-start hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {row.name}
                    </button>
                  </th>
                  <td className="py-1.5 pe-3 font-mono text-xs">{cell.declared}</td>
                  <td className="py-1.5 pe-3 font-mono text-xs">
                    {cell.installed ?? (
                      <span className="font-sans text-text-muted italic">
                        {t('drawer.notInstalled')}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pe-3 font-mono text-xs text-text-muted">
                    {row.latest ?? ''}
                  </td>
                  <td className="py-1.5 pe-3">
                    {showsUpdateBadge(row, cell) && (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <UpdateBadge type={cell.updateType} />
                        {t(`update.${cell.updateType}`)}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {v !== null && v !== 'unknown' && (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <VulnerabilityMarker vulnerability={v} />
                        {t('cell.vulnerable', {
                          n: v.count,
                          severity: t(`severity.${v.severity}`),
                        })}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * One project's packages, split into dependencies and devDependencies. Reached from a project's
 * column header; the matrix stays the main screen. Rows open the same drawer as matrix cells.
 */
export function ProjectView({
  project,
  rows,
  query,
  outdatedOnly,
  openPackage,
  onOpen,
}: ProjectViewProps) {
  const sections = useMemo(
    () => projectSections(rows, project.id, { query, outdatedOnly }),
    [rows, project.id, query, outdatedOnly],
  );
  const stats = useMemo(() => projectStats(rows, project.id), [rows, project.id]);
  const outdated = stats.major + stats.minor + stats.patch;

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <a
        href={routeHref({ view: 'matrix' })}
        className="text-sm text-accent hover:underline focus-visible:outline-2 focus-visible:outline-focus"
      >
        ← {t('project.back')}
      </a>
      <h2 className="mt-2 text-lg font-semibold">
        {project.name}{' '}
        <span className="rounded border border-border px-1.5 py-0.5 align-middle text-xs font-normal text-text-muted">
          {project.manager}
        </span>
      </h2>
      <p className="font-mono text-xs break-all text-text-muted">{project.path}</p>
      <p className="mt-2 text-sm">
        {t('matrix.rows', { n: stats.total })} ·{' '}
        {outdated === 0
          ? t('project.allCurrent')
          : t('project.outdated', {
              major: stats.major,
              minor: stats.minor,
              patch: stats.patch,
            })}{' '}
        · {t('project.vulnerable', { n: stats.vulnerable })}
      </p>
      {stats.notInstalled > 0 && (
        <p className="mt-1 text-sm text-text-muted">
          {t('project.notInstalled', { n: stats.notInstalled })}
        </p>
      )}

      <Section
        title={t('project.dependencies')}
        entries={sections.dependencies}
        openPackage={openPackage}
        onOpen={onOpen}
      />
      <Section
        title={t('project.devDependencies')}
        entries={sections.devDependencies}
        openPackage={openPackage}
        onOpen={onOpen}
      />
    </div>
  );
}
