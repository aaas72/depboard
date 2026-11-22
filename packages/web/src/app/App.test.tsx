import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Insight, MatrixResponse } from '@depboard/shared';
import { ApiError } from '../lib/api.js';
import { cell, fakeApi, project, projectsFor, row, sampleMatrix } from '../testing/fixtures.js';
import { App } from './App.js';

async function renderApp(api = fakeApi()) {
  const user = userEvent.setup();
  render(<App api={api} />);
  const grid = await screen.findByRole('grid', { name: 'Packages by project' });
  return { user, grid };
}

function rowNames(grid: HTMLElement): string[] {
  return within(grid)
    .queryAllByRole('rowheader')
    .map((el) => el.textContent);
}

describe('first screen', () => {
  it('opens on the matrix with the drift sentences above it', async () => {
    const { grid } = await renderApp();
    expect(
      screen.getByRole('button', { name: /lodash has a high vulnerability in 1 project/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: /react is used at 3 different major versions across 3 projects/,
      }),
    ).toBeTruthy();
    // Vulnerable first, then drift, then outdated, then the rest.
    expect(rowNames(grid)).toEqual(['lodash', 'react', 'zod', 'left-pad']);
    // The header says exactly what was scanned, so nobody wonders if it read the whole disk.
    const scanned = screen.getByText('~/work').parentElement;
    expect(scanned?.textContent).toBe('~/work · 3 projects');
    // The full path, with the username, stays out of the visible text but is one hover away.
    expect(scanned?.getAttribute('title')).toBe('/home/me/work');
  });

  it('shows the project columns with their package manager', async () => {
    const { grid } = await renderApp();
    const headers = within(grid)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers.slice(2)).toEqual(['web-appnpm', 'apinpm', 'adminnpm']);
  });

  it('describes every filled cell in words, and leaves unused cells empty', async () => {
    const { grid } = await renderApp();
    expect(
      within(grid).getByRole('gridcell', {
        name: 'react in api: 18.3.1, major update available: 18.3.1 → 19.1.0',
      }),
    ).toBeTruthy();
    expect(
      within(grid).getByRole('gridcell', {
        name: 'lodash in web-app: 4.17.20, patch update available: 4.17.20 → 4.17.21, high vulnerability',
      }),
    ).toBeTruthy();
    expect(
      within(grid).getByRole('gridcell', {
        name: /left-pad in admin: \^1\.3\.0, not installed, estimated from \^1\.3\.0/,
      }),
    ).toBeTruthy();
    // zod is only used by "api": its row has two empty cells, with no text at all.
    const zodRow = within(grid).getByRole('rowheader', { name: 'zod' }).parentElement;
    if (!zodRow) throw new Error('no row');
    const empty = within(zodRow)
      .getAllByRole('gridcell')
      .filter((c) => !c.hasAttribute('aria-label') && c.textContent === '');
    expect(empty).toHaveLength(2);
  });

  it('says so plainly when every project agrees', async () => {
    const matrix: MatrixResponse = { ...sampleMatrix(), insights: [] };
    await renderApp(fakeApi(matrix));
    expect(screen.getByText('All 3 projects agree on every shared package. 🎉')).toBeTruthy();
  });

  it('shows one column per kind, the top two of each first, then everything on request', async () => {
    const many: Insight[] = Array.from({ length: 8 }, (_, i) => ({
      kind: 'major-lag' as const,
      package: `pkg-${String(i)}`,
      related: [],
      projectIds: ['a', 'b'],
      score: 500 - i,
      latest: '2.0.0',
      majorsBehind: 1,
    }));
    const matrix = { ...sampleMatrix(), insights: [...sampleMatrix().insights, ...many] };
    const { user } = await renderApp(fakeApi(matrix));
    const strip = screen.getByRole('region', { name: /What’s hiding/ });
    // A visible title, and a key that names each icon with its count.
    expect(
      within(strip).getByRole('heading', { name: 'What’s hiding in your projects' }),
    ).toBeTruthy();
    expect(strip.textContent).toContain('1 vulnerable');
    expect(strip.textContent).toContain('1 different versions');
    expect(strip.textContent).toContain('8 far behind');
    // The same columns collapsed and expanded, most dangerous first, each titled with its total.
    const columns = () =>
      within(strip)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent);
    const expected = [
      'Known vulnerabilities (1)',
      'Different versions across projects (1)',
      'Major versions behind (8)',
    ];
    expect(columns()).toEqual(expected);
    const behind = () => within(strip).getByRole('region', { name: 'Major versions behind (8)' });
    expect(within(behind()).getAllByRole('button')).toHaveLength(2);
    expect(within(strip).getAllByRole('button', { pressed: false })).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Show all 10 findings' }));
    expect(columns()).toEqual(expected);
    expect(within(behind()).getAllByRole('button')).toHaveLength(8);
    expect(within(strip).getAllByRole('button', { pressed: false })).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(within(behind()).getAllByRole('button')).toHaveLength(2);
  });

  it('explains every symbol of the matrix in the legend', async () => {
    await renderApp();
    const legend = screen.getByRole('contentinfo', { name: 'Legend' });
    // Badges carry standard words, not letters: the legend shows each one as it appears.
    for (const word of ['patch', 'minor', 'major', 'low', 'moderate', 'high', 'critical']) {
      expect(legend.textContent).toContain(word);
    }
    for (const text of [
      'How far behind:',
      'How dangerous:',
      'Underline:',
      'same color = same release line, shown when projects disagree',
    ]) {
      expect(legend.textContent).toContain(text);
    }
  });
});

describe('narrowing the matrix', () => {
  it('filters to an insight’s packages and projects, and back', async () => {
    const { user, grid } = await renderApp();
    const sentence = screen.getByRole('button', { name: /lodash has a high vulnerability/ });
    await user.click(sentence);
    expect(sentence.getAttribute('aria-pressed')).toBe('true');
    expect(rowNames(grid)).toEqual(['lodash']);
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /Show everything/ }));
    expect(rowNames(screen.getByRole('grid'))).toHaveLength(4);
  });

  it('searches packages, then projects; "/" jumps to the search box', async () => {
    const { user } = await renderApp();
    await user.keyboard('/');
    const search = screen.getByRole('searchbox', { name: 'Search packages or projects' });
    expect(document.activeElement).toBe(search);

    await user.type(search, 'zo');
    expect(rowNames(screen.getByRole('grid'))).toEqual(['zod']);

    await user.clear(search);
    await user.type(search, 'admin');
    expect(rowNames(screen.getByRole('grid'))).toEqual(['react', 'left-pad']);

    await user.clear(search);
    await user.type(search, 'nothing-like-this');
    expect(screen.getByText('Nothing matches these filters.')).toBeTruthy();
  });

  it('hides up-to-date packages, saying how many', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('checkbox', { name: 'Hide up-to-date (1)' }));
    expect(rowNames(screen.getByRole('grid'))).toEqual(['lodash', 'react', 'zod']);
  });
});

describe('cell details', () => {
  it('opens on click with versions and advisories, and closes with Esc back to the grid', async () => {
    const { user, grid } = await renderApp();
    // The drawer's space is reserved with a hint, so opening a cell never moves the matrix.
    expect(screen.getByRole('complementary', { name: 'Details' })).toBeTruthy();
    await user.click(within(grid).getByRole('gridcell', { name: /^lodash in web-app/ }));

    const drawer = screen.getByRole('dialog', { name: 'lodash' });
    expect(screen.queryByRole('complementary', { name: 'Details' })).toBeNull();
    expect(within(drawer).getByText('in web-app')).toBeTruthy();
    expect(within(drawer).getByText('4.17.20')).toBeTruthy();
    const advisory = within(drawer).getByRole('link', { name: 'Prototype Pollution in lodash' });
    expect(advisory.getAttribute('href')).toBe('https://github.com/advisories/GHSA-p6mc-m468-83gw');
    expect(advisory.getAttribute('rel')).toContain('noreferrer');
    expect(within(drawer).getByText('Affected versions: <4.17.21')).toBeTruthy();
    expect(document.activeElement).toBe(within(drawer).getByRole('button', { name: 'Close' }));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Details' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('grid'));
  });

  it('explains a version estimated from package.json', async () => {
    const { user, grid } = await renderApp();
    await user.click(within(grid).getByRole('gridcell', { name: /^left-pad in admin/ }));
    const drawer = screen.getByRole('dialog', { name: 'left-pad' });
    expect(within(drawer).getByText('Not installed')).toBeTruthy();
    expect(within(drawer).getByText(/version is estimated from package.json/)).toBeTruthy();
  });

  it('is fully keyboard-driven: arrows move, Enter opens', async () => {
    const { user, grid } = await renderApp();
    grid.focus();
    // Starts on the first project cell of the first row (lodash × web-app).
    expect(
      document
        .getElementById(grid.getAttribute('aria-activedescendant') ?? '')
        ?.getAttribute('aria-label'),
    ).toMatch(/^lodash in web-app/);
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(
      document
        .getElementById(grid.getAttribute('aria-activedescendant') ?? '')
        ?.getAttribute('aria-label'),
    ).toMatch(/^react in api/);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'react' })).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText('in api')).toBeTruthy();
  });

  it('does nothing on Enter over an empty cell', async () => {
    const { user, grid } = await renderApp();
    grid.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}'); // zod × web-app: not used
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('states', () => {
  it('asks for the printed link when the token is missing or wrong', async () => {
    render(
      <App
        api={fakeApi(sampleMatrix(), {
          getMatrix: () => Promise.reject(new ApiError('unauthorized', 'x')),
        })}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'This page needs the link DepBoard printed' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers a retry when the server is unreachable', async () => {
    const getMatrix = vi
      .fn<() => Promise<MatrixResponse>>()
      .mockRejectedValueOnce(new ApiError('offline', 'x'))
      .mockResolvedValue(sampleMatrix());
    const user = userEvent.setup();
    render(<App api={fakeApi(sampleMatrix(), { getMatrix })} />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('grid')).toBeTruthy();
  });

  it('keeps the matrix when a rescan fails, and says why', async () => {
    const api = fakeApi(sampleMatrix(), {
      rescan: () => Promise.reject(new ApiError('server', 'The registry timed out.')),
    });
    const { user } = await renderApp(api);
    await user.click(screen.getByRole('button', { name: 'Rescan' }));
    expect(await screen.findByText('The registry timed out.')).toBeTruthy();
    expect(screen.getByRole('grid')).toBeTruthy();
  });

  it('shows fresh data after a rescan', async () => {
    const after = {
      ...sampleMatrix(),
      rows: [row('vite', [cell('a', { installed: '7.0.0' })])],
      insights: [],
    };
    const { user } = await renderApp(
      fakeApi(sampleMatrix(), { rescan: () => Promise.resolve(after) }),
    );
    await user.click(screen.getByRole('button', { name: 'Rescan' }));
    await waitFor(() => {
      expect(rowNames(screen.getByRole('grid'))).toEqual(['vite']);
    });
  });

  it('warns, without blocking, when data is incomplete', async () => {
    const matrix = { ...sampleMatrix(), failedLookups: ['a', 'b'], advisoriesIncomplete: true };
    const api = fakeApi(matrix, {
      getProjects: () =>
        Promise.resolve(
          projectsFor(matrix, {
            issues: [{ path: '/home/me/work/bad/package.json', reason: 'Invalid JSON' }],
          }),
        ),
    });
    await renderApp(api);
    expect(screen.getByText(/Couldn’t reach the npm registry for 2 packages/)).toBeTruthy();
    expect(screen.getByText(/a missing shield doesn’t mean safe/)).toBeTruthy();
    expect(screen.getByText('Skipped 1 package.json that couldn’t be read.')).toBeTruthy();
    expect(screen.getByText('~/work/bad/package.json: Invalid JSON')).toBeTruthy();
  });

  it('suggests including sibling folders when only one project was found', async () => {
    const single: MatrixResponse = {
      ...sampleMatrix(),
      projects: [project('a', 'web-app')],
      rows: [row('react', [cell('a', { installed: '19.1.0' })])],
      insights: [],
    };
    await renderApp(fakeApi(single));
    expect(
      screen.getByText(/Found 1 project\. DepBoard shines when comparing several/),
    ).toBeTruthy();
    expect(screen.getByText('npx depboard ..')).toBeTruthy();
  });

  it('names the scanned folder when nothing was found', async () => {
    const empty: MatrixResponse = { ...sampleMatrix(), projects: [], rows: [], insights: [] };
    render(<App api={fakeApi(empty)} />);
    expect(
      await screen.findByRole('heading', { name: 'No projects found in ~/work' }),
    ).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
  });
});
