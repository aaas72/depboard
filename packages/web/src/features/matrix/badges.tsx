import type {
  CellVulnerability,
  MatrixCell,
  MatrixRow,
  Project,
  UpdateType,
} from '@depboard/shared';
import { ShieldIcon } from '../../components/ui/icons.js';
import { t } from '../../lib/i18n.js';
import { cellVersionText, SEVERITY_LETTER, UPDATE_GLYPH } from './model.js';

const UPDATE_STYLE: Record<UpdateType, string> = {
  none: 'bg-update-none text-update-none-fg',
  patch: 'bg-update-patch text-update-patch-fg',
  minor: 'bg-update-minor text-update-minor-fg',
  major: 'bg-update-major text-update-major-fg',
  prerelease: 'bg-update-none text-update-none-fg',
  unknown: 'stripes bg-update-unknown text-update-unknown-fg',
};

const SEVERITY_STYLE: Record<CellVulnerability['severity'], string> = {
  low: 'bg-severity-low text-severity-low-fg',
  moderate: 'bg-severity-moderate text-severity-moderate-fg',
  high: 'bg-severity-high text-severity-high-fg',
  critical:
    'bg-severity-critical text-severity-critical-fg ring-2 ring-severity-critical ring-offset-1 ring-offset-surface',
};

/** "How old?": a letter on a color, never color alone. */
export function UpdateBadge({ type }: { type: UpdateType }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[0.6875rem] leading-none font-semibold ${UPDATE_STYLE[type]}`}
    >
      {UPDATE_GLYPH[type]}
    </span>
  );
}

/** "How dangerous?": a shield and a severity letter, visually apart from the update badge. */
export function VulnerabilityMarker({ vulnerability }: { vulnerability: CellVulnerability }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 items-center gap-0.5 rounded-full px-1 text-[0.6875rem] leading-none font-bold ${SEVERITY_STYLE[vulnerability.severity]}`}
    >
      <ShieldIcon className="size-2.5" />
      {SEVERITY_LETTER[vulnerability.severity]}
    </span>
  );
}

/**
 * Whether a cell's update status is worth a badge. Rows DepBoard deliberately doesn't look
 * up (workspace:, file:, git…) or that aren't on the registry get none: "?" means a fetch failed.
 */
export function showsUpdateBadge(row: MatrixRow, cell: MatrixCell): boolean {
  if (row.lookup === 'failed') return true;
  return row.lookup === 'ok' && (cell.updateType !== 'unknown' || cell.version === null);
}

/** The full spoken description of a cell, e.g. "react in web-app: 18.3.1, major update available: 18.3.1 → 19.1.0". */
export function cellAriaLabel(row: MatrixRow, cell: MatrixCell, project: Project): string {
  const parts = [`${row.name} in ${project.name}: ${cellVersionText(cell)}`];
  if (cell.installed === null) parts.push(t('cell.notInstalled', { declared: cell.declared }));
  if (showsUpdateBadge(row, cell)) {
    const status = t(`update.${cell.updateType}`);
    parts.push(
      isBehind(cell.updateType) && row.latest !== null
        ? `${status}: ${cellVersionText(cell)} → ${row.latest}`
        : status,
    );
  }
  const v = cell.vulnerability;
  if (v !== null && v !== 'unknown') {
    parts.push(t('cell.vulnerable', { n: v.count, severity: t(`severity.${v.severity}`) }));
  }
  return parts.join(', ');
}

function isBehind(type: UpdateType): boolean {
  return type === 'patch' || type === 'minor' || type === 'major' || type === 'prerelease';
}
