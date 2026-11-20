import {
  TOKEN_HEADER,
  type ErrorCode,
  type ErrorResponse,
  type Job,
  type JobEvent,
  type MatrixResponse,
  type ProjectsResponse,
  type UpdateAccepted,
  type UpdatePreview,
  type UpdateRequest,
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
  previewUpdate: (request: UpdateRequest) => Promise<UpdatePreview>;
  startUpdate: (request: UpdateRequest) => Promise<UpdateAccepted>;
  listJobs: () => Promise<{ jobs: Job[] }>;
  /** Follows a job's output until it ends (or `signal` aborts). */
  streamJob: (
    jobId: string,
    onEvent: (event: JobEvent) => void,
    signal?: AbortSignal,
  ) => Promise<void>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Every network call goes through here, so the token is attached in exactly one place. */
export function createApiClient(token: string | null, fetchImpl: FetchLike = fetch): ApiClient {
  async function send(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    if (token === null) throw new ApiError('unauthorized', 'No session token.');
    let response: Response;
    try {
      response = await fetchImpl(path, {
        method,
        headers: {
          [TOKEN_HEADER]: token,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(signal ? { signal } : {}),
        cache: 'no-store',
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError('offline', 'The DepBoard server could not be reached.');
    }
    if (response.ok) return response;

    let failure: ErrorResponse | null = null;
    try {
      failure = (await response.json()) as ErrorResponse;
    } catch {
      // Not our JSON error shape (e.g. a proxy page): fall back to a generic message.
    }
    throw new ApiError(
      response.status === 401 ? 'unauthorized' : 'server',
      failure?.error.message ?? `The server answered ${String(response.status)}.`,
      failure?.error.code ?? null,
    );
  }

  async function request<T>(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
  ): Promise<T> {
    return (await (await send(path, method, body)).json()) as T;
  }

  async function streamJob(
    jobId: string,
    onEvent: (event: JobEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await send(
      `/api/jobs/${encodeURIComponent(jobId)}/stream`,
      'GET',
      undefined,
      signal,
    );
    if (!response.body) return;
    // NDJSON: one event per line, possibly split across chunks.
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += value;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) if (line.trim() !== '') onEvent(JSON.parse(line) as JobEvent);
    }
    if (buffered.trim() !== '') onEvent(JSON.parse(buffered) as JobEvent);
  }

  return {
    getProjects: () => request<ProjectsResponse>('/api/projects'),
    getMatrix: () => request<MatrixResponse>('/api/matrix'),
    rescan: () => request<MatrixResponse>('/api/rescan', 'POST'),
    previewUpdate: (r) => request<UpdatePreview>('/api/update', 'POST', { ...r, dryRun: true }),
    startUpdate: (r) => request<UpdateAccepted>('/api/update', 'POST', { ...r, dryRun: false }),
    listJobs: () => request<{ jobs: Job[] }>('/api/jobs'),
    streamJob,
  };
}
