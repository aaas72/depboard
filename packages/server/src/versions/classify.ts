import semver from 'semver';
import type { UpdateType } from '@depboard/shared';

/**
 * How far `current` is from `latest`, as a risk level.
 *
 * Follows SemVer's own rule for 0.x versions: before 1.0, any minor bump may break
 * (`^0.2.0` won't even install `0.3.0`), and in 0.0.x every bump may break. Those are
 * reported as `major`, because the color means "possible breaking change", not "first digit changed".
 */
export function classifyUpdate(current: string | null, latest: string | null): UpdateType {
  if (current === null || latest === null) return 'unknown';
  const from = semver.parse(current);
  const to = semver.parse(latest);
  if (!from || !to) return 'unknown';
  if (semver.gte(from, to)) return 'none';

  // A prerelease moving to its own final release (19.0.0-rc.1 → 19.0.0) is not a breaking
  // change: the user already adopted that version. semver.diff calls it 'major'.
  if (
    from.prerelease.length > 0 &&
    from.major === to.major &&
    from.minor === to.minor &&
    from.patch === to.patch
  ) {
    return 'prerelease';
  }

  const diff = semver.diff(from, to);
  switch (diff) {
    case 'major':
    case 'premajor':
      return 'major';
    case 'minor':
    case 'preminor':
      return from.major === 0 ? 'major' : 'minor';
    case 'patch':
    case 'prepatch':
      return from.major === 0 && from.minor === 0 ? 'major' : 'patch';
    case 'prerelease':
      return 'prerelease';
    default:
      return 'unknown';
  }
}

/**
 * True when `declared` is a plain registry range (`^1.2.0`, `~1`, `1.x`, `>=2 <3`, `*`).
 * Workspace links, file paths, git URLs, tarballs, and npm aliases are not: those packages are
 * never looked up on the public registry, so internal or private package names don't leak.
 */
export function isRegistryRange(declared: string): boolean {
  if (
    /^(workspace|file|link|portal|git|git\+\w+|github|gitlab|bitbucket|https?|npm|catalog):/i.test(
      declared,
    )
  ) {
    return false;
  }
  if (declared.includes('/') && !declared.includes(' ')) return false; // "user/repo" GitHub shorthand
  return semver.validRange(declared) !== null;
}

/**
 * The version a cell is compared with: the installed one when known, else the lowest version
 * the declared range allows (an estimate, marked as such in the matrix).
 */
export function comparableVersion(
  installed: string | null,
  declared: string,
): { version: string | null; source: 'installed' | 'declared' } {
  if (installed !== null && semver.valid(installed))
    return { version: installed, source: 'installed' };
  if (!isRegistryRange(declared)) return { version: null, source: 'declared' };
  try {
    return { version: semver.minVersion(declared)?.version ?? null, source: 'declared' };
  } catch {
    return { version: null, source: 'declared' };
  }
}
