import { describe, expect, it } from 'vitest';
import { cell, project, row, sampleMatrix } from '../../testing/fixtures.js';
import {
  driftGroups,
  filterMatrix,
  focusOn,
  NAME_MAX_W,
  NAME_MIN_W,
  nameColumnWidth,
  releaseLine,
  rowSeverity,
  sortRows,
  worstUpdate,
} from './model.js';

const noFilters = { query: '', outdatedOnly: false, focus: null };

describe('releaseLine', () => {
  it('is the major from 1.0 on, and 0.minor before', () => {
    expect(releaseLine('18.3.1')).toBe('18');
    expect(releaseLine('0.3.9')).toBe('0.3');
    expect(releaseLine('19.0.0-rc.1')).toBe('19');
  });
});

describe('driftGroups', () => {
  it('numbers release lines from the highest, per project', () => {
    const r = row('react', [
      cell('a', { installed: '17.0.2' }),
      cell('b', { installed: '19.1.0' }),
      cell('c', { installed: '19.0.0' }),
    ]);
    expect(Object.fromEntries(driftGroups(r))).toEqual({ a: 1, b: 0, c: 0 });
  });

  it('is empty when every project is on one line', () => {
    const r = row('react', [
      cell('a', { installed: '18.2.0' }),
      cell('b', { installed: '18.3.1' }),
    ]);
    expect(driftGroups(r).size).toBe(0);
  });

  it('orders 0.x lines numerically, not as text', () => {
    const r = row('x', [cell('a', { installed: '0.10.0' }), cell('b', { installed: '0.9.0' })]);
    expect(Object.fromEntries(driftGroups(r))).toEqual({ a: 0, b: 1 });
  });

  it('skips cells whose version is unknown', () => {
    const r = row('x', [
      cell('a', { installed: '2.0.0' }),
      cell('b', { installed: '1.0.0' }),
      cell('c', { installed: null, version: null }),
    ]);
    expect(driftGroups(r).has('c')).toBe(false);
  });
});

describe('worstUpdate and rowSeverity', () => {
  it('finds the most outdated cell and the highest severity', () => {
    const r = row('x', [
      cell('a', {
        updateType: 'patch',
        vulnerability: { severity: 'low', count: 1, advisoryIds: [1] },
      }),
      cell('b', { updateType: 'major', vulnerability: 'unknown' }),
      cell('c', {
        updateType: 'minor',
        vulnerability: { severity: 'high', count: 2, advisoryIds: [2, 3] },
      }),
    ]);
    expect(worstUpdate(r)).toBe('major');
    expect(rowSeverity(r)).toBe('high');
  });

  it('treats unknown and prerelease as not outdated, and no advisories as no severity', () => {
    const r = row('x', [
      cell('a', { updateType: 'unknown' }),
      cell('b', { updateType: 'prerelease' }),
    ]);
    expect(worstUpdate(r)).toBe('none');
    expect(rowSeverity(r)).toBeNull();
  });
});

describe('sortRows', () => {
  it('puts high/critical vulnerabilities first, then drift, then most outdated, then by name', () => {
    const rows = [
      row('b-minor', [cell('a', { updateType: 'minor' })]),
      row('a-minor', [cell('a', { updateType: 'minor' })]),
      row('major', [cell('a', { updateType: 'major' })]),
      row('drift', [cell('a', { installed: '2.0.0' }), cell('b', { installed: '1.0.0' })]),
      row('low-vuln', [
        cell('a', { vulnerability: { severity: 'low', count: 1, advisoryIds: [1] } }),
      ]),
      row('critical', [
        cell('a', { vulnerability: { severity: 'critical', count: 1, advisoryIds: [2] } }),
      ]),
      row('high', [cell('a', { vulnerability: { severity: 'high', count: 1, advisoryIds: [3] } })]),
    ];
    expect(sortRows(rows).map((r) => r.name)).toEqual([
      'critical',
      'high',
      'drift',
      'major',
      'a-minor',
      'b-minor',
      'low-vuln',
    ]);
  });

  it('does not mutate its input', () => {
    const rows = [row('b', [cell('a')]), row('a', [cell('a')])];
    sortRows(rows);
    expect(rows.map((r) => r.name)).toEqual(['b', 'a']);
  });
});

describe('filterMatrix', () => {
  const { rows, projects } = sampleMatrix();
  const names = (view: { rows: { name: string }[] }) => view.rows.map((r) => r.name);

  it('shows everything without filters', () => {
    const view = filterMatrix(rows, projects, noFilters);
    expect(view.rows).toHaveLength(rows.length);
    expect(view.projects).toHaveLength(projects.length);
  });

  it('searches package names, case-insensitively', () => {
    expect(names(filterMatrix(rows, projects, { ...noFilters, query: '  LoDa ' }))).toEqual([
      'lodash',
    ]);
  });

  it('falls back to project names, showing only those columns and their rows', () => {
    const view = filterMatrix(rows, projects, { ...noFilters, query: 'admin' });
    expect(view.projects.map((p) => p.name)).toEqual(['admin']);
    expect(names(view)).toEqual(['react', 'left-pad']);
  });

  it('keeps only rows with an outdated cell in the visible projects', () => {
    expect(names(filterMatrix(rows, projects, { ...noFilters, outdatedOnly: true }))).toEqual([
      'react',
      'lodash',
      'zod',
    ]);
    const adminOnly = filterMatrix(rows, projects, {
      ...noFilters,
      query: 'admin',
      outdatedOnly: true,
    });
    expect(names(adminOnly)).toEqual(['react']);
  });

  it('narrows to an insight: its packages (family included) and its projects', () => {
    const insight = sampleMatrix().insights[0];
    if (!insight) throw new Error('fixture');
    const view = filterMatrix(rows, projects, { ...noFilters, focus: focusOn(insight) });
    expect(names(view)).toEqual(['lodash']);
    expect(view.projects.map((p) => p.id)).toEqual(['a']);

    const family = focusOn({
      ...insight,
      package: 'react',
      related: ['zod'],
      projectIds: ['a', 'b'],
    });
    expect(names(filterMatrix(rows, projects, { ...noFilters, focus: family }))).toEqual([
      'react',
      'zod',
    ]);
  });

  it('never shows a row with no cell in the visible columns', () => {
    const view = filterMatrix(rows, [project('a', 'web-app')], noFilters);
    expect(names(view)).toEqual(['react', 'lodash']);
  });
});

describe('nameColumnWidth', () => {
  it('keeps room for the column header when every name is short', () => {
    expect(nameColumnWidth(['react', 'zod'])).toBe(NAME_MIN_W);
    expect(nameColumnWidth([])).toBe(NAME_MIN_W);
  });

  it('grows with the longest name', () => {
    const width = nameColumnWidth(['react', '@typescript-eslint/parser']);
    expect(width).toBeGreaterThan(NAME_MIN_W);
    expect(width).toBeLessThanOrEqual(NAME_MAX_W);
    expect(width).toBeGreaterThan(nameColumnWidth(['@types/node']));
  });

  it('stops at the old fixed width; longer names truncate with the full name on hover', () => {
    expect(nameColumnWidth(['@some-really-long-scope/an-even-longer-package-name'])).toBe(
      NAME_MAX_W,
    );
  });
});
