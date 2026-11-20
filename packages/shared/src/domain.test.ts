import { describe, expect, it } from 'vitest';
import { compareSeverity, isPackageManagerId } from './domain.js';
import { DepboardError } from './errors.js';

describe('isPackageManagerId', () => {
  it.each(['npm', 'pnpm', 'yarn', 'bun'])('accepts %s', (id) => {
    expect(isPackageManagerId(id)).toBe(true);
  });

  it.each(['NPM', 'deno', '', 42, null, undefined])('rejects %s', (value) => {
    expect(isPackageManagerId(value)).toBe(false);
  });
});

describe('compareSeverity', () => {
  it('orders low < moderate < high < critical', () => {
    const sorted = (['critical', 'low', 'high', 'moderate'] as const).toSorted(compareSeverity);
    expect(sorted).toEqual(['low', 'moderate', 'high', 'critical']);
  });
});

describe('DepboardError', () => {
  it('carries a stable code and an optional hint', () => {
    const error = new DepboardError('ROOT_NOT_ALLOWED', "Can't scan C:\\", {
      hint: 'Point it at your projects folder',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('ROOT_NOT_ALLOWED');
    expect(error.hint).toBe('Point it at your projects folder');
  });
});
