import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../app/App.js';
import { parseRoute, routeHref } from '../../lib/route.js';
import { cell, fakeApi, row } from '../../testing/fixtures.js';
import { projectSections, projectStats } from './model.js';

afterEach(() => {
  window.location.hash = '';
});

describe('routes', () => {
  it('reads and writes the project route, defaulting to the matrix', () => {
    expect(parseRoute('')).toEqual({ view: 'matrix' });
    expect(parseRoute('#/')).toEqual({ view: 'matrix' });
    expect(parseRoute('#/project/3974c1eadfea')).toEqual({
      view: 'project',
      projectId: '3974c1eadfea',
    });
    expect(parseRoute('#/project/../../x')).toEqual({ view: 'matrix' });
    expect(routeHref({ view: 'project', projectId: 'a1' })).toBe('#/project/a1');
  });
});

describe('projectSections and projectStats', () => {
  const rows = [
    row('zeta', [cell('p', { updateType: 'minor' })]),
    row('alpha', [cell('p')]),
    row('vitest', [cell('p', { depType: 'devDependencies', updateType: 'major' })]),
    row('lodash', [cell('p', { vulnerability: { severity: 'high', count: 1, advisoryIds: [1] } })]),
    row('left-pad', [cell('p', { installed: null, version: '1.0.0' })]),
    row('other', [cell('q', { updateType: 'major' })]),
  ];
  const names = (entries: { row: { name: string } }[]) => entries.map((e) => e.row.name);

  it('splits by dependency type and puts what needs attention first', () => {
    const sections = projectSections(rows, 'p', { query: '', outdatedOnly: false });
    expect(names(sections.dependencies)).toEqual(['lodash', 'zeta', 'alpha', 'left-pad']);
    expect(names(sections.devDependencies)).toEqual(['vitest']);
  });

  it('applies the same search and "Outdated only" filters as the matrix', () => {
    expect(
      names(projectSections(rows, 'p', { query: 'ZE', outdatedOnly: false }).dependencies),
    ).toEqual(['zeta']);
    const outdated = projectSections(rows, 'p', { query: '', outdatedOnly: true });
    expect(names(outdated.dependencies)).toEqual(['zeta']);
    expect(names(outdated.devDependencies)).toEqual(['vitest']);
  });

  it('counts every package of the project only', () => {
    expect(projectStats(rows, 'p')).toEqual({
      total: 5,
      major: 1,
      minor: 1,
      patch: 0,
      vulnerable: 1,
      notInstalled: 1,
    });
  });
});

describe('the project screen', () => {
  it('opens from a column header, lists its packages, and goes back to the matrix', async () => {
    const user = userEvent.setup();
    render(<App api={fakeApi()} />);
    const grid = await screen.findByRole('grid');
    await user.click(within(grid).getByRole('link', { name: 'Open api' }));

    const heading = await screen.findByRole('heading', { name: /^api/ });
    expect(heading).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByText('~/work/api').getAttribute('title')).toBe('/home/me/work/api');
    expect(screen.getByText(/3 packages · outdated: 1 major · 1 minor · 0 patch/)).toBeTruthy();

    const deps = screen.getByRole('region', { name: /^dependencies/ });
    const rowHeaders = within(deps)
      .getAllByRole('rowheader')
      .map((h) => h.textContent);
    expect(rowHeaders).toEqual(['react', 'zod', 'lodash']);

    await user.click(screen.getByRole('link', { name: /Back to the matrix/ }));
    expect(await screen.findByRole('grid')).toBeTruthy();
  });

  it('opens the same drawer as the matrix, and returns focus to the row', async () => {
    window.location.hash = '#/project/b';
    const user = userEvent.setup();
    render(<App api={fakeApi()} />);
    const details = await screen.findByRole('button', { name: 'Details for zod' });
    await user.click(details);
    const drawer = screen.getByRole('dialog', { name: 'zod' });
    expect(within(drawer).getByText('in api')).toBeTruthy();
    expect(await within(drawer).findByRole('button', { name: 'Update to 3.23.0' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(details);
  });

  it('marks packages that are not installed', async () => {
    window.location.hash = '#/project/c';
    render(<App api={fakeApi()} />);
    expect(
      await screen.findByText(/1 not installed: versions estimated from package.json/),
    ).toBeTruthy();
  });

  it('explains a project that is no longer in the scan', async () => {
    window.location.hash = '#/project/gone';
    render(<App api={fakeApi()} />);
    expect(await screen.findByText('That project isn’t in this scan anymore.')).toBeTruthy();
  });

  it('follows the browser’s Back button', async () => {
    render(<App api={fakeApi()} />);
    await screen.findByRole('grid');
    window.location.hash = '#/project/a';
    await waitFor(() => {
      expect(screen.queryByRole('grid')).toBeNull();
    });
    window.location.hash = '';
    expect(await screen.findByRole('grid')).toBeTruthy();
  });
});
