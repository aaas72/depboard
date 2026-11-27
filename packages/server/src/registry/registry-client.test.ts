import { describe, expect, it } from 'vitest';
import { fakeRegistry } from '../testing/fake-registry.js';
import { ADVISORY_CHUNK_SIZE, createRegistryClient, versionKey } from './registry-client.js';

const versions = (entries: Record<string, string[]>) =>
  new Map(Object.entries(entries).map(([name, list]) => [name, new Set(list)]));

describe('getPackage', () => {
  it('returns the latest version from the small /latest manifest', async () => {
    const registry = fakeRegistry({ packages: { react: { latest: '19.1.0' } } });
    const client = createRegistryClient({ fetch: registry.fetch });

    expect(await client.getPackage('react')).toEqual({
      status: 'ok',
      info: { name: 'react', latest: '19.1.0', deprecated: null },
    });
    expect(registry.calls[0]?.url).toBe('https://registry.npmjs.org/react/latest');
  });

  it('encodes scoped names the way the registry expects', async () => {
    const registry = fakeRegistry({ packages: { '@types/node': { latest: '24.0.0' } } });
    const client = createRegistryClient({ fetch: registry.fetch });
    await client.getPackage('@types/node');
    expect(registry.calls[0]?.url).toBe('https://registry.npmjs.org/@types%2Fnode/latest');
  });

  it('requests each package once, however many callers ask at the same time', async () => {
    const registry = fakeRegistry({ packages: { lodash: { latest: '4.17.21' } } });
    const client = createRegistryClient({ fetch: registry.fetch });
    await Promise.all(Array.from({ length: 10 }, () => client.getPackage('lodash')));
    expect(registry.calls).toHaveLength(1);
  });

  it('serves from cache until the TTL expires', async () => {
    let time = 0;
    const registry = fakeRegistry({ packages: { a: { latest: '1.0.0' } } });
    const client = createRegistryClient({
      fetch: registry.fetch,
      cacheTtlMs: 1000,
      now: () => time,
    });
    await client.getPackage('a');
    time = 999;
    await client.getPackage('a');
    expect(registry.calls).toHaveLength(1);
    time = 1001;
    await client.getPackage('a');
    expect(registry.calls).toHaveLength(2);
  });

  it('passes on the deprecation message of the latest version', async () => {
    const registry = fakeRegistry({
      packages: { request: { latest: '2.88.2', deprecated: 'request has been deprecated' } },
    });
    const client = createRegistryClient({ fetch: registry.fetch });
    const result = await client.getPackage('request');
    expect(result.status === 'ok' && result.info.deprecated).toBe('request has been deprecated');
  });

  it('reports a missing package as not-found', async () => {
    const client = createRegistryClient({ fetch: fakeRegistry().fetch });
    expect(await client.getPackage('does-not-exist')).toEqual({ status: 'not-found' });
  });

  it('retries once on a server error, then succeeds', async () => {
    const registry = fakeRegistry({
      packages: { a: { latest: '1.0.0' } },
      fail: (_url, attempt) => (attempt === 0 ? 503 : undefined),
    });
    const client = createRegistryClient({ fetch: registry.fetch });
    expect((await client.getPackage('a')).status).toBe('ok');
    expect(registry.calls).toHaveLength(2);
  });

  it('reports a persistent network failure as failed, and does not cache it', async () => {
    let down = true;
    const registry = fakeRegistry({
      packages: { a: { latest: '1.0.0' } },
      fail: () => (down ? 'network' : undefined),
    });
    const client = createRegistryClient({ fetch: registry.fetch });
    expect((await client.getPackage('a')).status).toBe('failed');
    down = false;
    expect((await client.getPackage('a')).status).toBe('ok');
  });

  it('never requests a crafted name', async () => {
    const registry = fakeRegistry();
    const client = createRegistryClient({ fetch: registry.fetch });
    expect(await client.getPackage('../-/npm/v1/user')).toEqual({ status: 'not-found' });
    expect(registry.calls).toHaveLength(0);
  });

  it('caps concurrent requests', async () => {
    let active = 0;
    let peak = 0;
    const inner = fakeRegistry({
      packages: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`p${i}`, { latest: '1.0.0' }]),
      ),
    });
    const client = createRegistryClient({
      concurrency: 3,
      fetch: async (url, init) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--;
        return inner.fetch(url, init);
      },
    });
    await Promise.all(Array.from({ length: 30 }, (_, i) => client.getPackage(`p${i}`)));
    expect(peak).toBe(3);
  });

  it('sends a generic user agent with no personal details', async () => {
    const registry = fakeRegistry({ packages: { a: { latest: '1.0.0' } } });
    const client = createRegistryClient({ fetch: registry.fetch, userAgent: 'depboard/0.1.0' });
    await client.getPackage('a');
    expect(registry.calls[0]?.headers['user-agent']).toBe('depboard/0.1.0');
  });
});

describe('getAdvisories', () => {
  const lodash = {
    lodash: [
      { id: 1, severity: 'high' as const, vulnerable_versions: '<4.17.21' },
      { id: 2, severity: 'moderate' as const, vulnerable_versions: '>=4.0.0 <4.17.19' },
    ],
  };

  it('checks every package and version in one request', async () => {
    const registry = fakeRegistry({ advisories: lodash });
    const client = createRegistryClient({ fetch: registry.fetch });
    await client.getAdvisories(versions({ lodash: ['4.17.15', '4.17.21'], react: ['19.1.0'] }));

    expect(registry.calls).toHaveLength(1);
    expect(registry.calls[0]?.method).toBe('POST');
    expect(registry.calls[0]?.body).toEqual({ lodash: ['4.17.15', '4.17.21'], react: ['19.1.0'] });
  });

  it('attaches an advisory only to versions inside its vulnerable range', async () => {
    const client = createRegistryClient({ fetch: fakeRegistry({ advisories: lodash }).fetch });
    const result = await client.getAdvisories(
      versions({ lodash: ['4.17.15', '4.17.20', '4.17.21'], react: ['19.1.0'] }),
    );

    expect(result.byVersion.get(versionKey('lodash', '4.17.15'))?.map((a) => a.id)).toEqual([1, 2]);
    expect(result.byVersion.get(versionKey('lodash', '4.17.20'))?.map((a) => a.id)).toEqual([1]);
    expect(result.byVersion.get(versionKey('lodash', '4.17.21'))).toEqual([]);
    expect(result.byVersion.get(versionKey('react', '19.1.0'))).toEqual([]);
    expect(result.failed.size).toBe(0);
  });

  it('marks versions as failed, never as safe, when the request fails', async () => {
    const registry = fakeRegistry({ advisories: lodash, fail: () => 'network' });
    const client = createRegistryClient({ fetch: registry.fetch });
    const result = await client.getAdvisories(versions({ lodash: ['4.17.15'] }));

    expect(result.failed.has(versionKey('lodash', '4.17.15'))).toBe(true);
    expect(result.byVersion.has(versionKey('lodash', '4.17.15'))).toBe(false);
  });

  it('splits very large requests into chunks', async () => {
    const registry = fakeRegistry();
    const client = createRegistryClient({ fetch: registry.fetch });
    const many = Object.fromEntries(
      Array.from({ length: ADVISORY_CHUNK_SIZE + 1 }, (_, i) => [`p${i}`, ['1.0.0']]),
    );
    await client.getAdvisories(versions(many));
    expect(registry.calls).toHaveLength(2);
  });

  it('caches results and only asks for new versions', async () => {
    const registry = fakeRegistry({ advisories: lodash });
    const client = createRegistryClient({ fetch: registry.fetch });
    await client.getAdvisories(versions({ lodash: ['4.17.15'] }));
    await client.getAdvisories(versions({ lodash: ['4.17.15', '4.17.21'] }));

    expect(registry.calls).toHaveLength(2);
    expect(registry.calls[1]?.body).toEqual({ lodash: ['4.17.21'] });
  });

  it('ignores malformed advisories instead of failing', async () => {
    const client = createRegistryClient({
      fetch: () =>
        Promise.resolve(
          Response.json({
            lodash: [
              { id: 1, severity: 'high', vulnerable_versions: '<5', title: 't', url: 'u' },
              { id: 'bad' },
            ],
          }),
        ),
    });
    const result = await client.getAdvisories(versions({ lodash: ['4.0.0'] }));
    expect(result.byVersion.get(versionKey('lodash', '4.0.0'))?.map((a) => a.id)).toEqual([1]);
  });

  it('skips invalid names and versions', async () => {
    const registry = fakeRegistry();
    const client = createRegistryClient({ fetch: registry.fetch });
    await client.getAdvisories(versions({ '../x': ['1.0.0'], ok: ['not-a-version'] }));
    expect(registry.calls).toHaveLength(0);
  });
});

describe('createRegistryClient', () => {
  it('rejects a registry URL that is not https (or loopback http)', () => {
    expect(() => createRegistryClient({ registryUrl: 'file:///etc' })).toThrow();
    expect(() => createRegistryClient({ registryUrl: 'http://remote.example.com' })).toThrow();
  });

  it('routes scoped packages and advisories to their configured registry without leaking to default', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const client = createRegistryClient({
      scopedRegistries: { '@corp': 'https://corp.example.com/npm/' },
      fetch: (url, init) => {
        const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        calls.push({ url, body });
        if (init?.method === 'POST') return Promise.resolve(Response.json({}));
        return Promise.resolve(Response.json({ version: '2.0.0' }));
      },
    });

    await client.getPackage('@corp/ui');
    await client.getPackage('react');
    await client.getAdvisories(versions({ '@corp/ui': ['1.0.0'], react: ['19.1.0'] }));

    expect(calls.map((c) => c.url)).toEqual([
      'https://corp.example.com/npm/@corp%2Fui/latest',
      'https://registry.npmjs.org/react/latest',
      'https://corp.example.com/npm/-/npm/v1/security/advisories/bulk',
      'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    ]);
    expect(calls[2]?.body).toEqual({ '@corp/ui': ['1.0.0'] });
    expect(calls[3]?.body).toEqual({ react: ['19.1.0'] });
  });
});
