/**
 * Maps over `items` with at most `limit` calls in flight, keeping the input order in the result.
 * Small on purpose, to avoid a runtime dependency for something this simple.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError('limit must be a positive integer');

  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * A shared gate: however many callers there are, at most `limit` tasks run at once.
 * Used to cap requests to the npm registry across every caller.
 */
export function createLimiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError('limit must be a positive integer');

  let active = 0;
  const queue: (() => void)[] = [];

  const release = () => {
    active--;
    queue.shift()?.();
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
