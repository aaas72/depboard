import semver from 'semver';
import { DepboardError } from '@depboard/shared';
import { isSafePackageName } from '../lib/package-name.js';
import type { InstallCommand, InstallInput } from './npm.js';

/**
 * The pnpm command that updates one dependency in a standalone project. Pure, so the exact
 * command is shown and tested before anything runs, and every argument comes from a fixed list or
 * a validated name and exact version (security.md).
 */
export function buildPnpmInstallCommand(input: InstallInput): InstallCommand {
  if (!isSafePackageName(input.name) || input.name.startsWith('-')) {
    throw new DepboardError('INVALID_PACKAGE_NAME', `"${input.name}" is not a valid package name.`);
  }
  if (semver.valid(input.version) !== input.version) {
    throw new DepboardError('INVALID_VERSION', `"${input.version}" is not an exact version.`);
  }
  const args = [
    'add',
    `${input.name}@${input.version}`,
    ...(input.depType === 'devDependencies' ? ['--save-dev'] : []),
  ];
  return { file: 'pnpm', args, display: ['pnpm', ...args].join(' ') };
}
