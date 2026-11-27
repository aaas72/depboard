import semver from 'semver';
import * as z from 'zod/mini';
import { SEVERITIES, type Advisory } from '@depboard/shared';
import { createLimiter } from '../lib/concurrency.js';
import { isSafePackageName } from '../lib/package-name.js';
import { normalizeRegistryUrl } from './npmrc.js';
import { extractChangelogUrl } from './repository-url.js';

export const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';
export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_CONCURRENCY = 16;
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Package names per bulk-advisory request. Keeps request bodies reasonable. */
export const ADVISORY_CHUNK_SIZE = 500;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface RegistryClientOptions {
  fetch?: FetchLike;
  registryUrl?: string;
  /** Map of `@scope` to registry base URL, so scoped packages never leak to the default registry. */
  scopedRegistries?: Readonly<Record<string, string>>;
  cacheTtlMs?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Sent as User-Agent. Generic on purpose: no user or machine details. */
  userAgent?: string;
  now?: () => number;
}

export interface PackageInfo {
  name: string;
  latest: string | null;
  /** The deprecation message of the latest version, when the author deprecated it. */
  deprecated: string | null;
  changelogUrl?: string;
}

export type PackageLookup =
  | { status: 'ok'; info: PackageInfo }
  | { status: 'not-found' }
  | { status: 'failed'; reason: string };

export interface AdvisoryLookup {
  /** Keyed by `name@version`. A key with an empty list means "checked, nothing known". */
  byVersion: Map<string, Advisory[]>;
  /** `name@version` keys whose lookup failed: their status is unknown, never "safe". */
  failed: Set<string>;
}

export interface RegistryClient {
  getPackage(name: string): Promise<PackageLookup>;
  getAdvisories(versions: ReadonlyMap<string, ReadonlySet<string>>): Promise<AdvisoryLookup>;
}

export const versionKey = (name: string, version: string) => `${name}@${version}`;

const latestManifestSchema = z.object({
  version: z.string(),
  deprecated: z.catch(z.optional(z.string()), undefined),
  repository: z.catch(
    z.optional(
      z.union([
        z.string(),
        z.object({
          url: z.catch(z.optional(z.string()), undefined),
          directory: z.catch(z.optional(z.string()), undefined),
        }),
      ]),
    ),
    undefined,
  ),
  homepage: z.catch(z.optional(z.string()), undefined),
});

const advisorySchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  severity: z.enum(SEVERITIES),
  vulnerable_versions: z.string(),
});

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
  return true; // network errors and timeouts
}

/**
 * The manifest of the `latest` dist-tag only. The full metadata can be huge: 25 MB for `next`
 * (thousands of canary versions) against 3 KB here. That difference decides whether the first
 * insight arrives within the 10-second budget.
 * Scoped names are sent as `@scope%2Fname`, the form the registry expects.
 */
function latestUrl(base: string, name: string): string {
  return `${base}/${name.replace('/', '%2F')}/latest`;
}

export function createRegistryClient(options: RegistryClientOptions = {}): RegistryClient {
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const rawBase = options.registryUrl ?? DEFAULT_REGISTRY_URL;
  const normalizedBase = normalizeRegistryUrl(rawBase);
  if (normalizedBase === null) throw new Error(`Invalid registry URL: ${rawBase}`);
  const base: string = normalizedBase;

  const scoped = new Map<string, string>();
  for (const [scope, url] of Object.entries(options.scopedRegistries ?? {})) {
    const normalized = normalizeRegistryUrl(url);
    if (normalized === null) throw new Error(`Invalid scoped registry URL for ${scope}: ${url}`);
    scoped.set(scope, normalized);
  }

  function baseFor(name: string): string {
    if (name.startsWith('@')) {
      const slash = name.indexOf('/');
      if (slash > 1) {
        const scopeBase = scoped.get(name.slice(0, slash));
        if (scopeBase !== undefined) return scopeBase;
      }
    }
    return base;
  }

  const ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const limit = createLimiter(options.concurrency ?? DEFAULT_CONCURRENCY);
  const headers = { 'user-agent': options.userAgent ?? 'depboard' };

  /** One retry with a short pause, for network errors, timeouts, 429, and 5xx. */
  async function request(
    url: string,
    init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await limit(async () => {
          const response = await doFetch(url, {
            ...init,
            headers: { ...headers, ...init.headers },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) throw new HttpError(response.status);
          const json: unknown = await response.json();
          return json;
        });
      } catch (error) {
        if (attempt >= 1 || !isRetryable(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  // In-flight and settled lookups share one entry: a package is requested once, however many
  // projects use it. Failures are not cached, so the next call retries.
  const packageCache = new Map<string, { expires: number; value: Promise<PackageLookup> }>();

  async function fetchPackage(name: string): Promise<PackageLookup> {
    try {
      const json = await request(latestUrl(baseFor(name), name), {
        headers: { accept: 'application/json' },
      });
      const parsed = latestManifestSchema.safeParse(json);
      if (!parsed.success) return { status: 'failed', reason: 'unexpected registry response' };
      const changelogUrl = extractChangelogUrl(parsed.data);
      return {
        status: 'ok',
        info: {
          name,
          latest: semver.valid(parsed.data.version) ? parsed.data.version : null,
          deprecated: parsed.data.deprecated ?? null,
          ...(changelogUrl !== null ? { changelogUrl } : {}),
        },
      };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return { status: 'not-found' };
      return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  function getPackage(name: string): Promise<PackageLookup> {
    if (!isSafePackageName(name)) return Promise.resolve({ status: 'not-found' });
    const cached = packageCache.get(name);
    if (cached && cached.expires > now()) return cached.value;

    const value = fetchPackage(name);
    packageCache.set(name, { expires: now() + ttl, value });
    void value.then((result) => {
      if (result.status === 'failed') packageCache.delete(name);
    });
    return value;
  }

  const advisoryCache = new Map<string, { expires: number; advisories: Advisory[] }>();

  async function getAdvisories(
    versions: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<AdvisoryLookup> {
    const byVersion = new Map<string, Advisory[]>();
    const failed = new Set<string>();
    const pending = new Map<string, string[]>();

    for (const [name, set] of versions) {
      if (!isSafePackageName(name)) continue;
      for (const version of set) {
        if (!semver.valid(version)) continue;
        const key = versionKey(name, version);
        const cached = advisoryCache.get(key);
        if (cached && cached.expires > now()) byVersion.set(key, cached.advisories);
        else pending.set(name, [...(pending.get(name) ?? []), version]);
      }
    }

    const byRegistry = new Map<string, string[]>();
    for (const name of pending.keys()) {
      const reg = baseFor(name);
      const list = byRegistry.get(reg);
      if (list) list.push(name);
      else byRegistry.set(reg, [name]);
    }

    const batches: { reg: string; chunk: string[] }[] = [];
    for (const [reg, names] of byRegistry) {
      for (let i = 0; i < names.length; i += ADVISORY_CHUNK_SIZE) {
        batches.push({ reg, chunk: names.slice(i, i + ADVISORY_CHUNK_SIZE) });
      }
    }

    await Promise.all(
      batches.map(async ({ reg, chunk }) => {
        const body = Object.fromEntries(chunk.map((name) => [name, pending.get(name) ?? []]));
        let json: unknown;
        try {
          json = await request(`${reg}/-/npm/v1/security/advisories/bulk`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
        } catch {
          for (const name of chunk) {
            for (const version of pending.get(name) ?? []) failed.add(versionKey(name, version));
          }
          return;
        }

        const response = typeof json === 'object' && json !== null ? json : {};
        for (const name of chunk) {
          const raw: unknown = (response as Record<string, unknown>)[name];
          const list = (Array.isArray(raw) ? raw : []).flatMap((item: unknown) => {
            const parsed = advisorySchema.safeParse(item);
            return parsed.success
              ? [
                  {
                    id: parsed.data.id,
                    title: parsed.data.title,
                    url: parsed.data.url,
                    severity: parsed.data.severity,
                    vulnerableVersions: parsed.data.vulnerable_versions,
                  },
                ]
              : [];
          });

          // The endpoint answers per package. Match each version ourselves, so an advisory
          // is only ever attached to a version inside its vulnerable range.
          for (const version of pending.get(name) ?? []) {
            const affecting = list.filter((advisory) =>
              semver.satisfies(version, advisory.vulnerableVersions, { includePrerelease: true }),
            );
            const key = versionKey(name, version);
            byVersion.set(key, affecting);
            advisoryCache.set(key, { expires: now() + ttl, advisories: affecting });
          }
        }
      }),
    );

    return { byVersion, failed };
  }

  return { getPackage, getAdvisories };
}
