import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_HEADER } from '@depboard/shared';
import { ApiError, createApiClient, takeToken, type FetchLike } from './api.js';
import { formatMessage, t } from './i18n.js';
import { shortenPath } from './paths.js';

const TOKEN = 'a'.repeat(64);

describe('takeToken', () => {
  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('reads the token from the launch URL and removes it from the address bar', () => {
    window.history.replaceState(null, '', `/?token=${TOKEN}&x=1#top`);
    expect(takeToken()).toBe(TOKEN);
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#top');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('survives a reload of the same tab', () => {
    window.history.replaceState(null, '', `/?token=${TOKEN}`);
    takeToken();
    expect(takeToken()).toBe(TOKEN);
  });

  it('is null when the page was opened without the link', () => {
    expect(takeToken()).toBeNull();
  });
});

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createApiClient', () => {
  it('sends the token on every request', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(respond(200, { ok: true })));
    const api = createApiClient(TOKEN, fetchImpl);
    await api.getMatrix();
    await api.rescan();
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/matrix',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      '/api/rescan',
      expect.objectContaining({ method: 'POST' }),
    );
    for (const [, init] of fetchImpl.mock.calls) {
      expect((init.headers as Record<string, string>)[TOKEN_HEADER]).toBe(TOKEN);
    }
  });

  it('explains a missing token without calling the server', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    await expect(createApiClient(null, fetchImpl).getMatrix()).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns 401 into "unauthorized", a network failure into "offline", and keeps server messages', async () => {
    const api401 = createApiClient(TOKEN, () =>
      Promise.resolve(respond(401, { error: { code: 'FORBIDDEN_REQUEST', message: 'nope' } })),
    );
    await expect(api401.getMatrix()).rejects.toMatchObject({ kind: 'unauthorized' });

    const offline = createApiClient(TOKEN, () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(offline.getMatrix()).rejects.toMatchObject({ kind: 'offline' });

    const failing = createApiClient(TOKEN, () =>
      Promise.resolve(
        respond(500, { error: { code: 'INTERNAL_ERROR', message: 'Run with --debug.' } }),
      ),
    );
    const error = await failing.getMatrix().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: 'server',
      code: 'INTERNAL_ERROR',
      message: 'Run with --debug.',
    });
  });

  it('copes with an error page that is not JSON', async () => {
    const api = createApiClient(TOKEN, () =>
      Promise.resolve(new Response('<html>', { status: 502 })),
    );
    await expect(api.getMatrix()).rejects.toMatchObject({ kind: 'server', code: null });
  });
});

describe('t', () => {
  it('fills placeholders and picks singular or plural by n', () => {
    expect(t('header.projects', { n: 1 })).toBe('1 project');
    expect(t('header.projects', { n: 0 })).toBe('0 projects');
    expect(t('header.projects', { n: 12 })).toBe('12 projects');
    expect(t('activity.count', { n: 1 })).toBe('1 update');
    expect(t('activity.count', { n: 2 })).toBe('2 updates');
    expect(t('activity.running', { n: 0 })).toBe('0 updates running');
    expect(t('activity.running', { n: 1 })).toBe('1 update running');
    expect(t('drift.allAgree', { n: 3 })).toBe('All 3 projects agree on every shared package. 🎉');
  });

  it('selects CLDR plural categories with Intl.PluralRules across locales', () => {
    const ar =
      'zero: لا مشاريع|one: مشروع واحد|two: مشروعان|few: {n} مشاريع|many: {n} مشروعًا|other: {n} مشروع';
    expect(formatMessage(ar, { n: 0 }, 'ar')).toBe('لا مشاريع');
    expect(formatMessage(ar, { n: 1 }, 'ar')).toBe('مشروع واحد');
    expect(formatMessage(ar, { n: 2 }, 'ar')).toBe('مشروعان');
    expect(formatMessage(ar, { n: 3 }, 'ar')).toBe('3 مشاريع');
    expect(formatMessage(ar, { n: 11 }, 'ar')).toBe('11 مشروعًا');
    expect(formatMessage(ar, { n: 100 }, 'ar')).toBe('100 مشروع');

    // Falls back to `other` when a category is omitted or n is missing.
    expect(formatMessage('one: {n} item|other: {n} items', { n: 5 }, 'ar')).toBe('5 items');
    expect(formatMessage('one: single|other: fallback')).toBe('fallback');

    // In French, 0 belongs to the `one` category under CLDR rules.
    expect(formatMessage('{n} projet|{n} projets', { n: 0 }, 'fr')).toBe('0 projet');
    expect(formatMessage('{n} projet|{n} projets', { n: 2 }, 'fr')).toBe('2 projets');
  });

  it('replaces 0 and empty-string placeholders and keeps missing ones visible', () => {
    expect(t('drawer.inProject')).toBe('in {project}');
    expect(t('drawer.inProject', { project: '' })).toBe('in ');
    expect(t('activity.duration', { s: 0 })).toBe('0 s');
    expect(formatMessage('{a}|unused', { a: 'only' })).toBe('only');
  });
});

describe('shortenPath', () => {
  it.each([
    ['/home/me/projects', '/home/me', '~/projects'],
    ['/home/me', '/home/me', '~'],
    ['/home/me/projects', '/home/me/', '~/projects'],
    ['C:\\Users\\Me\\projects', 'C:\\Users\\Me', '~\\projects'],
    // Windows paths are case-insensitive; the original casing is kept in the output.
    ['c:\\users\\me\\Projects', 'C:\\Users\\Me', '~\\Projects'],
  ])('shows %s under home %s as %s', (p, home, expected) => {
    expect(shortenPath(p, home)).toBe(expected);
  });

  it.each([
    // A sibling whose name starts with the home folder's name is not inside it.
    ['/home/meadow/projects', '/home/me'],
    ['/srv/projects', '/home/me'],
    // Case matters outside Windows.
    ['/Home/me/projects', '/home/me'],
    ['/home/me/projects', ''],
    ['/projects', '/'],
  ])('leaves %s alone under home %s', (p, home) => {
    expect(shortenPath(p, home)).toBe(p);
  });
});
