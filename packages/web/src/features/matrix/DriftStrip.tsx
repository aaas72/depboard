import { useState, type ReactNode } from 'react';
import {
  describeInsight,
  describeInsightText,
  pickHeadlines,
  type Insight,
  type InsightKind,
} from '@depboard/shared';
import { ClockIcon, ShieldIcon, SplitIcon } from '../../components/ui/icons.js';
import { t } from '../../lib/i18n.js';

export const HEADLINE_COUNT = 5;

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

  const shown = showAll ? insights : pickHeadlines(insights, HEADLINE_COUNT);
  const counts = KIND_ORDER.map((kind) => ({
    kind,
    n: insights.filter((insight) => insight.kind === kind).length,
  })).filter((c) => c.n > 0);

  const item = (insight: Insight) => {
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
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-start text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
            pressed
              ? 'border-accent bg-surface-sunken'
              : 'border-border bg-surface-raised hover:border-border-strong'
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

  const toggle = insights.length > HEADLINE_COUNT && (
    <button
      type="button"
      onClick={() => {
        setShowAll((v) => !v);
      }}
      className="rounded px-2 py-1 text-sm text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
    >
      {showAll ? t('drift.showLess') : t('drift.showAll', { n: insights.length })}
    </button>
  );

  return (
    <section aria-labelledby="drift-title" className="px-4 pt-3 pb-2">
      {/* The title and the icon key: a first-time viewer learns what the strip is and what each
          icon means without hovering anything. */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="drift-title" className="text-sm font-semibold">
          {t('drift.title')}
        </h2>
        <ul aria-hidden="true" className="flex flex-wrap gap-x-3 text-xs text-text-muted">
          {counts.map(({ kind, n }) => (
            <li key={kind} className="inline-flex items-center gap-1">
              <KindIcon kind={kind} /> {n} {t(`drift.key.${kind}`)}
            </li>
          ))}
        </ul>
      </div>
      {showAll ? (
        // Everything, grouped by kind: a long mixed list reads as noise.
        <>
          {KIND_ORDER.map((kind) => {
            const group = shown.filter((insight) => insight.kind === kind);
            if (group.length === 0) return null;
            const headingId = `drift-group-${kind}`;
            return (
              <section key={kind} aria-labelledby={headingId} className="mb-2">
                <h3
                  id={headingId}
                  className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-text-muted"
                >
                  <KindIcon kind={kind} />
                  {t(`drift.group.${kind}`)} ({group.length})
                </h3>
                <ul className="flex flex-wrap gap-2">{group.map(item)}</ul>
              </section>
            );
          })}
          {toggle}
        </>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {shown.map(item)}
          {toggle && <li className="flex items-center">{toggle}</li>}
        </ul>
      )}
    </section>
  );
}

export { Sentence as InsightSentence };
