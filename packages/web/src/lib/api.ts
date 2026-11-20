import {
  TOKEN_HEADER,
  type ErrorCode,
  type ErrorResponse,
  type MatrixResponse,
  type ProjectsResponse,
} from '@depboard/shared';

const TOKEN_KEY = 'depboard.token';

/**
 * Reads the session token from the launch URL (`/?token=…`), keeps it for this tab only
 * (so a reload still works), and removes it from the address bar right away
 * (docs/agent/security.md: it must not linger in history or screenshots).
 */
export function takeToken(win: Window = window): string | null {
  const url = new URL(win.location.href);
  const fromUrl = url.searchParams.get('token');
  if (fromUrl !== null) {
    url.searchParams.delete('token');
    win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
    try {
      win.sessionStorage.setItem(TOKEN_KEY, fromUrl);
    } catch {
      // Storage can be blocked; the token still works for this page load.
    }
    return fromUrl;
  }
  try {
    return win.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export type ApiErrorKind = 'unauthorized' | 'offline' | 'server';

/** An API failure the UI can explain: what happened and what to do next. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: ErrorCode | null;

  constructor(kind: ApiErrorKind, message: string, code: ErrorCode | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
  }
}

export interface ApiClient {
  getProjects: () => Promise<ProjectsResponse>;
  getMatrix: () => Promise<MatrixResponse>;
  rescan: () => Promise<MatrixResponse>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Every network call goes through here, so the token is attached in exactly one place. */
export function createApiClient(token: string | null, fetchImpl: FetchLike = fetch): ApiClient {
  async function request<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
    if (token === null) throw new ApiError('unauthorized', 'No session token.');
    let response: Response;
    try {
      response = await fetchImpl(path, {
        method,
        headers: { [TOKEN_HEADER]: token, accept: 'application/json' },
        cache: 'no-store',
      });
    } catch {
      throw new ApiError('offline', 'The DepBoard server could not be reached.');
    }
    if (response.ok) return (await response.json()) as T;

    let body: ErrorResponse | null = null;
    try {
      body = (await response.json()) as ErrorResponse;
    } catch {
      // Not our JSON error shape (e.g. a proxy page): fall back to a generic message.
    }
    throw new ApiError(
      response.status === 401 ? 'unauthorized' : 'server',
      body?.error.message ?? `The server answered ${String(response.status)}.`,
      body?.error.code ?? null,
    );
  }

  return {
    getProjects: () => request<ProjectsResponse>('/api/projects'),
    getMatrix: () => request<MatrixResponse>('/api/matrix'),
    rescan: () => request<MatrixResponse>('/api/rescan', 'POST'),
  };
}
