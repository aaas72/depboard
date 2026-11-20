import { describe, expect, it } from 'vitest';
import type { MatrixCell, MatrixRow, Project, Severity } from '@depboard/shared';
import { classifyUpdate } from '../versions/classify.js';
import { computeInsights, pickHeadlines, releaseLine } from './compute-insights.js';

const projects: Project[] = ['alpha', 'bravo', 'charlie', 'delta'].map((name) => ({
  id: `id-${name}`,
  name,
  path: `/p/${name}`,
  manager: 'npm',
}));

interface CellSpec {
  installed?: string;
  declared?: string;
  vulnerable?: Severity;
}

/** Builds a matrix row the way buildMatrix would, from a compact description. */
function row(name: string, latest: string | null, cells: Record<string, CellSpec>): MatrixRow {
  const built: Record<string, MatrixCell> = {};
  for (const [project, spec] of Object.entries(cells)) {
    const id = `id-${project}`;
    const version = spec.installed ?? spec.declared?.replace(/^[\^~]/, '') ?? null;
    built[id] = {
      projectId: id,
      declared: spec.declared ?? `^${spec.installed ?? '0.0.0'}`,
      installed: spec.installed ?? null,
      version,
      versionSource: spec.installed ? 'installed' : 'declared',
      updateType: classifyUpdate(version, latest),
      depType: 'dependencies',
      vulnerability: spec.vulnerable
        ? { severity: spec.vulnerable, count: 1, advisoryIds: [1] }
        : spec.installed
          ? null
          : 'unknown',
    };
  }
  return {
    name,
    latest,
    lookup: 'ok',
    cells: built,
    advisories: Object.values(cells).some((c) => c.vulnerable)
      ? [
          {
            id: 1,
            title: 'Bad thing',
            url: 'https://x',
            severity: 'high',
            vulnerableVersions: '<9',
          },
        ]
      : [],
  };
}

const kinds = (rows: MatrixRow[]) =>
  computeInsights(projects, rows).map((i) => `${i.kind}:${i.package}`);

describe('releaseLine', () => {
  it.each([
    ['18.3.1', '18'],
    ['0.3.2', '0.3'],
    ['0.0.4', '0.0'],
    ['nope', null],
  ])('%s → %s', (version, line) => {
    expect(releaseLine(version)).toBe(line);
  });
});

describe('version drift', () => {
  it('reports the same package on different majors', () => {
    const insights = computeInsights(projects, [
      row('react', '19.1.0', {
        alpha: { installed: '17.0.2' },
        bravo: { installed: '18.3.1' },
        charlie: { installed: '19.1.0' },
      }),
    ]);
    expect(insights.find((i) => i.kind === 'version-drift')).toMatchObject({
      package: 'react',
      lines: ['19', '18', '17'],
      versions: ['19.1.0', '18.3.1', '17.0.2'],
      projectIds: ['id-alpha', 'id-bravo', 'id-charlie'],
    });
  });

  it('treats 0.x minors as different release lines', () => {
    const insights = computeInsights(projects, [
      row('zustand-like', '0.3.0', {
        alpha: { installed: '0.2.1' },
        bravo: { installed: '0.3.0' },
      }),
    ]);
    expect(insights.find((i) => i.kind === 'version-drift')).toMatchObject({
      lines: ['0.3', '0.2'],
    });
  });

  it('ignores patch and minor differences on the same major (not news)', () => {
    expect(
      kinds([
        row('lodash', '4.17.21', {
          alpha: { installed: '4.17.20' },
          bravo: { installed: '4.17.21' },
          charlie: { installed: '4.16.0' },
        }),
      ]),
    ).not.toContain('version-drift:lodash');
  });

  it('reports nothing when every project agrees, whatever their ranges say', () => {
    expect(
      kinds([
        row('react', '18.3.1', {
          alpha: { installed: '18.3.1', declared: '^18.2.0' },
          bravo: { installed: '18.3.1', declared: '^18.3.0' },
        }),
      ]),
    ).toEqual([]);
  });

  it('counts installed versions only, never estimates from ranges', () => {
    expect(
      kinds([
        row('react', '19.1.0', { alpha: { installed: '19.1.0' }, bravo: { declared: '^17.0.0' } }),
      ]),
    ).not.toContain('version-drift:react');
  });

  it('leaves prereleases out', () => {
    expect(
      kinds([
        row('react', '18.3.1', {
          alpha: { installed: '18.3.1' },
          bravo: { installed: '19.0.0-rc.1' },
        }),
      ]),
    ).not.toContain('version-drift:react');
  });
});

describe('vulnerable spread', () => {
  it('reports every project with a vulnerable installed version', () => {
    const insights = computeInsights(projects, [
      row('lodash', '4.17.21', {
        alpha: { installed: '4.17.15', vulnerable: 'high' },
        bravo: { installed: '4.17.21' },
        charlie: { installed: '4.17.10', vulnerable: 'critical' },
      }),
    ]);
    expect(insights[0]).toMatchObject({
      kind: 'vulnerable-spread',
      package: 'lodash',
      severity: 'critical',
      projectIds: ['id-alpha', 'id-charlie'],
    });
  });

  it('never reports unknown cells as vulnerable', () => {
    expect(kinds([row('lodash', '4.17.21', { alpha: { declared: '^4.0.0' } })])).toEqual([]);
  });
});

describe('major lag', () => {
  it('needs two or more projects behind', () => {
    expect(kinds([row('ts', '5.9.0', { alpha: { installed: '4.9.5' } })])).toEqual([]);
    const insights = computeInsights(projects, [
      row('ts', '5.9.0', {
        alpha: { installed: '4.9.5' },
        bravo: { installed: '3.9.0' },
        charlie: { installed: '5.9.0' },
      }),
    ]);
    expect(insights.find((i) => i.kind === 'major-lag')).toMatchObject({
      majorsBehind: 2,
      latest: '5.9.0',
      projectIds: ['id-alpha', 'id-bravo'],
    });
  });

  it('counts declared ranges too: ^17 can never install 19', () => {
    expect(
      kinds([
        row('react', '19.1.0', { alpha: { declared: '^17.0.0' }, bravo: { declared: '^16.8.0' } }),
      ]),
    ).toEqual(['major-lag:react']);
  });
});

describe('ranking', () => {
  const rows = [
    row('drifty', '3.0.0', { alpha: { installed: '1.0.0' }, bravo: { installed: '2.0.0' } }),
    row('critical-pkg', '2.0.0', { alpha: { installed: '1.0.0', vulnerable: 'critical' } }),
    row('moderate-pkg', '2.0.0', { alpha: { installed: '2.0.0', vulnerable: 'moderate' } }),
    row('high-pkg', '2.0.0', { alpha: { installed: '2.0.0', vulnerable: 'high' } }),
    row('laggy', '5.0.0', { alpha: { installed: '4.0.0' }, bravo: { installed: '4.0.0' } }),
  ];

  it('puts high and critical vulnerabilities above drift, drift above moderate, lag last', () => {
    expect(kinds(rows)).toEqual([
      'vulnerable-spread:critical-pkg',
      'vulnerable-spread:high-pkg',
      'version-drift:drifty',
      'vulnerable-spread:moderate-pkg',
      'major-lag:drifty',
      'major-lag:laggy',
    ]);
  });

  it('ranks wider spread higher within the same band', () => {
    const insights = computeInsights(projects, [
      row('narrow', '9.0.0', { alpha: { installed: '1.0.0', vulnerable: 'high' } }),
      row('wide', '9.0.0', {
        alpha: { installed: '1.0.0', vulnerable: 'high' },
        bravo: { installed: '1.0.0', vulnerable: 'high' },
        charlie: { installed: '1.0.0', vulnerable: 'high' },
      }),
    ]);
    expect(insights.filter((i) => i.kind === 'vulnerable-spread').map((i) => i.package)).toEqual([
      'wide',
      'narrow',
    ]);
  });

  it('is deterministic regardless of row order', () => {
    expect(kinds([...rows].reverse())).toEqual(kinds(rows));
  });
});

describe('pickHeadlines', () => {
  it('keeps one insight per package, its most important one', () => {
    const insights = computeInsights(projects, [
      row('react', '19.1.0', {
        alpha: { installed: '17.0.2', vulnerable: 'high' },
        bravo: { installed: '18.3.1' },
      }),
    ]);
    expect(insights.length).toBeGreaterThan(1);
    expect(pickHeadlines(insights).map((i) => i.kind)).toEqual(['vulnerable-spread']);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      row(`p${i}`, '2.0.0', { alpha: { installed: '1.0.0', vulnerable: 'high' } }),
    );
    expect(pickHeadlines(computeInsights(projects, many), 5)).toHaveLength(5);
  });
});

describe('family grouping', () => {
  const angular = (pkg: string) =>
    row(pkg, '22.0.0', {
      alpha: { installed: '18.2.0' },
      bravo: { installed: '21.1.0' },
      charlie: { installed: '22.0.0' },
    });

  it('folds one scope telling the same story into a single insight', () => {
    const insights = computeInsights(projects, [
      angular('@angular/core'),
      angular('@angular/common'),
      angular('@angular/router'),
    ]);
    const drift = insights.filter((i) => i.kind === 'version-drift');
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      package: '@angular/common',
      related: ['@angular/core', '@angular/router'],
    });
  });

  it('keeps packages apart when their stories differ', () => {
    const insights = computeInsights(projects, [
      angular('@angular/core'),
      row('@angular/cdk', '22.0.0', {
        alpha: { installed: '17.0.0' },
        bravo: { installed: '22.0.0' },
      }),
    ]);
    expect(insights.filter((i) => i.kind === 'version-drift')).toHaveLength(2);
  });

  it('never groups unscoped packages, which share no family', () => {
    const same = { alpha: { installed: '17.0.2' }, bravo: { installed: '18.3.1' } };
    const insights = computeInsights(projects, [
      row('react', '19.1.0', same),
      row('vue', '19.1.0', same),
    ]);
    expect(insights.filter((i) => i.kind === 'version-drift')).toHaveLength(2);
  });

  it('never merges vulnerabilities: each package has its own advisories and fix', () => {
    const vulnerable = { alpha: { installed: '1.0.0', vulnerable: 'high' as const } };
    const insights = computeInsights(projects, [
      row('@acme/a', '2.0.0', vulnerable),
      row('@acme/b', '2.0.0', vulnerable),
    ]);
    expect(insights.filter((i) => i.kind === 'vulnerable-spread')).toHaveLength(2);
  });
});

describe('pickHeadlines diversity', () => {
  it('does not let many vulnerabilities hide the version-drift story', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) =>
        row(`vuln${i}`, '1.0.0', { alpha: { installed: '1.0.0', vulnerable: 'critical' } }),
      ),
      row('react', '19.1.0', { alpha: { installed: '17.0.2' }, bravo: { installed: '19.1.0' } }),
    ];
    const kindsShown = pickHeadlines(computeInsights(projects, rows), 5).map((i) => i.kind);
    expect(kindsShown.filter((k) => k === 'vulnerable-spread')).toHaveLength(4);
    expect(kindsShown).toContain('version-drift');
  });

  it('fills every slot from one kind when nothing else has anything to say', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      row(`vuln${i}`, '1.0.0', { alpha: { installed: '1.0.0', vulnerable: 'high' } }),
    );
    expect(pickHeadlines(computeInsights(projects, rows), 5)).toHaveLength(5);
  });

  it('keeps importance order in the final list', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) =>
        row(`vuln${i}`, '1.0.0', { alpha: { installed: '1.0.0', vulnerable: 'critical' } }),
      ),
      row('react', '19.1.0', { alpha: { installed: '17.0.2' }, bravo: { installed: '19.1.0' } }),
    ];
    const scores = pickHeadlines(computeInsights(projects, rows), 5).map((i) => i.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
