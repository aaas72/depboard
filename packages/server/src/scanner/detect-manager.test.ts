import { describe, expect, it } from 'vitest';
import { makeTree } from '../testing/tmp-tree.js';
import path from 'node:path';
import { ancestorsWithin, detectManager, managerFromField } from './detect-manager.js';

describe('ancestorsWithin', () => {
  const root = path.resolve('/scan/root');

  it('walks from the folder up to the boundary, inclusive', () => {
    expect(ancestorsWithin(path.join(root, 'a', 'b'), root)).toEqual([
      path.join(root, 'a', 'b'),
      path.join(root, 'a'),
      root,
    ]);
  });

  it('returns nothing for a folder outside the boundary', () => {
    expect(ancestorsWithin(path.resolve('/elsewhere'), root)).toEqual([]);
  });
});

describe('managerFromField', () => {
  it.each([
    ['pnpm@9.1.0', 'pnpm'],
    ['yarn@4.0.0+sha512.abc', 'yarn'],
    ['npm@10.0.0', 'npm'],
    ['bun@1.1.0', 'bun'],
  ])('reads %s', (field, expected) => {
    expect(managerFromField(field)).toBe(expected);
  });

  it.each([['deno@1'], [''], [42], [undefined]])('ignores %s', (field) => {
    expect(managerFromField(field)).toBeNull();
  });
});

describe('detectManager', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ])('detects %s', async (lockFile, expected) => {
    const dir = await makeTree({ [lockFile]: '' });
    expect(await detectManager(dir, undefined)).toBe(expected);
  });

  it('prefers the packageManager field over lock files', async () => {
    const dir = await makeTree({ 'package-lock.json': '' });
    expect(await detectManager(dir, 'pnpm@9.0.0')).toBe('pnpm');
  });

  it('falls back to npm without any signal', async () => {
    const dir = await makeTree({});
    expect(await detectManager(dir, undefined)).toBe('npm');
  });
});
