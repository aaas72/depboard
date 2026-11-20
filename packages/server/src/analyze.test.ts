import { describe, expect, it } from 'vitest';
import { analyze } from './analyze.js';
import { createRegistryClient } from './registry/registry-client.js';
import { fakeRegistry } from './testing/fake-registry.js';
import { makeTree } from './testing/tmp-tree.js';

async function setup() {
  const root = await makeTree({
    'web/package.json': {
      name: 'web',
      dependencies: { react: '^18.2.0', lodash: '^4.17.0', '@acme/ui': 'workspace:*' },
    },
    'web/node_modules/react/package.json': { version: '18.3.1' },
    'web/node_modules/lodash/package.json': { version: '4.17.15' },
    'api/package.json': {
      name: 'api',
      dependencies: { lodash: '^4.17.21' },
      devDependencies: { typescript: '^5.4.0' },
    },
    'api/node_modules/lodash/package.json': { version: '4.17.21' },
  });
  const registry = fakeRegistry({
    packages: {
      react: { latest: '19.1.0' },
      lodash: { latest: '4.17.21' },
      typescript: { latest: '5.9.2' },
    },
    advisories: {
      lodash: [{ id: 1106913, severity: 'high', vulnerable_versions: '<4.17.21' }],
    },
  });
  const client = createRegistryClient({ fetch: registry.fetch });
  const result = await analyze([root], client, { now: () => new Date('2026-11-20T10:00:00Z') });
  const ids = Object.fromEntries(result.matrix.projects.map((p) => [p.name, p.id]));
  const row = (name: string) => result.matrix.rows.find((r) => r.name === name);
  return { result, registry, ids, row };
}

describe('analyze', () => {
  it('builds one row per package and one cell per project using it', async () => {
    const { result, row, ids } = await setup();
    expect(result.matrix.rows.map((r) => r.name)).toEqual([
      '@acme/ui',
      'lodash',
      'react',
      'typescript',
    ]);
    expect(Object.keys(row('lodash')?.cells ?? {}).sort()).toEqual([ids.api, ids.web].sort());
    expect(result.matrix.scannedAt).toBe('2026-11-20T10:00:00.000Z');
  });

  it('classifies installed versions against latest', async () => {
    const { row, ids } = await setup();
    const react = row('react')?.cells[ids.web ?? ''];
    expect(react).toMatchObject({
      version: '18.3.1',
      versionSource: 'installed',
      updateType: 'major',
    });
    expect(row('lodash')?.cells[ids.api ?? '']?.updateType).toBe('none');
  });

  it('flags the vulnerable project and clears the patched one', async () => {
    const { row, ids } = await setup();
    const lodash = row('lodash');
    expect(lodash?.cells[ids.web ?? '']?.vulnerability).toEqual({
      severity: 'high',
      count: 1,
      advisoryIds: [1106913],
    });
    expect(lodash?.cells[ids.api ?? '']?.vulnerability).toBeNull();
    expect(lodash?.advisories.map((a) => a.id)).toEqual([1106913]);
  });

  it('marks a not-installed version as an estimate with unknown vulnerability status', async () => {
    const { row, ids } = await setup();
    expect(row('typescript')?.cells[ids.api ?? '']).toMatchObject({
      installed: null,
      version: '5.4.0',
      versionSource: 'declared',
      updateType: 'minor',
      vulnerability: 'unknown',
    });
  });

  it('never sends workspace packages to the public registry', async () => {
    const { registry, row } = await setup();
    const urls = registry.calls.map((c) => c.url).join(' ');
    expect(urls).not.toContain('acme');
    const bulk = registry.calls.find((c) => c.method === 'POST');
    expect(Object.keys(bulk?.body as object)).not.toContain('@acme/ui');
    expect(row('@acme/ui')).toMatchObject({ lookup: 'skipped', latest: null });
  });

  it('asks the registry once per unique package and once for all advisories', async () => {
    const { registry } = await setup();
    const gets = registry.calls.filter((c) => c.method === 'GET').map((c) => c.url);
    expect(gets.sort()).toEqual([
      'https://registry.npmjs.org/lodash/latest',
      'https://registry.npmjs.org/react/latest',
      'https://registry.npmjs.org/typescript/latest',
    ]);
    expect(registry.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('still returns the matrix when the registry is down, and says so', async () => {
    const root = await makeTree({
      'web/package.json': { name: 'web', dependencies: { react: '^18.2.0' } },
      'web/node_modules/react/package.json': { version: '18.3.1' },
    });
    const client = createRegistryClient({ fetch: fakeRegistry({ fail: () => 'network' }).fetch });
    const result = await analyze([root], client);

    expect(result.failedLookups).toEqual(['react']);
    expect(result.advisoriesIncomplete).toBe(true);
    const cell = Object.values(result.matrix.rows[0]?.cells ?? {})[0];
    expect(cell).toMatchObject({
      installed: '18.3.1',
      updateType: 'unknown',
      vulnerability: 'unknown',
    });
    expect(result.matrix.rows[0]?.lookup).toBe('failed');
  });
});
