import semver from 'semver';
import { DepboardError } from '@depboard/shared';
import { isSafePackageName } from '../lib/package-name.js';
import type { InstallCommand, InstallInput } from './npm.js';

/**
 * The bun command that updates one dependency in a standalone project. Pure, with validated
 * package name and exact SemVer only, executed directly without a shell (security.md).
 */
export function buildBunInstallCommand(input: InstallInput): InstallCommand {
  if (!isSafePackageName(input.name) || input.name.startsWith('-')) {
    throw new DepboardError('INVALID_PACKAGE_NAME', `"${input.name}" is not a valid package name.`);
  }
  if (semver.valid(input.version) !== input.version) {
    throw new DepboardError('INVALID_VERSION', `"${input.version}" is not an exact version.`);
  }
  const args = [
    'add',
    `${input.name}@${input.version}`,
    ...(input.depType === 'devDependencies' ? ['--dev'] : []),
  ];
  return { file: 'bun', args, display: ['bun', ...args].join(' ') };
}
