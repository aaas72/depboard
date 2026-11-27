export interface RepositoryInput {
  repository?: string | { url?: string | undefined; directory?: string | undefined } | undefined;
  homepage?: string | undefined;
}

const GITHUB_SHORTHAND_RE = /^(?:github:)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/;

function normalizeHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const shorthand = GITHUB_SHORTHAND_RE.exec(trimmed);
  if (shorthand) {
    return `https://github.com/${shorthand[1]}/${shorthand[2]}/releases`;
  }

  let candidate = trimmed;
  if (candidate.startsWith('git+https://')) {
    candidate = candidate.slice(4);
  } else if (candidate.startsWith('git://')) {
    candidate = `https://${candidate.slice(6)}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname) return null;

  if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
    const parts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    if (parts.length >= 2) {
      return `https://github.com/${parts[0]}/${parts[1]}/releases`;
    }
    return null;
  }

  const cleanPath = parsed.pathname.replace(/\.git$/, '');
  return `${parsed.origin}${cleanPath === '/' ? '' : cleanPath}${parsed.search}${parsed.hash}`;
}

/**
 * Extracts a safe HTTPS changelog/releases URL from an npm manifest's `repository`
 * (preferred) or `homepage` field. Rejects non-HTTPS, SSH, `javascript:`, and `data:` URLs.
 */
export function extractChangelogUrl(manifest: RepositoryInput): string | null {
  const repoRaw =
    typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  if (typeof repoRaw === 'string') {
    const normalized = normalizeHttpsUrl(repoRaw);
    if (normalized !== null) return normalized;
  }
  if (typeof manifest.homepage === 'string') {
    return normalizeHttpsUrl(manifest.homepage);
  }
  return null;
}
