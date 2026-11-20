import path from 'node:path';

/**
 * Windows and default macOS file systems are case-insensitive, so `C:\Projects` and `c:\projects`
 * are the same folder. Compare in a normalized form, but always keep the original path for display.
 */
export function pathKey(p: string, platform: NodeJS.Platform = process.platform): string {
  const normalized = path.resolve(p);
  return platform === 'win32' || platform === 'darwin' ? normalized.toLowerCase() : normalized;
}

export function isSamePath(a: string, b: string, platform?: NodeJS.Platform): boolean {
  return pathKey(a, platform) === pathKey(b, platform);
}

/** True when `child` is `parent` itself or anywhere below it. */
export function isInside(parent: string, child: string, platform?: NodeJS.Platform): boolean {
  const rel = path.relative(pathKey(parent, platform), pathKey(child, platform));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True for `/` and Windows drive roots such as `C:\`. */
export function isFilesystemRoot(p: string): boolean {
  const resolved = path.resolve(p);
  return path.parse(resolved).root === resolved;
}

/** Expands a leading `~`, which shells like cmd.exe and PowerShell don't do for us. */
export function expandHome(p: string, homedir: string): string {
  if (p === '~') return homedir;
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(homedir, p.slice(2));
  return p;
}

/** Shortens a path for display: `/home/me/projects` → `~/projects`. */
export function displayPath(p: string, homedir: string): string {
  if (!isInside(homedir, p)) return p;
  const rel = path.relative(homedir, p);
  return rel === '' ? '~' : `~${path.sep}${rel}`;
}
