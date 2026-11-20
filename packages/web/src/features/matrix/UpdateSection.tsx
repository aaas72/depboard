import { useEffect, useState } from 'react';
import type { MatrixCell, MatrixRow, Project, UpdatePreview } from '@depboard/shared';
import { Button } from '../../components/ui/Button.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { CopyCommand } from '../../components/ui/CopyCommand.js';
import type { ApiClient } from '../../lib/api.js';
import { t } from '../../lib/i18n.js';
import type { Activity } from '../activity/useActivity.js';

/** What users of other package managers can run themselves until DepBoard updates them (Phase 2). */
function manualCommand(manager: Project['manager'], name: string, version: string, dev: boolean) {
  const spec = `${name}@${version}`;
  const add = { npm: 'npm install', pnpm: 'pnpm add', yarn: 'yarn add', bun: 'bun add' }[manager];
  return `${add} ${spec}${dev ? ' -D' : ''}`;
}

export function canUpdate(row: MatrixRow, cell: MatrixCell): boolean {
  return (
    row.lookup === 'ok' &&
    row.latest !== null &&
    (cell.updateType === 'patch' ||
      cell.updateType === 'minor' ||
      cell.updateType === 'major' ||
      cell.updateType === 'prerelease')
  );
}

export interface UpdateSectionProps {
  row: MatrixRow;
  cell: MatrixCell;
  project: Project;
  api: ApiClient;
  activity: Activity;
}

/**
 * Updating one package in one project. The exact command is always on screen before it runs;
 * a major update asks again in a dialog (ui-ux.md, binding decision 1).
 */
export function UpdateSection({ row, cell, project, api, activity }: UpdateSectionProps) {
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const latest = row.latest ?? '';
  const supported = project.manager === 'npm';

  // Ask the server for the exact command it would run. Nothing runs here.
  useEffect(() => {
    if (!supported) return;
    let current = true;
    api.previewUpdate({ package: row.name, version: latest, projectIds: [project.id] }).then(
      (result) => {
        if (current) setPreview(result);
      },
      (failure: unknown) => {
        if (current) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      current = false;
    };
  }, [api, row.name, latest, project.id, supported, cell.version]);

  if (!supported) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-text-muted">{t('update.unsupported', { manager: project.manager })}</p>
        <CopyCommand
          command={manualCommand(
            project.manager,
            row.name,
            latest,
            cell.depType === 'devDependencies',
          )}
        />
      </div>
    );
  }

  const busy = activity.isBusy(project.id);
  const command = preview?.commands[0]?.display;
  const major = preview?.updateType === 'major';

  const run = (confirmMajor: boolean) => {
    setConfirming(false);
    setStarting(true);
    setError(null);
    activity
      .start({ package: row.name, version: latest, projectIds: [project.id], confirmMajor })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        setStarting(false);
      });
  };

  return (
    <div className="space-y-2">
      {command !== undefined && (
        <div className="text-sm">
          <p className="mb-1 text-text-muted">{t('update.willRun')}</p>
          <code className="block rounded-md bg-surface-sunken px-2 py-1.5 font-mono text-xs break-all">
            {command}
          </code>
        </div>
      )}
      <Button
        variant={major ? 'warning' : 'primary'}
        disabled={preview === null || busy || starting}
        onClick={() => {
          if (major) setConfirming(true);
          else run(false);
        }}
      >
        {busy || starting
          ? t('update.running')
          : t(major ? 'update.buttonMajor' : 'update.button', { version: latest })}
      </Button>
      {error !== null && (
        <p role="alert" className="text-sm text-warning">
          {error}
        </p>
      )}

      {confirming && command !== undefined && (
        <ConfirmDialog
          title={t('update.confirmTitle', {
            name: row.name,
            from: cell.version ?? cell.declared,
            to: latest,
          })}
          confirmLabel={t('update.confirm')}
          cancelLabel={t('update.cancel')}
          onConfirm={() => {
            run(true);
          }}
          onCancel={() => {
            setConfirming(false);
          }}
        >
          <p>{t('update.confirmBody', { project: project.name })}</p>
          <code className="block rounded-md bg-surface-sunken px-2 py-1.5 font-mono text-xs break-all">
            {command}
          </code>
          <p>
            <a
              href={`https://www.npmjs.com/package/${row.name}?activeTab=versions`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline"
            >
              {t('update.whatsNew')} ↗
            </a>
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
