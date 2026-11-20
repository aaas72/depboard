/**
 * npm package name shape: optional `@scope/`, then URL-safe characters, never `.` or `..` alone.
 * Checked before a name is used in a file path or a registry URL, so a crafted name like
 * `../../x` can't read outside node_modules or reach another registry route.
 */
const PACKAGE_NAME = /^(?:@[a-z0-9~-][\w.~-]*\/)?[a-z0-9~-][\w.~-]*$/i;

export function isSafePackageName(name: string): boolean {
  return name.length <= 214 && PACKAGE_NAME.test(name);
}
