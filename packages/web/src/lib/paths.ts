/**
 * Shows a path inside the home folder as `~/projects` (`~\projects` on Windows), like the CLI does.
 * Keeps the username out of screenshots, which is where DepBoard's findings get shared.
 * The browser has no `path` module, so the separator is read from `home` itself.
 */
export function shortenPath(p: string, home: string): string {
  const windows = home.includes('\\');
  const sep = windows ? '\\' : '/';
  const base = home.endsWith(sep) ? home.slice(0, -1) : home;
  if (base === '') return p; // no home, or home is the filesystem root: nothing to shorten
  // Windows paths are case-insensitive: C:\Users\Me and c:\users\me are the same folder.
  const [a, b] = windows ? [p.toLowerCase(), base.toLowerCase()] : [p, base];
  if (a === b) return '~';
  if (a.startsWith(b + sep)) return `~${p.slice(base.length)}`;
  return p;
}
