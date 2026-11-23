import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useVirtualizer, type Rect } from '@tanstack/react-virtual';
import type { MatrixRow, Project } from '@depboard/shared';
import { t } from '../../lib/i18n.js';
import { routeHref } from '../../lib/route.js';
import { UpdateBadge, VulnerabilityMarker, cellAriaLabel, showsUpdateBadge } from './badges.js';
import { SplitIcon } from '../../components/ui/icons.js';
import { cellVersionText, driftGroups } from './model.js';

const LATEST_W = 96;
// Room for a version, an update word ("↑ minor"), and a severity word ("moderate").
const COL_W = 196;
const ROW_H = 34;
const HEADER_H = 60;
/** First-paint size before the container is measured (and the size used in tests). */
const INITIAL_RECT: Rect = { width: 1280, height: 720 };

/**
 * One underline color per release line in a drifting row, highest line first. A border, not
 * text-decoration: the version text truncates, and overflow would clip an offset underline.
 */
const DRIFT_STYLE = [
  'border-drift-1',
  'border-drift-2',
  'border-drift-3',
  'border-drift-4',
] as const;

const ACTIVE_RING = 'outline-2 -outline-offset-2 outline-focus';

export interface CellRef {
  row: MatrixRow;
  project: Project;
}

export interface MatrixGridProps {
  rows: readonly MatrixRow[];
  projects: readonly Project[];
  onOpenCell: (cell: CellRef) => void;
  /** The cell shown in the drawer, highlighted in the grid. */
  openCell: { rowName: string; projectId: string } | null;
  /** The package column's width, from `nameColumnWidth` over every package (not just the visible ones). */
  nameWidth: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cellId(prefix: string, r: number, c: number): string {
  return `${prefix}-c-${String(r)}-${String(c)}`;
}

/** The visible slice of project columns, as plain numbers so rows can skip re-rendering. */
interface ColumnWindow {
  from: number;
  to: number;
  padStart: number;
  padEnd: number;
  totalWidth: number;
}

interface GridRowProps {
  row: MatrixRow;
  index: number;
  start: number;
  projects: readonly Project[];
  cols: ColumnWindow;
  /** The focused cell's column when this row holds it, otherwise null. */
  activeCol: number | null;
  openProjectId: string | null;
  idPrefix: string;
  onCellClick: (rowIndex: number, col: number) => void;
  /** The package column's width: it fits the longest name (`nameColumnWidth`). */
  nameWidth: number;
}

/**
 * One package row. Memoized: while scrolling, only rows entering the view render, which is
 * what keeps 500 × 30 smooth (.github/CONTRIBUTING.md, performance budgets).
 */
const GridRow = memo(function GridRow({
  row,
  index,
  start,
  projects,
  cols,
  activeCol,
  openProjectId,
  idPrefix,
  onCellClick,
  nameWidth,
}: GridRowProps) {
  const groups = useMemo(() => driftGroups(row), [row]);
  // How many release lines the row's projects are split across: 2+ is version drift.
  const lines = new Set(groups.values()).size;
  const ring = (c: number) => (activeCol === c ? ACTIVE_RING : '');
  // Rows alternate two grays instead of lines between them. The sticky columns repeat the
  // row's color so scrolled cells never show through.
  const stripe = index % 2 === 0 ? 'bg-row' : 'bg-row-alt';

  const cells = [];
  for (let i = cols.from; i <= cols.to; i++) {
    const project = projects[i];
    if (project === undefined) continue;
    const cell = row.cells[project.id];
    const col = i + 2;
    const base = `flex flex-none items-center gap-1.5 px-2 ${ring(col)} ${openProjectId === project.id ? 'bg-surface-sunken' : ''}`;
    if (cell === undefined) {
      // The project doesn't use this package: completely empty, on purpose.
      cells.push(
        <div
          key={project.id}
          id={cellId(idPrefix, index, col)}
          role="gridcell"
          aria-colindex={col + 1}
          className={base}
          style={{ width: COL_W }}
          onClick={() => {
            onCellClick(index, col);
          }}
        />,
      );
      continue;
    }
    const group = groups.get(project.id);
    const drift =
      group === undefined ? '' : `border-b-2 ${DRIFT_STYLE[group % DRIFT_STYLE.length] ?? ''}`;
    const vulnerability = cell.vulnerability;
    cells.push(
      <div
        key={project.id}
        id={cellId(idPrefix, index, col)}
        role="gridcell"
        aria-colindex={col + 1}
        aria-label={cellAriaLabel(row, cell, project)}
        className={`${base} cursor-pointer`}
        style={{ width: COL_W }}
        onClick={() => {
          onCellClick(index, col);
        }}
      >
        <span
          className={`min-w-0 truncate font-mono text-xs text-accent ${cell.installed === null ? 'italic' : ''} ${drift}`}
        >
          {cellVersionText(cell)}
        </span>
        {showsUpdateBadge(row, cell) && <UpdateBadge type={cell.updateType} />}
        {vulnerability !== null && vulnerability !== 'unknown' && (
          <VulnerabilityMarker vulnerability={vulnerability} />
        )}
      </div>,
    );
  }

  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      className={`group absolute start-0 top-0 flex ${stripe} hover:bg-row-hover`}
      style={{ height: ROW_H, width: cols.totalWidth, transform: `translateY(${String(start)}px)` }}
    >
      <div
        id={cellId(idPrefix, index, 0)}
        role="rowheader"
        aria-colindex={1}
        title={row.name}
        className={`sticky start-0 z-10 flex items-center px-3 text-sm font-medium ${stripe} group-hover:bg-row-hover ${ring(0)}`}
        style={{ width: nameWidth }}
        onClick={() => {
          onCellClick(index, 0);
        }}
      >
        <span className="truncate">{row.name}</span>
        {lines > 1 && (
          // Drift said in words next to the name; the colored underlines show who is on which line.
          <span className="ms-auto inline-flex flex-none items-center gap-1 ps-2 text-xs font-normal text-accent">
            <SplitIcon className="size-3" />
            {t('matrix.versions', { n: lines })}
          </span>
        )}
      </div>
      <div
        id={cellId(idPrefix, index, 1)}
        role="gridcell"
        aria-colindex={2}
        className={`sticky z-10 flex items-center px-2 font-mono text-xs text-text-muted ${stripe} group-hover:bg-row-hover ${ring(1)}`}
        style={{ width: LATEST_W, insetInlineStart: nameWidth }}
        onClick={() => {
          onCellClick(index, 1);
        }}
      >
        {row.latest ?? (row.lookup === 'failed' ? '?' : '')}
      </div>
      <div aria-hidden="true" style={{ width: cols.padStart, flex: 'none' }} />
      {cells}
      <div aria-hidden="true" style={{ width: cols.padEnd, flex: 'none' }} />
    </div>
  );
});

/**
 * The matrix: one row per package, one column per project. Rows and project columns are
 * virtualized (500 × 30 must scroll smoothly); the package and "Latest" columns and the
 * header row stay in place. Keyboard: arrows move, Enter opens a cell, Home/End and
 * PageUp/PageDown jump. Focus stays on the grid; the active cell is announced through
 * aria-activedescendant.
 */
export function MatrixGrid({ rows, projects, onOpenCell, openCell, nameWidth }: MatrixGridProps) {
  const stickyW = nameWidth + LATEST_W;
  const scrollRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  const [active, setActive] = useState({ row: 0, col: 2 });
  const [focused, setFocused] = useState(false);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  // No React Compiler in this project: the virtualizer re-renders on scroll by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
    paddingStart: HEADER_H,
    scrollPaddingStart: HEADER_H,
    initialRect: INITIAL_RECT,
    useFlushSync: false,
  });
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: projects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COL_W,
    overscan: 3,
    paddingStart: stickyW,
    scrollPaddingStart: stickyW,
    isRtl: rtl,
    initialRect: INITIAL_RECT,
    useFlushSync: false,
  });

  const lastCol = projects.length + 1;
  const activeRow = clamp(active.row, 0, Math.max(0, rows.length - 1));
  const activeCol = clamp(active.col, 0, lastCol);

  // Rows get one stable click handler; it reads the latest data through a ref.
  const latest = useRef({ rows, projects, onOpenCell });
  useEffect(() => {
    latest.current = { rows, projects, onOpenCell };
  });
  const open = useCallback((r: number, c: number) => {
    const { rows: currentRows, projects: currentProjects, onOpenCell: openIt } = latest.current;
    const row = currentRows[r];
    const project = currentProjects[c - 2];
    if (row !== undefined && project !== undefined && row.cells[project.id] !== undefined) {
      openIt({ row, project });
    }
  }, []);
  const onCellClick = useCallback(
    (r: number, c: number) => {
      setActive({ row: r, col: c });
      open(r, c);
    },
    [open],
  );

  const moveTo = (r: number, c: number) => {
    const row = clamp(r, 0, rows.length - 1);
    const col = clamp(c, 0, lastCol);
    setActive({ row, col });
    rowVirtualizer.scrollToIndex(row);
    if (col >= 2) colVirtualizer.scrollToIndex(col - 2);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const forward = rtl ? -1 : 1;
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 600) / ROW_H) - 2);
    const moves: Record<string, (() => void) | undefined> = {
      ArrowDown: () => {
        moveTo(activeRow + 1, activeCol);
      },
      ArrowUp: () => {
        moveTo(activeRow - 1, activeCol);
      },
      ArrowRight: () => {
        moveTo(activeRow, activeCol + forward);
      },
      ArrowLeft: () => {
        moveTo(activeRow, activeCol - forward);
      },
      PageDown: () => {
        moveTo(activeRow + page, activeCol);
      },
      PageUp: () => {
        moveTo(activeRow - page, activeCol);
      },
      Home: () => {
        moveTo(event.ctrlKey ? 0 : activeRow, 0);
      },
      End: () => {
        moveTo(event.ctrlKey ? rows.length - 1 : activeRow, lastCol);
      },
      Enter: () => {
        open(activeRow, activeCol);
      },
      ' ': () => {
        open(activeRow, activeCol);
      },
    };
    const action = moves[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const vRows = rowVirtualizer.getVirtualItems();
  const vCols = colVirtualizer.getVirtualItems();
  const totalWidth = colVirtualizer.getTotalSize();
  const from = vCols[0]?.index ?? 0;
  const to = vCols.at(-1)?.index ?? -1;
  const padStart = (vCols[0]?.start ?? stickyW) - stickyW;
  const padEnd = totalWidth - (vCols.at(-1)?.end ?? stickyW);
  // Same numbers → same object, so memoized rows don't re-render on every scroll pixel.
  const cols = useMemo<ColumnWindow>(
    () => ({ from, to, padStart, padEnd, totalWidth }),
    [from, to, padStart, padEnd, totalWidth],
  );

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={t('matrix.label')}
      aria-rowcount={rows.length + 1}
      aria-colcount={projects.length + 2}
      aria-activedescendant={rows.length > 0 ? cellId(idPrefix, activeRow, activeCol) : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
      }}
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain focus:outline-none"
    >
      <div
        className="relative"
        style={{ height: rowVirtualizer.getTotalSize(), width: totalWidth }}
      >
        {/* Header row: sticks to the top while scrolling down. */}
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-20 flex bg-table-header"
          style={{ height: HEADER_H, width: totalWidth }}
        >
          <div
            role="columnheader"
            aria-colindex={1}
            className="sticky start-0 z-30 flex items-end bg-table-header px-3 pb-2 text-xs font-semibold tracking-wide text-text-muted uppercase"
            style={{ width: nameWidth }}
          >
            {t('matrix.package')} · {t('matrix.rows', { n: rows.length })}
          </div>
          <div
            role="columnheader"
            aria-colindex={2}
            className="sticky z-30 flex items-end bg-table-header px-2 pb-2 text-xs font-semibold tracking-wide text-text-muted uppercase"
            style={{ width: LATEST_W, insetInlineStart: nameWidth }}
          >
            {t('matrix.latest')}
          </div>
          <div aria-hidden="true" style={{ width: padStart, flex: 'none' }} />
          {vCols.map((vc) => {
            const project = projects[vc.index];
            if (project === undefined) return null;
            return (
              <div
                key={project.id}
                role="columnheader"
                aria-colindex={vc.index + 3}
                title={project.path}
                className="flex flex-none flex-col justify-end px-2 pb-2"
                style={{ width: COL_W }}
              >
                <a
                  href={routeHref({ view: 'project', projectId: project.id })}
                  aria-label={t('project.columnLink', { name: project.name })}
                  className="link truncate text-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {project.name}
                </a>
                <span className="truncate text-xs text-text-muted">
                  {project.workspacePackages === undefined
                    ? t('project.manager', { manager: project.manager })
                    : t('project.workspace', {
                        manager: project.manager,
                        n: project.workspacePackages,
                      })}
                </span>
              </div>
            );
          })}
          <div aria-hidden="true" style={{ width: padEnd, flex: 'none' }} />
        </div>

        {vRows.map((vr) => {
          const row = rows[vr.index];
          if (row === undefined) return null;
          return (
            <GridRow
              key={row.name}
              row={row}
              index={vr.index}
              start={vr.start}
              projects={projects}
              cols={cols}
              activeCol={focused && vr.index === activeRow ? activeCol : null}
              openProjectId={openCell?.rowName === row.name ? openCell.projectId : null}
              idPrefix={idPrefix}
              onCellClick={onCellClick}
              nameWidth={nameWidth}
            />
          );
        })}
      </div>
    </div>
  );
}
