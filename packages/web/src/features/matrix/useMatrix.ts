import { useCallback, useEffect, useState } from 'react';
import type { MatrixResponse, ProjectsResponse } from '@depboard/shared';
import { ApiError, type ApiClient } from '../../lib/api.js';
import { t } from '../../lib/i18n.js';

export interface MatrixData {
  matrix: MatrixResponse;
  projects: ProjectsResponse;
}

export type MatrixState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: MatrixData };

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError('server', error instanceof Error ? error.message : String(error));
}

/**
 * Loads the matrix and project list once, and rescans on demand. A failed rescan keeps the
 * matrix on screen and reports the error separately, so the user never loses what they had.
 */
export function useMatrix(api: ApiClient) {
  const [state, setState] = useState<MatrixState>({ status: 'loading' });
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<ApiError | null>(null);

  const fetchAll = useCallback(() => {
    Promise.all([api.getMatrix(), api.getProjects()]).then(
      ([matrix, projects]) => {
        setState({ status: 'ready', data: { matrix, projects } });
      },
      (error: unknown) => {
        setState({ status: 'error', error: asApiError(error) });
      },
    );
  }, [api]);

  // The first load: state already starts as "loading".
  useEffect(fetchAll, [fetchAll]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    fetchAll();
  }, [fetchAll]);

  const rescan = useCallback(() => {
    setRescanning(true);
    setRescanError(null);
    api
      .rescan()
      .then(async (matrix) => {
        const projects = await api.getProjects();
        setState({ status: 'ready', data: { matrix, projects } });
      })
      .catch((error: unknown) => {
        setRescanError(asApiError(error));
      })
      .finally(() => {
        setRescanning(false);
      });
  }, [api]);

  // After an update the server already rescanned: just read the fresh result, keeping the screen.
  const refresh = useCallback(() => {
    Promise.all([api.getMatrix(), api.getProjects()]).then(
      ([matrix, projects]) => {
        setState({ status: 'ready', data: { matrix, projects } });
      },
      () => {
        setRescanError(new ApiError('server', t('alert.refreshFailed')));
      },
    );
  }, [api]);

  return { state, reload, rescan, refresh, rescanning, rescanError };
}
