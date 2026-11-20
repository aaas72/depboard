import semver from 'semver';
import { DepboardError, type DependencyType } from '@depboard/shared';
import { isSafePackageName } from '../lib/package-name.js';

/** A command as an argument array: never a string, never through a shell (security.md). */
export interface InstallCommand {
  file: string;
  args: string[];
  /** What the user reads before confirming. */
  display: string;
}

export interface InstallInput {
  name: string;
  /** An exact version. Ranges, tags, URLs, and paths are refused. */
  version: string;
  depType: DependencyType;
}

/**
 * The npm command that updates one dependency. Pure, so the exact command can be tested and
 * shown before anything runs. Every argument comes from this fixed list or a validated value.
 *
 * - `--save-dev` keeps a devDependency where it is.
 * - `--no-audit --no-fund` keep the output about the update itself (DepBoard shows advisories).
 */
export function buildInstallCommand(input: InstallInput): InstallCommand {
  if (!isSafePackageName(input.name) || input.name.startsWith('-')) {
    throw new DepboardError('INVALID_PACKAGE_NAME', `"${input.name}" is not a valid package name.`);
  }
  if (semver.valid(input.version) !== input.version) {
    throw new DepboardError('INVALID_VERSION', `"${input.version}" is not an exact version.`);
  }
  const args = [
    'install',
    `${input.name}@${input.version}`,
    ...(input.depType === 'devDependencies' ? ['--save-dev'] : []),
    '--no-audit',
    '--no-fund',
  ];
  return { file: 'npm', args, display: ['npm', ...args].join(' ') };
}
