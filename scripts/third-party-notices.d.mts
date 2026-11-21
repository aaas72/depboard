// Types for third-party-notices.mjs, which the CLI build (packages/cli/tsup.config.ts) imports.

export declare const ALLOWED_LICENSES: ReadonlySet<string>;

/** True when an SPDX expression can be satisfied with allowed licenses ("A OR B", "A AND B"). */
export declare function isAllowedLicense(expression: unknown): boolean;

export interface Notices {
  markdown: string;
  packages: number;
  problems: string[];
}

/** Builds THIRD_PARTY_LICENSES.md from the absolute paths of every bundled module. */
export declare function buildNotices(files: readonly string[]): Notices;

/** Bundled module paths from an esbuild metafile (paths relative to `cwd`). */
export declare function filesFromMetafile(metafile: string, cwd: string): string[];
