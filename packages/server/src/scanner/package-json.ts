// zod/mini is tree-shakable: the full `zod` build added ~800 KB to the published bundle.
import * as z from 'zod/mini';
import type { DependencyType } from '@depboard/shared';

/**
 * Only the fields DepBoard needs. Everything else in a package.json is ignored, and a bad
 * value in one dependency map never rejects the whole file.
 */
const dependencyMap = z.pipe(
  z.catch(z.optional(z.record(z.string(), z.unknown())), undefined),
  z.transform((map) => {
    // Null prototype: a dependency named "__proto__" or "constructor" must stay plain data.
    const clean = Object.create(null) as Record<string, string>;
    for (const [name, range] of Object.entries(map ?? {})) {
      if (typeof range === 'string' && name.length > 0) clean[name] = range;
    }
    return clean;
  }),
);

/** npm, yarn, and bun: `"workspaces": [...]` or `"workspaces": { "packages": [...] }`. */
const workspacesField = z.pipe(
  z.catch(z.optional(z.unknown()), undefined),
  z.transform((value): string[] | undefined => {
    const list = Array.isArray(value)
      ? value
      : typeof value === 'object' && value !== null && 'packages' in value
        ? value.packages
        : undefined;
    if (!Array.isArray(list)) return undefined;
    const patterns = list.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return patterns.length > 0 ? patterns : undefined;
  }),
);

const packageJsonSchema = z.object({
  name: z.catch(z.optional(z.string()), undefined),
  workspaces: workspacesField,
  packageManager: z.optional(z.unknown()),
  dependencies: dependencyMap,
  devDependencies: dependencyMap,
});

export interface DeclaredDependency {
  name: string;
  declared: string;
  depType: DependencyType;
}

export interface ParsedPackageJson {
  name: string | undefined;
  packageManager: unknown;
  dependencies: DeclaredDependency[];
  /** Workspace globs, when this package.json is a monorepo root (npm, yarn, bun). */
  workspaces: string[] | undefined;
}

export type ParseResult = { ok: true; value: ParsedPackageJson } | { ok: false; reason: string };

export function parsePackageJson(text: string): ParseResult {
  let json: unknown;
  try {
    // Some editors save package.json with a BOM, which JSON.parse rejects.
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }

  const result = packageJsonSchema.safeParse(json);
  if (!result.success) return { ok: false, reason: 'not a JSON object' };

  const { name, packageManager, dependencies, devDependencies, workspaces } = result.data;
  const deps: DeclaredDependency[] = [
    ...Object.entries(dependencies).map(([dep, declared]) => ({
      name: dep,
      declared,
      depType: 'dependencies' as const,
    })),
    // A package listed in both maps is reported once, as a runtime dependency.
    ...Object.entries(devDependencies)
      .filter(([dep]) => !Object.hasOwn(dependencies, dep))
      .map(([dep, declared]) => ({ name: dep, declared, depType: 'devDependencies' as const })),
  ];

  return { ok: true, value: { name, packageManager, dependencies: deps, workspaces } };
}
