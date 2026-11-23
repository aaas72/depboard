import { describe, expect, it } from 'vitest';
import type { Advisory } from '@depboard/shared';
import {
  versionKey,
  type AdvisoryLookup,
  type PackageLookup,
} from '../registry/registry-client.js';
import type { ScannedDependency, ScannedProject } from '../scanner/scan-projects.js';
import { buildMatrix } from './build-matrix.js';

const ADVISORY: Advisory = {
  id: 1,
  title: 'Command Injection in lodash',
  url: 'https://github.com/advisories/x',
  severity: 'high',
  vulnerableVersions: '<4.17.21',
};

function dep(name: string, installed: string, member: string): ScannedDependency {
  return { name, declared: `^${installed}`, installed, depType: 'dependencies', member };
}

function monorepo(dependencies: ScannedDependency[]): ScannedProject {
  return {
    id: 'm',
    name: 'mono',
    path: '/work/mono',
    manager: 'pnpm',
    workspacePackages: 3,
    dependencies,
  };
}

function build(project: ScannedProject) {
  const packages = new Map<string, PackageLookup>([
    ['react', { status: 'ok', info: { name: 'react', latest: '19.1.0', deprecated: null } }],
    ['lodash', { status: 'ok', info: { name: 'lodash', latest: '4.18.1', deprecated: null } }],
  ]);
  const advisories: AdvisoryLookup = {
    byVersion: new Map([
      [versionKey('lodash', '4.17.20'), [ADVISORY]],
      [versionKey('lodash', '4.18.1'), []],
      [versionKey('react', '18.3.1'), []],
      [versionKey('react', '17.0.2'), []],
    ]),
    failed: new Set(),
  };
  return buildMatrix({ projects: [project], packages, advisories, scannedAt: new Date(0) });
}

describe('buildMatrix, monorepos', () => {
  it('keeps the monorepo as one project and says how many packages it brings together', () => {
    const matrix = build(monorepo([dep('react', '18.3.1', 'web')]));
    expect(matrix.projects).toEqual([
      { id: 'm', name: 'mono', path: '/work/mono', manager: 'pnpm', workspacePackages: 3 },
    ]);
  });

  it('shows the most at-risk version first: a vulnerability beats being further behind', () => {
    const matrix = build(
      monorepo([dep('lodash', '4.18.1', 'web'), dep('lodash', '4.17.20', 'server')]),
    );
    const cell = matrix.rows[0]?.cells['m'];
    expect(cell?.installed).toBe('4.17.20');
    expect(cell?.vulnerability).toMatchObject({ severity: 'high' });
    expect(cell?.variants).toEqual([
      { member: 'web', declared: '^4.18.1', installed: '4.18.1' },
      { member: 'server', declared: '^4.17.20', installed: '4.17.20' },
    ]);
    // The row's advisories include every installed version inside the monorepo.
    expect(matrix.rows[0]?.advisories.map((a) => a.id)).toEqual([1]);
  });

  it('then the oldest version, when the risk is the same', () => {
    const matrix = build(
      monorepo([dep('react', '18.3.1', 'web'), dep('react', '17.0.2', 'admin')]),
    );
    expect(matrix.rows[0]?.cells['m']?.installed).toBe('17.0.2');
    expect(matrix.rows[0]?.cells['m']?.variants).toHaveLength(2);
  });

  it('lists no variants when every package uses the same version', () => {
    const matrix = build(
      monorepo([dep('react', '18.3.1', 'web'), dep('react', '18.3.1', 'admin')]),
    );
    expect(matrix.rows[0]?.cells['m']?.variants).toBeUndefined();
  });
});
