import {
  describeInsightText,
  type Insight,
  type Matrix,
  type MatrixCell,
  type MatrixRow,
  type Project,
  type Severity,
} from '@depboard/shared';
import { displayPath, type AnalyzeResult } from '@depboard/server';

export interface JsonReport {
  schemaVersion: 1;
  scannedAt: string;
  roots: string[];
  summary: {
    projects: number;
    packages: number;
    outdated: { total: number; major: number; minor: number; patch: number };
    vulnerable: number;
  };
  findings: {
    kind: Insight['kind'];
    package: string;
    related: string[];
    message: string;
    projects: string[];
  }[];
  projects: {
    id: string;
    name: string;
    path: string;
    manager: Project['manager'];
    workspacePackages?: number;
  }[];
  packages: {
    name: string;
    latest: string | null;
    lookup: MatrixRow['lookup'];
    projects: Record<
      string,
      {
        declared: string;
        installed: string | null;
        version: string | null;
        versionSource: MatrixCell['versionSource'];
        updateType: MatrixCell['updateType'];
        depType: MatrixCell['depType'];
        vulnerability: { severity: Severity; count: number } | null | 'unknown';
      }
    >;
  }[];
  warnings: {
    skippedFiles: { path: string; reason: string }[];
    failedLookups: string[];
    advisoriesIncomplete: boolean;
  };
}

export function countMatrixSummary(matrix: Matrix) {
  const outdated = { major: 0, minor: 0, patch: 0 };
  let vulnerable = 0;
  let estimated = 0;
  for (const row of matrix.rows) {
    const cells = Object.values(row.cells);
    const types = new Set(cells.map((c) => c.updateType));
    if (types.has('major')) outdated.major++;
    else if (types.has('minor')) outdated.minor++;
    else if (types.has('patch')) outdated.patch++;
    if (cells.some((c) => c.vulnerability !== null && c.vulnerability !== 'unknown')) vulnerable++;
    estimated += cells.filter((c) => c.versionSource === 'declared' && row.lookup === 'ok').length;
  }
  return {
    outdated: {
      total: outdated.major + outdated.minor + outdated.patch,
      ...outdated,
    },
    vulnerable,
    estimated,
  };
}

export function buildJsonReport(
  result: AnalyzeResult,
  roots: readonly string[],
  homedir: string,
): JsonReport {
  const { matrix } = result;
  const projectName = new Map(matrix.projects.map((p) => [p.id, p.name]));
  const counts = countMatrixSummary(matrix);

  return {
    schemaVersion: 1,
    scannedAt: matrix.scannedAt,
    roots: roots.map((r) => displayPath(r, homedir)),
    summary: {
      projects: matrix.projects.length,
      packages: matrix.rows.length,
      outdated: counts.outdated,
      vulnerable: counts.vulnerable,
    },
    findings: matrix.insights.map((insight) => ({
      kind: insight.kind,
      package: insight.package,
      related: insight.related,
      message: describeInsightText(insight),
      projects: insight.projectIds.map((id) => projectName.get(id) ?? id),
    })),
    projects: matrix.projects.map((p) => ({
      id: p.id,
      name: p.name,
      path: displayPath(p.path, homedir),
      manager: p.manager,
      ...(p.workspacePackages === undefined ? {} : { workspacePackages: p.workspacePackages }),
    })),
    packages: matrix.rows.map((row) => ({
      name: row.name,
      latest: row.latest,
      lookup: row.lookup,
      projects: Object.fromEntries(
        Object.entries(row.cells).map(([projectId, cell]) => [
          projectId,
          {
            declared: cell.declared,
            installed: cell.installed,
            version: cell.version,
            versionSource: cell.versionSource,
            updateType: cell.updateType,
            depType: cell.depType,
            vulnerability:
              cell.vulnerability === null || cell.vulnerability === 'unknown'
                ? cell.vulnerability
                : { severity: cell.vulnerability.severity, count: cell.vulnerability.count },
          },
        ]),
      ),
    })),
    warnings: {
      skippedFiles: result.issues.map((issue) => ({
        path: displayPath(issue.path, homedir),
        reason: issue.reason,
      })),
      failedLookups: [...result.failedLookups],
      advisoriesIncomplete: result.advisoriesIncomplete,
    },
  };
}
