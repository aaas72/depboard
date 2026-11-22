import { useState, type ReactNode } from 'react';
import {
  describeInsight,
  describeInsightText,
  type Insight,
  type InsightKind,
} from '@depboard/shared';
import { ClockIcon, ShieldIcon, SplitIcon } from '../../components/ui/icons.js';
import { t } from '../../lib/i18n.js';

/** Findings shown per kind before "Show all": the top ones, ranked by impact. */
export const COLLAPSED_PER_KIND = 2;

const KIND_ICON: Record<InsightKind, ReactNode> = {
  'vulnerable-spread': <ShieldIcon className="size-3.5" />,
  'version-drift': <SplitIcon />,
  'major-lag': <ClockIcon />,
};

// One brand color for every kind: the icon's shape tells the kinds apart (and the key next to
// the title names them), so the strip reads as one voice instead of three competing colors.
const KIND_STYLE: Record<InsightKind, string> = {
  'vulnerable-spread': 'text-accent',
  'version-drift': 'text-accent',
  'major-lag': 'text-accent',
};

/** The order the strip ranks kinds in: the most dangerous first. */
const KIND_ORDER: readonly InsightKind[] = ['vulnerable-spread', 'version-drift', 'major-lag'];

/** Static class names, so Tailwind sees them: one grid column per kind present. */
const GROUP_COLUMNS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

function KindIcon({ kind }: { kind: InsightKind }) {
  return <span className={`flex-none ${KIND_STYLE[kind]}`}>{KIND_ICON[kind]}</span>;
}

function Sentence({ insight }: { insight: Insight }) {
  return (
    <>
      {describeInsight(insight).map((part, i) =>
        part.strong ? (
          <strong key={i} className="font-semibold">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export interface DriftStripProps {
  insights: readonly Insight[];
  projectCount: number;
  focused: Insight | null;
  onFocus: (insight: Insight | null) => void;
}

/**
 * The first thing on screen: plain sentences about what is happening across all projects,
 * ranked by impact. Each one narrows the matrix to its packages and projects. Sentences are
 * written to survive a screenshot, so they wrap instead of truncating.
 */
export function DriftStrip({ insights, projectCount, focused, onFocus }: DriftStripProps) {
  const [showAll, setShowAll] = useState(false);

  if (insights.length === 0) {
    if (projectCount < 2) return null;
    return (
      <section aria-label={t('drift.title')} className="px-4 py-3 text-sm">
        {t('drift.allAgree', { n: projectCount })}
      </section>
    );
  }

  // One column per kind, collapsed or not: the top findings of each kind first, all of them
  // with "Show all". Insights arrive ranked, so the first ones of a kind are its most important.
  const groups = KIND_ORDER.map((kind) => {
    const all = insights.filter((insight) => insight.kind === kind);
    return { kind, all, items: showAll ? all : all.slice(0, COLLAPSED_PER_KIND) };
  }).filter((g) => g.all.length > 0);
  const hasMore = groups.some((g) => g.all.length > COLLAPSED_PER_KIND);

  /** One finding, as a table row: no border, alternating row colors like the matrix. */
  const item = (insight: Insight, rowIndex: number) => {
    const pressed = focused === insight;
    const family = insight.related.length > 0 ? [insight.package, ...insight.related] : null;
    return (
      <li key={`${insight.kind}:${insight.package}`}>
        <button
          type="button"
          aria-pressed={pressed}
          aria-label={`${t(`drift.kind.${insight.kind}`)}: ${describeInsightText(insight)}`}
          title={family ? t('drift.family', { list: family.join(', ') }) : undefined}
          onClick={() => {
            onFocus(pressed ? null : insight);
          }}
          className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
            pressed
              ? 'bg-accent/20'
              : `${rowIndex % 2 === 0 ? 'bg-row' : 'bg-row-alt'} hover:bg-row-hover`
          }`}
        >
          <KindIcon kind={insight.kind} />
          <span>
            <Sentence insight={insight} />
          </span>
        </button>
      </li>
    );
  };

  return (
    <section aria-labelledby="drift-title" className="px-4 pt-3 pb-2">
      {/* The title and the icon key: a first-time viewer learns what the strip is and what each
          icon means without hovering anything. */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="drift-title" className="text-sm font-semibold">
          {t('drift.title')}
        </h2>
        <ul aria-hidden="true" className="flex flex-wrap gap-x-3 text-xs text-text-muted">
          {groups.map(({ kind, all }) => (
            <li key={kind} className="inline-flex items-center gap-1">
              <KindIcon kind={kind} /> {all.length} {t(`drift.key.${kind}`)}
            </li>
          ))}
        </ul>
      </div>
      {/* Columns side by side, most dangerous on the start side; they stack on narrow screens.
          A long list scrolls as one block (at most 45% of the window) so the matrix stays in reach. */}
      <div
        className={`grid max-h-[45vh] gap-4 overflow-y-auto ${GROUP_COLUMNS[groups.length] ?? 'md:grid-cols-3'}`}
      >
        {groups.map(({ kind, all, items }) => {
          const headingId = `drift-group-${kind}`;
          return (
            <section
              key={kind}
              aria-labelledby={headingId}
              className="min-w-0 self-start overflow-hidden rounded-md"
            >
              <h3
                id={headingId}
                className="flex items-center gap-1.5 bg-table-header px-3 py-2 text-xs font-semibold text-text-muted"
              >
                <KindIcon kind={kind} />
                {t(`drift.group.${kind}`)} ({all.length})
              </h3>
              <ul className="flex flex-col">{items.map((insight, i) => item(insight, i))}</ul>
            </section>
          );
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => {
            setShowAll((v) => !v);
          }}
          className="mt-2 rounded px-2 py-1 text-sm text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          {showAll ? t('drift.showLess') : t('drift.showAll', { n: insights.length })}
        </button>
      )}
    </section>
  );
}

export { Sentence as InsightSentence };
