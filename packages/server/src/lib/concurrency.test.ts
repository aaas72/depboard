import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './concurrency.js';

describe('mapWithConcurrency', () => {
  it('keeps input order even when calls finish out of order', async () => {
    const result = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it('never runs more than `limit` calls at once', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
      },
    );
    expect(peak).toBe(4);
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, () => Promise.resolve(1))).toEqual([]);
  });

  it('rejects an invalid limit', async () => {
    await expect(mapWithConcurrency([1], 0, () => Promise.resolve(1))).rejects.toThrow(RangeError);
  });
});
