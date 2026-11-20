import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createRegistryClient } from '../registry/registry-client.js';
import { fakeRegistry } from '../testing/fake-registry.js';
import { makeTree } from '../testing/tmp-tree.js';
import { generateToken, tokensMatch } from './token.js';

const PORT = 4319;
const HOST = `127.0.0.1:${String(PORT)}`;
const ORIGIN = `http://${HOST}`;
const TOKEN = 'a'.repeat(64);

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function app(options: { staticDir?: string } = {}): Promise<FastifyInstance> {
  const root = await makeTree({ 'web/package.json': { name: 'web' } });
  const instance = await createApp({
    token: TOKEN,
    port: () => PORT,
    roots: [root],
    registry: createRegistryClient({ fetch: fakeRegistry().fetch }),
    staticDir: options.staticDir,
  });
  apps.push(instance);
  return instance;
}

const ok = { host: HOST, 'x-depboard-token': TOKEN };

const routes = [
  { method: 'GET', url: '/api/projects' },
  { method: 'GET', url: '/api/matrix' },
  { method: 'POST', url: '/api/rescan' },
] as const;

describe('session token', () => {
  it.each(routes)('$method $url works with the token', async ({ method, url }) => {
    const headers = method === 'POST' ? { ...ok, origin: ORIGIN } : ok;
    const response = await (await app()).inject({ method, url, headers });
    expect(response.statusCode).toBe(200);
  });

  it.each(routes)('$method $url is 401 without the token', async ({ method, url }) => {
    const response = await (
      await app()
    ).inject({ method, url, headers: { host: HOST, origin: ORIGIN } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN_REQUEST' } });
  });

  it.each(routes)('$method $url is 401 with a wrong token', async ({ method, url }) => {
    const response = await (
      await app()
    ).inject({
      method,
      url,
      headers: { host: HOST, origin: ORIGIN, 'x-depboard-token': 'b'.repeat(64) },
    });
    expect(response.statusCode).toBe(401);
  });

  it('does not accept the token in the query for API routes', async () => {
    const response = await (
      await app()
    ).inject({
      url: `/api/matrix?token=${TOKEN}`,
      headers: { host: HOST },
    });
    expect(response.statusCode).toBe(401);
  });

  it.each(['/%61pi/matrix', '/API/matrix', '//api/matrix', '/api/../api/matrix', '/nope'])(
    'gives nothing away for %s without the token',
    async (url) => {
      const response = await (await app()).inject({ url, headers: { host: HOST } });
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain('"rows"');
    },
  );
});

describe('Host header (DNS rebinding)', () => {
  it.each([
    'evil.example',
    `evil.example:${String(PORT)}`,
    `localhost:${String(PORT)}`,
    '127.0.0.1:1',
    '0.0.0.0:4319',
  ])('rejects Host: %s even with a valid token', async (host) => {
    const response = await (
      await app()
    ).inject({
      url: '/api/matrix',
      headers: { ...ok, host },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('Origin header (other sites in the browser)', () => {
  it.each([
    'https://evil.example',
    'http://127.0.0.1:1',
    'null',
    `http://localhost:${String(PORT)}`,
  ])('rejects Origin: %s even with a valid token', async (origin) => {
    const response = await (
      await app()
    ).inject({
      method: 'POST',
      url: '/api/rescan',
      headers: { ...ok, origin },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a write with no Origin at all', async () => {
    const response = await (
      await app()
    ).inject({ method: 'POST', url: '/api/rescan', headers: ok });
    expect(response.statusCode).toBe(403);
  });

  it('never sends CORS headers', async () => {
    const response = await (
      await app()
    ).inject({
      method: 'OPTIONS',
      url: '/api/matrix',
      headers: {
        host: HOST,
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('response hardening', () => {
  it('stops the token leaking through Referer and forbids framing and caching', async () => {
    const response = await (await app()).inject({ url: '/api/matrix', headers: ok });
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('never leaks internals in error responses', async () => {
    const instance = await createApp({
      token: TOKEN,
      port: () => PORT,
      roots: [path.join('/definitely', 'missing')],
      registry: createRegistryClient({ fetch: fakeRegistry().fetch }),
    });
    apps.push(instance);
    const response = await instance.inject({ url: '/api/matrix', headers: ok });
    expect(response.body).not.toMatch(/at .*\.(ts|js):\d+/); // no stack traces
  });

  it('rejects oversized request bodies', async () => {
    const response = await (
      await app()
    ).inject({
      method: 'POST',
      url: '/api/rescan',
      headers: { ...ok, origin: ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({ x: 'y'.repeat(100 * 1024) }),
    });
    expect(response.statusCode).toBe(413);
  });
});

describe('static UI files', () => {
  it('are served without the token, since they hold no data', async () => {
    const dir = await makeTree({ 'index.html': '<!doctype html><title>DepBoard</title>' });
    const response = await (
      await app({ staticDir: dir })
    ).inject({ url: '/', headers: { host: HOST } });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('DepBoard');
  });

  it('still require the right Host', async () => {
    const dir = await makeTree({ 'index.html': 'ui' });
    const response = await (
      await app({ staticDir: dir })
    ).inject({
      url: '/',
      headers: { host: 'evil.example' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('cannot be used to read files outside the UI folder', async () => {
    const dir = await makeTree({ 'ui/index.html': 'ui', 'secret.txt': 'top secret' });
    await fs.access(path.join(dir, 'secret.txt'));
    const instance = await app({ staticDir: path.join(dir, 'ui') });
    for (const url of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt']) {
      const response = await instance.inject({ url, headers: { host: HOST } });
      expect(response.body).not.toContain('top secret');
    }
  });
});

describe('token helpers', () => {
  it('generates a fresh 64-character hex token every time', () => {
    const a = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken()).not.toBe(a);
  });

  it.each([undefined, '', 'short', ['array'], 42])('rejects %s', (value) => {
    expect(tokensMatch(TOKEN, value)).toBe(false);
  });
});
