import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { Matrix } from '@depboard/shared';
import { createApp } from './app.js';
import { createRegistryClient } from './registry/registry-client.js';
import { startServer } from './start-server.js';
import { fakeRegistry } from './testing/fake-registry.js';
import { makeTree } from './testing/tmp-tree.js';

const PORT = 4319;
const HOST = `127.0.0.1:${String(PORT)}`;
const TOKEN = 'c'.repeat(64);
const headers = { host: HOST, 'x-depboard-token': TOKEN };

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function setup() {
  const root = await makeTree({
    'web/package.json': { name: 'web', dependencies: { react: '^18.0.0', lodash: '^4.17.21' } },
    'web/node_modules/react/package.json': { version: '18.3.1' },
    'web/node_modules/lodash/package.json': { version: '4.17.21' },
    'api/package.json': { name: 'api', dependencies: { lodash: '^4.17.21' } },
    'api/node_modules/lodash/package.json': { version: '4.17.21' },
  });
  const registry = fakeRegistry({
    packages: { react: { latest: '19.1.0' }, lodash: { latest: '4.17.21' } },
  });
  const app = await createApp({
    token: TOKEN,
    port: () => PORT,
    roots: [root],
    registry: createRegistryClient({ fetch: registry.fetch }),
  });
  apps.push(app);
  return { app, registry, root };
}

describe('GET /api/projects', () => {
  it('lists projects, the scanned roots, and no hint for several projects', async () => {
    const { app, root } = await setup();
    const body = (await app.inject({ url: '/api/projects', headers })).json<{
      roots: string[];
      projects: { name: string }[];
      hint: string | null;
    }>();
    expect(body.roots).toEqual([root]);
    expect(body.projects.map((p) => p.name)).toEqual(['api', 'web']);
    expect(body.hint).toBeNull();
  });
});

describe('GET /api/matrix', () => {
  it('returns rows, insights, and the scan time', async () => {
    const { app } = await setup();
    const body = (await app.inject({ url: '/api/matrix', headers })).json<Matrix>();
    expect(body.rows.map((r) => r.name)).toEqual(['lodash', 'react']);
    expect(Array.isArray(body.insights)).toBe(true);
    expect(typeof body.scannedAt).toBe('string');
  });

  it('filters to outdated rows on request', async () => {
    const { app } = await setup();
    const body = (
      await app.inject({ url: '/api/matrix?onlyOutdated=true', headers })
    ).json<Matrix>();
    expect(body.rows.map((r) => r.name)).toEqual(['react']);
  });

  it('rejects an invalid query', async () => {
    const { app } = await setup();
    const response = await app.inject({ url: '/api/matrix?onlyOutdated=maybe', headers });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_USAGE' } });
  });

  it('analyzes once and serves later reads from that result', async () => {
    const { app, registry } = await setup();
    await app.inject({ url: '/api/matrix', headers });
    const calls = registry.calls.length;
    await app.inject({ url: '/api/matrix', headers });
    await app.inject({ url: '/api/projects', headers });
    expect(registry.calls.length).toBe(calls);
  });
});

describe('POST /api/rescan', () => {
  it('picks up changes on disk', async () => {
    const { app, root } = await setup();
    await app.inject({ url: '/api/matrix', headers });
    const fs = await import('node:fs/promises');
    await fs.mkdir(`${root}/new`, { recursive: true });
    await fs.writeFile(`${root}/new/package.json`, JSON.stringify({ name: 'new' }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/rescan',
      headers: { ...headers, origin: `http://${HOST}` },
    });
    expect(response.json<Matrix>().projects.map((p) => p.name)).toEqual(['api', 'new', 'web']);
  });
});

describe('startServer', () => {
  it('listens on 127.0.0.1 with a random port and a token in the launch URL', async () => {
    const root = await makeTree({ 'a/package.json': { name: 'a' } });
    const server = await startServer({
      roots: [root],
      registry: createRegistryClient({ fetch: fakeRegistry().fetch }),
    });
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}$/);
      const token = new URL(server.url).searchParams.get('token') ?? '';
      const response = await fetch(`http://127.0.0.1:${String(server.port)}/api/projects`, {
        headers: { 'x-depboard-token': token },
      });
      expect(response.status).toBe(200);
      const denied = await fetch(`http://127.0.0.1:${String(server.port)}/api/projects`);
      expect(denied.status).toBe(401);
    } finally {
      await server.close();
    }
  });

  it('is not reachable through other interfaces', async () => {
    const os = await import('node:os');
    const external = Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
    if (external === undefined) return; // no network interface to test against
    const root = await makeTree({ 'a/package.json': { name: 'a' } });
    const server = await startServer({
      roots: [root],
      registry: createRegistryClient({ fetch: fakeRegistry().fetch }),
    });
    try {
      await expect(
        fetch(`http://${external}:${String(server.port)}/api/projects`, {
          signal: AbortSignal.timeout(2000),
        }),
      ).rejects.toThrow();
    } finally {
      await server.close();
    }
  });
});
