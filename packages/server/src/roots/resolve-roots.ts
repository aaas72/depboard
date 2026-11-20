import fs from 'node:fs/promises';
import path from 'node:path';
import { DepboardError } from '@depboard/shared';
import { displayPath, expandHome, isFilesystemRoot, isInside, isSamePath } from '../lib/paths.js';

export interface ResolveRootsContext {
  cwd: string;
  homedir: string;
}

export interface ResolvedRoots {
  /** Real, absolute, deduplicated root folders. */
  roots: string[];
  /** True when a root is the user's whole home folder. The caller must confirm before scanning. */
  includesHome: boolean;
}

async function resolveOne(input: string, ctx: ResolveRootsContext): Promise<string> {
  const absolute = path.resolve(ctx.cwd, expandHome(input, ctx.homedir));

  let real: string;
  try {
    real = await fs.realpath(absolute);
  } catch (cause) {
    throw new DepboardError('ROOT_NOT_FOUND', `Folder not found: ${absolute}`, {
      hint: 'Check the path and try again.',
      cause,
    });
  }

  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new DepboardError('ROOT_NOT_FOUND', `Not a folder: ${real}`, {
      hint: 'Point DepBoard at the folder that holds your projects, not at a file.',
    });
  }

  if (isFilesystemRoot(real)) {
    throw new DepboardError(
      'ROOT_NOT_ALLOWED',
      `Can't scan ${real}: DepBoard doesn't scan whole drives.`,
      {
        hint: `Point it at the folder that holds your projects, e.g.: npx depboard ${displayPath(
          path.join(ctx.homedir, 'projects'),
          ctx.homedir,
        )}`,
      },
    );
  }

  return real;
}

/** Drops roots that sit inside another root, so no folder is scanned twice. */
function dropNested(roots: string[]): string[] {
  const byLength = [...roots].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const root of byLength) {
    if (!kept.some((parent) => isInside(parent, root))) kept.push(root);
  }
  // Keep the user's original order for display.
  return roots.filter((root) => kept.includes(root));
}

/**
 * Turns the paths given on the command line into the folders to scan.
 * No input means the current directory. DepBoard never picks folders on its own.
 */
export async function resolveRoots(
  inputs: readonly string[],
  ctx: ResolveRootsContext,
): Promise<ResolvedRoots> {
  const requested = inputs.length > 0 ? inputs : [ctx.cwd];
  const resolved = await Promise.all(requested.map((input) => resolveOne(input, ctx)));
  const roots = dropNested(resolved);

  let realHome = ctx.homedir;
  try {
    realHome = await fs.realpath(ctx.homedir);
  } catch {
    // A missing home folder only means no root can be the home folder.
  }

  return {
    roots,
    includesHome: roots.some((root) => isSamePath(root, realHome)),
  };
}
