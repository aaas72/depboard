import { describe, expect, it } from 'vitest';
import type { Insight } from './domain.js';
import { describeInsight, describeInsightText } from './insight-text.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('describeInsightText', () => {
  it('words version drift on majors', () => {
    const insight: Insight = {
      kind: 'version-drift',
      package: 'react',
      related: [],
      lines: ['19', '18', '17'],
      versions: ['19.1.0', '18.3.1', '17.0.2'],
      projectIds: ids(7),
      score: 1,
    };
    expect(describeInsightText(insight)).toBe(
      'react is used at 3 different major versions across 7 projects (19, 18, 17)',
    );
  });

  it('says "versions", not "major versions", for 0.x lines', () => {
    const insight: Insight = {
      kind: 'version-drift',
      package: 'x',
      related: [],
      lines: ['0.3', '0.2'],
      versions: ['0.3.0', '0.2.1'],
      projectIds: ids(2),
      score: 1,
    };
    expect(describeInsightText(insight)).toBe(
      'x is used at 2 different versions across 2 projects (0.3, 0.2)',
    );
  });

  it('words a single vulnerability and several', () => {
    const base = {
      kind: 'vulnerable-spread',
      package: 'lodash',
      related: [] as string[],
      severity: 'high',
      score: 1,
    } as const;
    const advisory = { id: 1, title: 't', url: 'u', severity: 'high' } as const;
    expect(describeInsightText({ ...base, projectIds: ids(4), advisories: [advisory] })).toBe(
      'lodash has a high vulnerability in 4 projects',
    );
    expect(
      describeInsightText({
        ...base,
        projectIds: ids(1),
        advisories: [advisory, { ...advisory, id: 2 }],
      }),
    ).toBe('lodash has 2 known vulnerabilities (high) in 1 project');
  });

  it('words major lag', () => {
    const base = {
      kind: 'major-lag',
      package: 'typescript',
      related: [] as string[],
      latest: '5.9.2',
      score: 1,
    } as const;
    expect(describeInsightText({ ...base, majorsBehind: 1, projectIds: ids(5) })).toBe(
      'typescript is a major version behind in 5 projects (latest: 5.9.2)',
    );
    expect(describeInsightText({ ...base, majorsBehind: 3, projectIds: ids(2) })).toBe(
      'typescript is up to 3 major versions behind in 2 projects (latest: 5.9.2)',
    );
  });

  it('marks the package name and the numbers as strong, for the UI', () => {
    const parts = describeInsight({
      kind: 'vulnerable-spread',
      package: 'next',
      related: [],
      severity: 'critical',
      advisories: [{ id: 1, title: 't', url: 'u', severity: 'critical' }],
      projectIds: ids(3),
      score: 1,
    });
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual(['next', '3 projects']);
  });

  it('names a whole family once, with plural verbs', () => {
    const drift: Insight = {
      kind: 'version-drift',
      package: '@angular/cli',
      related: ['@angular/common', '@angular/core'],
      lines: ['22', '21', '18'],
      versions: ['22.0.0', '21.1.0', '18.2.0'],
      projectIds: ids(4),
      score: 1,
    };
    expect(describeInsightText(drift)).toBe(
      '@angular/* (3 packages) are used at 3 different major versions across 4 projects (22, 21, 18)',
    );
    expect(
      describeInsightText({
        kind: 'major-lag',
        package: '@babel/core',
        related: ['@babel/preset-env'],
        latest: '8.0.0',
        majorsBehind: 1,
        projectIds: ids(2),
        score: 1,
      }),
    ).toBe('@babel/* (2 packages) are a major version behind in 2 projects (latest: 8.0.0)');
  });
});
