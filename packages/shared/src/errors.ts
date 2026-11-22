export const ERROR_CODES = [
  'INVALID_USAGE',
  'INVALID_PACKAGE_NAME',
  'INVALID_VERSION',
  'FORBIDDEN_PATH',
  'FORBIDDEN_REQUEST',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'ROOT_NOT_ALLOWED',
  'ROOT_NOT_FOUND',
  'CONFIRMATION_REQUIRED',
  'PROJECT_NOT_FOUND',
  'PROJECT_BUSY',
  'MAJOR_NOT_CONFIRMED',
  'MANAGER_NOT_SUPPORTED',
  'NOT_UPDATABLE',
  'REGISTRY_UNAVAILABLE',
  'PORT_IN_USE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Base class for every expected, user-facing error.
 * `hint` tells the user what to do next (see engineering-standards.md, "Error messages").
 */
export class DepboardError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;

  constructor(code: ErrorCode, message: string, options?: { hint?: string; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'DepboardError';
    this.code = code;
    this.hint = options?.hint;
  }
}

export interface ErrorResponse {
  error: { code: ErrorCode; message: string };
}
