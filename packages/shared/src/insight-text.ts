import type { Insight } from './domain.js';

/** A sentence split into parts, so the UI can bold the package name and numbers. */
export type InsightTextPart = { text: string; strong?: boolean };

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * English wording for an insight. Written to survive a screenshot: short, plain, no jargon.
 * Kept separate from the data so other languages can be added without touching the server.
 */
/** "react", or "@angular/* (8 packages)" when a family is folded into one insight. */
export function insightSubject(insight: Insight): string {
  if (insight.related.length === 0) return insight.package;
  const scope = insight.package.split('/')[0] ?? insight.package;
  return `${scope}/* (${String(insight.related.length + 1)} packages)`;
}

export function describeInsight(insight: Insight): InsightTextPart[] {
  const projects = count(insight.projectIds.length, 'project');
  const subject = insightSubject(insight);
  const plural = insight.related.length > 0;
  switch (insight.kind) {
    case 'vulnerable-spread': {
      const many = insight.advisories.length > 1;
      return [
        { text: subject, strong: true },
        {
          text: many
            ? ` has ${insight.advisories.length} known vulnerabilities (${insight.severity}) in `
            : ` has a ${insight.severity} vulnerability in `,
        },
        { text: projects, strong: true },
      ];
    }
    case 'version-drift': {
      const allMajor = insight.lines.every((line) => !line.startsWith('0.'));
      return [
        { text: subject, strong: true },
        { text: plural ? ' are used at ' : ' is used at ' },
        {
          text: `${insight.lines.length} different ${allMajor ? 'major versions' : 'versions'}`,
          strong: true,
        },
        { text: ` across ${projects} (${insight.lines.join(', ')})` },
      ];
    }
    case 'major-lag':
      return [
        { text: subject, strong: true },
        {
          text:
            insight.majorsBehind > 1
              ? ` ${plural ? 'are' : 'is'} up to ${insight.majorsBehind} major versions behind in `
              : ` ${plural ? 'are' : 'is'} a major version behind in `,
        },
        { text: projects, strong: true },
        { text: ` (latest: ${insight.latest})` },
      ];
  }
}

export function describeInsightText(insight: Insight): string {
  return describeInsight(insight)
    .map((part) => part.text)
    .join('');
}
