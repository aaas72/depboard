import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_REGISTRY_URL } from './registry-client.js';

export interface UserRegistries {
  registryUrl: string;
  scopedRegistries: Record<string, string>;
}

const SCOPE_RE = /^@[a-z0-9-~][a-z0-9-._~]*$/;

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

/**
 * Validates and normalizes a registry base URL. Remote registries must use HTTPS; plain HTTP is
 * allowed only on loopback for local mirrors and test servers. Credentials, query strings, and
 * fragments are refused so secrets never sit in URLs or error messages.
 */
export function normalizeRegistryUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.includes('${')) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.username !== '' || parsed.password !== '') return null;
  if (parsed.search !== '' || parsed.hash !== '') return null;
  if (parsed.protocol === 'https:') {
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  }
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) {
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  }
  return null;
}

function unquoteValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  // Strip trailing inline `#` or `;` comments when preceded by whitespace.
  return trimmed.replace(/\s+[#;].*$/, '').trim();
}

/**
 * Extracts only default and `@scope` registry URLs from `.npmrc` text. Auth tokens (`_authToken`,
 * `_auth`, `//host/:_authToken`) and unrelated settings are ignored completely.
 */
export function parseNpmrcRegistries(content: string): {
  registryUrl?: string;
  scopedRegistries: Record<string, string>;
} {
  let registryUrl: string | undefined;
  const scopedRegistries: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    const value = unquoteValue(line.slice(eq + 1));

    if (key === 'registry') {
      const normalized = normalizeRegistryUrl(value);
      if (normalized !== null) registryUrl = normalized;
      continue;
    }

    if (key.endsWith(':registry')) {
      const scope = key.slice(0, -':registry'.length).trim();
      if (!SCOPE_RE.test(scope)) continue;
      const normalized = normalizeRegistryUrl(value);
      if (normalized !== null) scopedRegistries[scope] = normalized;
    }
  }

  return registryUrl === undefined ? { scopedRegistries } : { registryUrl, scopedRegistries };
}

/**
 * Resolves registry settings from the user's own `~/.npmrc` and standard environment variables.
 * Project-level `.npmrc` files inside scanned folders are intentionally ignored so an untrusted
 * repository cannot redirect requests or probe internal hosts.
 */
export function resolveUserRegistries(
  homedir: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): UserRegistries {
  const explicit = env['DEPBOARD_REGISTRY_URL'];
  if (explicit !== undefined && explicit.trim() !== '') {
    return {
      registryUrl: normalizeRegistryUrl(explicit) ?? explicit.trim(),
      scopedRegistries: {},
    };
  }

  let fileText = '';
  try {
    fileText = fs.readFileSync(path.join(homedir, '.npmrc'), 'utf8');
  } catch {
    // Missing or unreadable ~/.npmrc is normal: fall back to defaults.
  }

  const fromFile = parseNpmrcRegistries(fileText);
  const envRegistry = env['npm_config_registry'] ?? env['NPM_CONFIG_REGISTRY'];
  const normalizedEnv = envRegistry !== undefined ? normalizeRegistryUrl(envRegistry) : null;

  return {
    registryUrl: normalizedEnv ?? fromFile.registryUrl ?? DEFAULT_REGISTRY_URL,
    scopedRegistries: fromFile.scopedRegistries,
  };
}
