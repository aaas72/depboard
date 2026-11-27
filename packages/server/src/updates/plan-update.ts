import semver from 'semver';
import {
  DepboardError,
  type Matrix,
  type Project,
  type UpdateRequest,
  type UpdateType,
} from '@depboard/shared';
import { buildBunInstallCommand } from '../adapters/bun.js';
import { buildInstallCommand, type InstallCommand } from '../adapters/npm.js';
import { buildPnpmInstallCommand } from '../adapters/pnpm.js';
import { buildYarnInstallCommand } from '../adapters/yarn.js';
import { isSafePackageName } from '../lib/package-name.js';
import { isInside } from '../lib/paths.js';
import { classifyUpdate } from '../versions/classify.js';

export interface UpdatePlan {
  project: Project;
  version: string;
  updateType: UpdateType;
  command: InstallCommand;
}

/**
 * Checks an update request against what the scan found, and returns the exact command.
 * Nothing in the request is trusted: the folder comes from the scan (looked up by project id,
 * never a path from the request), the package must be a registry dependency that project
 * already declares, and the version must be exact. A major update needs `confirmMajor`.
 */
export function planUpdate(
  matrix: Matrix,
  roots: readonly string[],
  request: UpdateRequest,
): UpdatePlan {
  if (request.projectIds.length !== 1) {
    throw new DepboardError('INVALID_USAGE', 'Update one project at a time.');
  }
  if (!isSafePackageName(request.package) || request.package.startsWith('-')) {
    throw new DepboardError('INVALID_PACKAGE_NAME', 'That is not a valid package name.');
  }
  if (request.version !== 'latest' && semver.valid(request.version) !== request.version) {
    throw new DepboardError(
      'INVALID_VERSION',
      'The version must be exact (like 19.1.0) or "latest".',
    );
  }

  const projectId = request.projectIds[0];
  const project = matrix.projects.find((p) => p.id === projectId);
  if (!project) throw new DepboardError('PROJECT_NOT_FOUND', 'That project is not in this scan.');
  // Defense in depth: the scan only finds folders inside the roots, but never write outside them.
  if (!roots.some((root) => isInside(root, project.path))) {
    throw new DepboardError('FORBIDDEN_PATH', 'That project is outside the scanned folders.');
  }

  const row = matrix.rows.find((r) => r.name === request.package);
  const cell = row?.cells[project.id];
  if (!row || !cell) {
    throw new DepboardError('NOT_FOUND', `${project.name} doesn't depend on ${request.package}.`);
  }
  if (row.lookup !== 'ok' || row.latest === null) {
    throw new DepboardError(
      'NOT_UPDATABLE',
      `${request.package} isn't a registry version DepBoard can update (workspace, file, git, alias, or unreachable).`,
    );
  }
  // In a monorepo the right command depends on which of its packages declares the dependency,
  // and the wrong one can damage the workspace: do no harm, show the way instead.
  if (project.workspacePackages !== undefined) {
    throw new DepboardError(
      'WORKSPACE_NOT_SUPPORTED',
      'Updating packages inside a monorepo from DepBoard comes in a later version.',
    );
  }

  const version = request.version === 'latest' ? row.latest : request.version;
  const updateType = classifyUpdate(cell.version, version);
  if (updateType === 'major' && request.confirmMajor !== true && request.dryRun !== true) {
    throw new DepboardError('MAJOR_NOT_CONFIRMED', 'A major update needs confirmation first.', {
      hint: 'Review the command and confirm it.',
    });
  }

  const adapters = {
    npm: buildInstallCommand,
    pnpm: buildPnpmInstallCommand,
    yarn: buildYarnInstallCommand,
    bun: buildBunInstallCommand,
  } as const;
  const buildCommand = adapters[project.manager];
  return {
    project,
    version,
    updateType,
    command: buildCommand({ name: row.name, version, depType: cell.depType }),
  };
}
