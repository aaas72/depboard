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

const KIND_STYLE: Record<InsightKind, string> = {
  'vulnerable-spread': 'text-severity-high',
  'version-drift': 'text-drift-1',
  'major-lag': 'text-update-major',
};

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

  return (
    <section aria-labelledby="drift-title" className="px-4 pt-3 pb-2">
      <h2 id="drift-title" className="sr-only">
        {t('drift.title')}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {shown.map((insight) => {
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
                <span className={`flex-none ${KIND_STYLE[insight.kind]}`}>
                  {KIND_ICON[insight.kind]}
                </span>
                <span>
                  <Sentence insight={insight} />
                </span>
              </button>
            </li>
          );
        })}
        {insights.length > HEADLINE_COUNT && (
          <li className="flex items-center">
            <button
              type="button"
              onClick={() => {
                setShowAll((v) => !v);
              }}
              className="rounded px-2 py-1 text-sm text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {showAll ? t('drift.showLess') : t('drift.showAll', { n: insights.length })}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

export { Sentence as InsightSentence };
