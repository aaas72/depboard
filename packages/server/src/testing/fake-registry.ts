import type { FetchLike } from '../registry/registry-client.js';

export interface FakePackage {
  latest: string;
  deprecated?: string;
}

export interface FakeAdvisory {
  id: number;
  title?: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  vulnerable_versions: string;
}

export interface FakeRegistryOptions {
  packages?: Record<string, FakePackage>;
  advisories?: Record<string, FakeAdvisory[]>;
  /** Make specific URLs fail: return a status code, or 'network' to throw. */
  fail?: (url: string, attempt: number) => number | 'network' | undefined;
}

export interface FakeRegistry {
  fetch: FetchLike;
  calls: { url: string; method: string; body?: unknown; headers: Record<string, string> }[];
}

/** An in-memory npm registry: tests never touch the network. */
export function fakeRegistry(options: FakeRegistryOptions = {}): FakeRegistry {
  const calls: FakeRegistry['calls'] = [];
  const attempts = new Map<string, number>();

  const fetch: FetchLike = (url, init) => {
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body, headers: (init?.headers ?? {}) as Record<string, string> });

    const attempt = attempts.get(url) ?? 0;
    attempts.set(url, attempt + 1);
    const failure = options.fail?.(url, attempt);
    if (failure === 'network') return Promise.reject(new TypeError('fetch failed'));
    if (failure !== undefined) return Promise.resolve(new Response('error', { status: failure }));

    if (url.endsWith('/-/npm/v1/security/advisories/bulk')) {
      const requested = body as Record<string, string[]>;
      const result = Object.fromEntries(
        Object.keys(requested)
          .filter((name) => options.advisories?.[name])
          .map((name) => [
            name,
            (options.advisories?.[name] ?? []).map((a) => ({
              title: `Advisory ${a.id}`,
              url: `https://github.com/advisories/${a.id}`,
              ...a,
            })),
          ]),
      );
      return Promise.resolve(Response.json(result));
    }

    const match = /\/([^/]+)\/latest$/.exec(url);
    const name = decodeURIComponent(match?.[1] ?? '');
    const pkg = options.packages?.[name];
    if (!pkg) return Promise.resolve(Response.json({ error: 'Not found' }, { status: 404 }));
    return Promise.resolve(
      Response.json({
        name,
        version: pkg.latest,
        ...(pkg.deprecated ? { deprecated: pkg.deprecated } : {}),
      }),
    );
  };

  return { fetch, calls };
}
