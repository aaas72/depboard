import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeRegistryUrl, parseNpmrcRegistries, resolveUserRegistries } from './npmrc.js';
import { DEFAULT_REGISTRY_URL } from './registry-client.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('normalizeRegistryUrl', () => {
  it('accepts HTTPS registries and strips trailing slashes', () => {
    expect(normalizeRegistryUrl('https://npm.pkg.github.com/')).toBe('https://npm.pkg.github.com');
    expect(normalizeRegistryUrl('https://mirror.example.com/npm/virtual///')).toBe(
      'https://mirror.example.com/npm/virtual',
    );
  });

  it('allows plain HTTP only on loopback', () => {
    expect(normalizeRegistryUrl('http://127.0.0.1:4873/')).toBe('http://127.0.0.1:4873');
    expect(normalizeRegistryUrl('http://localhost:4873')).toBe('http://localhost:4873');
    expect(normalizeRegistryUrl('http://[::1]:4873/')).toBe('http://[::1]:4873');
    expect(normalizeRegistryUrl('http://mirror.example.com/')).toBeNull();
  });

  it.each([
    'https://user:secret@mirror.example.com',
    'https://mirror.example.com?token=secret',
    'https://mirror.example.com#frag',
    'https://${REG_HOST}/npm',
    'file:///etc/passwd',
    'javascript:alert(1)',
    '',
  ])('rejects unsafe or unexpanded URL %j', (raw) => {
    expect(normalizeRegistryUrl(raw)).toBeNull();
  });
});

describe('parseNpmrcRegistries', () => {
  it('parses default and scoped registries while ignoring comments and auth tokens', () => {
    const parsed = parseNpmrcRegistries(`
      # Company mirror
      registry = "https://mirror.example.com/npm/"
      @internal:registry = https://packages.internal.example/npm/ ; inline comment
      //packages.internal.example/npm/:_authToken=secret-token
      _auth = dXNlcjpwYXNz
      @bad_UPPER:registry = https://ignored.example.com
      @insecure:registry = http://remote-http.example.com
    `);

    expect(parsed).toEqual({
      registryUrl: 'https://mirror.example.com/npm',
      scopedRegistries: {
        '@internal': 'https://packages.internal.example/npm',
      },
    });
  });
});

describe('resolveUserRegistries', () => {
  it('reads ~/.npmrc and lets npm_config_registry override the default registry', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'depboard-npmrc-'));
    dirs.push(home);
    await fs.writeFile(
      path.join(home, '.npmrc'),
      'registry=https://from-file.example.com/\n@corp:registry=https://corp.example.com/npm/\n',
    );

    expect(resolveUserRegistries(home, {})).toEqual({
      registryUrl: 'https://from-file.example.com',
      scopedRegistries: { '@corp': 'https://corp.example.com/npm' },
    });

    expect(
      resolveUserRegistries(home, { npm_config_registry: 'https://from-env.example.com/' }),
    ).toEqual({
      registryUrl: 'https://from-env.example.com',
      scopedRegistries: { '@corp': 'https://corp.example.com/npm' },
    });
  });

  it('falls back to registry.npmjs.org when ~/.npmrc does not exist, and isolates DEPBOARD_REGISTRY_URL', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'depboard-npmrc-empty-'));
    dirs.push(home);
    expect(resolveUserRegistries(home, {})).toEqual({
      registryUrl: DEFAULT_REGISTRY_URL,
      scopedRegistries: {},
    });

    await fs.writeFile(path.join(home, '.npmrc'), '@corp:registry=https://corp.example.com\n');
    expect(
      resolveUserRegistries(home, { DEPBOARD_REGISTRY_URL: 'http://127.0.0.1:4000/' }),
    ).toEqual({
      registryUrl: 'http://127.0.0.1:4000',
      scopedRegistries: {},
    });
  });
});
