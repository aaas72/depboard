import type { Insight } from './domain.js';

/** At most this many headlines of one kind, while other kinds have something to say. */
export const MAX_HEADLINES_PER_KIND = 3;

/**
 * The headline insights for the top of the matrix:
 * - at most one per package (its most important one), so one package can't fill every slot;
 * - at most `MAX_HEADLINES_PER_KIND` of one kind at first, so a long list of vulnerabilities
 *   doesn't hide the version-drift story (and the other way round). Leftover slots are then
 *   filled by importance.
 */
export function pickHeadlines(insights: readonly Insight[], limit = 5): Insight[] {
  const seen = new Set<string>();
  const candidates = insights.filter((insight) => {
    if (seen.has(insight.package)) return false;
    seen.add(insight.package);
    return true;
  });

  const picked = new Set<Insight>();
  const perKind = new Map<Insight['kind'], number>();
  for (const insight of candidates) {
    if (picked.size === limit) break;
    const used = perKind.get(insight.kind) ?? 0;
    if (used >= MAX_HEADLINES_PER_KIND) continue;
    picked.add(insight);
    perKind.set(insight.kind, used + 1);
  }
  for (const insight of candidates) {
    if (picked.size === limit) break;
    picked.add(insight);
  }

  // Keep importance order.
  return candidates.filter((insight) => picked.has(insight));
}
