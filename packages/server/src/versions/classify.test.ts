import { describe, expect, it } from 'vitest';
import { classifyUpdate, comparableVersion, isRegistryRange } from './classify.js';

describe('classifyUpdate', () => {
  it.each([
    ['18.3.1', '19.1.0', 'major'],
    ['18.2.0', '18.3.1', 'minor'],
    ['18.3.0', '18.3.1', 'patch'],
    ['19.1.0', '19.1.0', 'none'],
    ['20.0.0', '19.1.0', 'none'], // ahead of latest (e.g. a canary): nothing to update
    ['19.0.0-rc.1', '19.0.0', 'prerelease'],
  ] as const)('%s → %s is %s', (current, latest, expected) => {
    expect(classifyUpdate(current, latest)).toBe(expected);
  });

  it('treats a 0.x minor bump as possibly breaking, like SemVer does', () => {
    expect(classifyUpdate('0.2.0', '0.3.0')).toBe('major');
    expect(classifyUpdate('0.2.0', '0.2.5')).toBe('patch');
  });

  it('treats any 0.0.x bump as possibly breaking', () => {
    expect(classifyUpdate('0.0.1', '0.0.2')).toBe('major');
  });

  it.each([
    [null, '1.0.0'],
    ['1.0.0', null],
    ['not-a-version', '1.0.0'],
  ])('is unknown for %s → %s', (current, latest) => {
    expect(classifyUpdate(current, latest)).toBe('unknown');
  });
});

describe('isRegistryRange', () => {
  it.each(['^18.2.0', '~1.0', '1.x', '*', '>=2 <3', '1.2.3', 'latest'.replace('latest', '>=0')])(
    'accepts %s',
    (range) => {
      expect(isRegistryRange(range)).toBe(true);
    },
  );

  it.each([
    'workspace:*',
    'workspace:^1.0.0',
    'file:../lib',
    'link:../lib',
    'git+https://github.com/a/b.git',
    'github:user/repo',
    'user/repo',
    'https://example.com/pkg.tgz',
    'npm:other-package@^1.0.0',
    'catalog:',
    'latest',
  ])('rejects %s, so it is never sent to the public registry', (range) => {
    expect(isRegistryRange(range)).toBe(false);
  });
});

describe('comparableVersion', () => {
  it('prefers the installed version', () => {
    expect(comparableVersion('18.3.1', '^18.0.0')).toEqual({
      version: '18.3.1',
      source: 'installed',
    });
  });

  it('falls back to the lowest version the range allows, marked as declared', () => {
    expect(comparableVersion(null, '^18.2.0')).toEqual({ version: '18.2.0', source: 'declared' });
  });

  it('gives up on non-registry ranges', () => {
    expect(comparableVersion(null, 'workspace:*')).toEqual({ version: null, source: 'declared' });
  });
});
