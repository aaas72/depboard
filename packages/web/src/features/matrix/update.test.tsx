import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JobEvent, MatrixResponse, UpdateRequest } from '@depboard/shared';
import { App } from '../../app/App.js';
import { ApiError, type ApiClient } from '../../lib/api.js';
import { fakeApi, job, sampleMatrix } from '../../testing/fixtures.js';

/** The shown command, whole: it wraps between arguments, so its text spans several elements. */
const command = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'CODE' && el.textContent === text;

/** A fake API whose job stream the test drives event by event. */
function controllableApi(
  matrix: MatrixResponse = sampleMatrix(),
  overrides: Partial<ApiClient> = {},
) {
  let push: (event: JobEvent) => void = () => {};
  const startUpdate = vi.fn((request: UpdateRequest) =>
    Promise.resolve({
      jobId: 'j_000000000001',
      commands: [
        {
          projectId: request.projectIds[0] ?? '',
          display: `npm install ${request.package}@${request.version} --no-audit --no-fund`,
        },
      ],
    }),
  );
  const getMatrix = vi.fn(() => Promise.resolve(matrix));
  const api = fakeApi(matrix, {
    startUpdate,
    getMatrix,
    streamJob: (_id, onEvent) => {
      push = onEvent;
      return new Promise<void>(() => {});
    },
    ...overrides,
  });
  return {
    api,
    startUpdate,
    getMatrix,
    push: (event: JobEvent) => {
      act(() => {
        push(event);
      });
    },
  };
}

async function openCell(api: ApiClient, name: RegExp) {
  const user = userEvent.setup();
  render(<App api={api} />);
  const grid = await screen.findByRole('grid');
  await user.click(within(grid).getByRole('gridcell', { name }));
  return { user, drawer: screen.getByRole('dialog') };
}

describe('updating one package in one project', () => {
  it('shows the exact command first, runs it, streams the output, and refreshes', async () => {
    const { api, startUpdate, getMatrix, push } = controllableApi();
    const { user, drawer } = await openCell(api, /^zod in api/);

    expect(
      await within(drawer).findByText(command('npm install zod@3.23.0 --no-audit --no-fund')),
    ).toBeTruthy();
    await user.click(within(drawer).getByRole('button', { name: 'Update to 3.23.0' }));
    expect(startUpdate).toHaveBeenCalledWith({
      package: 'zod',
      version: '3.23.0',
      projectIds: ['b'],
      confirmMajor: false,
    });

    // The Activity panel opens by itself on the new job.
    const activity = screen.getByRole('region', { name: 'Activity' });
    expect(
      within(activity)
        .getByRole('button', { name: /Activity/ })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(within(drawer).getByRole('button', { name: 'Updating…' })).toHaveProperty(
      'disabled',
      true,
    );

    push({ type: 'start', job: job({ status: 'running', durationMs: null, exitCode: null }) });
    push({ type: 'output', stream: 'stdout', line: 'changed 1 package in 2s' });
    expect(within(activity).getByRole('log').textContent).toContain('changed 1 package in 2s');

    const readsBefore = getMatrix.mock.calls.length;
    push({ type: 'end', job: job() });
    expect(within(activity).getByRole('log').textContent).toContain('Done in 2.4 s');
    expect(getMatrix.mock.calls.length).toBe(readsBefore + 1);
  });

  it('asks before a major update, with Cancel focused, and Esc only closes the question', async () => {
    const { api, startUpdate } = controllableApi(sampleMatrix(), {
      previewUpdate: (request) =>
        Promise.resolve({
          version: request.version,
          updateType: 'major',
          commands: [{ projectId: 'b', display: 'npm install react@19.1.0 --no-audit --no-fund' }],
        }),
    });
    const { user, drawer } = await openCell(api, /^react in api/);
    await user.click(await within(drawer).findByRole('button', { name: 'Update to 19.1.0…' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Update react from 18.3.1 to 19.1.0?' });
    expect(
      within(dialog).getByText(command('npm install react@19.1.0 --no-audit --no-fund')),
    ).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(startUpdate).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'react' })).toBeTruthy();
    expect(startUpdate).not.toHaveBeenCalled();

    await user.click(within(drawer).getByRole('button', { name: 'Update to 19.1.0…' }));
    await user.click(screen.getByRole('button', { name: 'Run the update' }));
    expect(startUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ package: 'react', confirmMajor: true }),
    );
  });

  it('reports a failed install and does not pretend the matrix changed', async () => {
    const { api, getMatrix, push } = controllableApi();
    const { user, drawer } = await openCell(api, /^zod in api/);
    await user.click(await within(drawer).findByRole('button', { name: 'Update to 3.23.0' }));
    const readsBefore = getMatrix.mock.calls.length;
    push({ type: 'output', stream: 'stderr', line: 'npm ERR! ERESOLVE could not resolve' });
    push({ type: 'end', job: job({ status: 'failed', exitCode: 1 }) });
    const log = within(screen.getByRole('region', { name: 'Activity' })).getByRole('log');
    expect(log.textContent).toContain('ERESOLVE');
    expect(log.textContent).toContain('The command failed (exit code 1)');
    expect(getMatrix.mock.calls.length).toBe(readsBefore);
  });

  it('shows why an update could not start', async () => {
    const { api } = controllableApi(sampleMatrix(), {
      startUpdate: () =>
        Promise.reject(
          new ApiError('server', 'This project is already being updated.', 'PROJECT_BUSY'),
        ),
    });
    const { user, drawer } = await openCell(api, /^zod in api/);
    await user.click(await within(drawer).findByRole('button', { name: 'Update to 3.23.0' }));
    expect((await within(drawer).findByRole('alert')).textContent).toBe(
      'This project is already being updated.',
    );
  });

  it('offers the command to run by hand for package managers DepBoard does not update yet', async () => {
    const matrix = sampleMatrix();
    matrix.projects = matrix.projects.map((p) => (p.id === 'b' ? { ...p, manager: 'pnpm' } : p));
    const previewUpdate = vi.fn();
    const { api } = controllableApi(matrix, { previewUpdate });
    const { drawer } = await openCell(api, /^zod in api/);
    expect(
      within(drawer).getByText(/Updating pnpm projects from DepBoard comes in a later version/),
    ).toBeTruthy();
    expect(within(drawer).getByText('pnpm add zod@3.23.0')).toBeTruthy();
    expect(within(drawer).queryByRole('button', { name: /Update to/ })).toBeNull();
    expect(previewUpdate).not.toHaveBeenCalled();
  });

  it('offers no update for a package that is already up to date', async () => {
    const { api } = controllableApi();
    const { drawer } = await openCell(api, /^react in web-app/);
    expect(within(drawer).queryByRole('heading', { name: 'Update' })).toBeNull();
  });

  it('shows earlier updates after a reload', async () => {
    const { api } = controllableApi(sampleMatrix(), {
      listJobs: () => Promise.resolve({ jobs: [job()] }),
    });
    render(<App api={api} />);
    const activity = await screen.findByRole('region', { name: 'Activity' });
    expect(within(activity).getByText('1 update')).toBeTruthy();
  });
});
