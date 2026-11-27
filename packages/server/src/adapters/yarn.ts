import semver from 'semver';
import { DepboardError } from '@depboard/shared';
import { isSafePackageName } from '../lib/package-name.js';
import type { InstallCommand, InstallInput } from './npm.js';

/**
 * The yarn command that updates one dependency in a standalone project. `--dev` works in both
 * Yarn Classic (v1) and Yarn Berry (v2+). Pure, with validated name and exact SemVer only.
 */
export function buildYarnInstallCommand(input: InstallInput): InstallCommand {
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
  return { file: 'yarn', args, display: ['yarn', ...args].join(' ') };
}
