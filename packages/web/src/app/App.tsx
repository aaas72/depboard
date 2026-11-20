import { useMemo, type ReactNode } from 'react';
import { createApiClient, takeToken, type ApiClient } from '../lib/api.js';
import { Button } from '../components/ui/Button.js';
import { t } from '../lib/i18n.js';
import { MatrixScreen } from '../features/matrix/MatrixScreen.js';
import { useMatrix } from '../features/matrix/useMatrix.js';

export interface AppProps {
  /** Injected in tests. In the browser, built from the launch URL's token. */
  api?: ApiClient;
}

function Centered({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <main className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      {body !== undefined && <p className="text-sm text-text-muted">{body}</p>}
      {action}
    </main>
  );
}

/** Opens directly on the matrix (docs/agent/ui-ux.md): no welcome page in front of it. */
export function App({ api: injected }: AppProps) {
  const api = useMemo(() => injected ?? createApiClient(takeToken()), [injected]);
  const { state, reload, rescan, rescanning, rescanError } = useMatrix(api);

  if (state.status === 'loading') {
    return (
      <main className="flex h-full items-center justify-center" aria-busy="true">
        <p role="status" className="text-sm text-text-muted">
          {t('state.loading')}
        </p>
      </main>
    );
  }

  if (state.status === 'error') {
    const { error } = state;
    if (error.kind === 'unauthorized') {
      return <Centered title={t('state.unauthorized.title')} body={t('state.unauthorized.body')} />;
    }
    const retry = (
      <Button variant="primary" onClick={reload}>
        {t('action.retry')}
      </Button>
    );
    return error.kind === 'offline' ? (
      <Centered title={t('state.offline.title')} body={t('state.offline.body')} action={retry} />
    ) : (
      <Centered title={t('state.error.title')} body={error.message} action={retry} />
    );
  }

  return (
    <main className="h-full">
      <MatrixScreen
        data={state.data}
        rescan={rescan}
        rescanning={rescanning}
        rescanError={rescanError}
      />
    </main>
  );
}
