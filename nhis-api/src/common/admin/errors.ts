import type { AdminApiErrorBody, AdminFieldError } from '@nhis/shared-types';
import { ApiError } from '../utils/errors';

export type AdminErrorCode = AdminApiErrorBody['error']['code'];

const STATUS: Record<AdminErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CSRF: 403,
  INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNSUPPORTED_FILE: 415,
  FILE_TOO_LARGE: 413,
  REFERENCED: 409,
  LAST_ADMIN: 409,
  INVALID_STATE: 409,
  INTERNAL_ERROR: 500,
};

export interface AdminErrorExtras {
  details?: AdminFieldError[];
  retryAfterSeconds?: number;
  current?: unknown;
}

/** Thrown by admin services; converted to AdminApiErrorBody by `adminErrorResponse`. */
export class AdminHttpError extends Error {
  readonly status: number;
  constructor(readonly code: AdminErrorCode, message: string, readonly extras: AdminErrorExtras = {}) {
    super(message);
    this.name = 'AdminHttpError';
    this.status = STATUS[code];
  }
}

export const unauthenticated = (message = 'Authentication required') => new AdminHttpError('UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to perform this action') => new AdminHttpError('FORBIDDEN', message);
export const invalid = (message: string, details?: AdminFieldError[]) => new AdminHttpError('INVALID', message, { details });
export const notFound = (message = 'Record not found') => new AdminHttpError('NOT_FOUND', message);
export const conflict = (message: string, current?: unknown) => new AdminHttpError('CONFLICT', message, { current });
export const invalidState = (message: string) => new AdminHttpError('INVALID_STATE', message);

export function errorBody(error: AdminHttpError): AdminApiErrorBody {
  const { details, retryAfterSeconds, current } = error.extras;
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(details && details.length > 0 ? { details } : {}),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      ...(current !== undefined ? { current } : {}),
    },
  };
}

/** Maps anything thrown to a safe JSON response. Unknown errors become a generic 500 and are never echoed. */
export function adminErrorResponse(error: unknown, requestId?: string): Response {
  let admin: AdminHttpError;
  if (error instanceof AdminHttpError) {
    admin = error;
  } else if (error instanceof ApiError) {
    if (error.status === 400) admin = invalid(error.message);
    else if (error.status === 404) admin = notFound(error.message);
    else admin = new AdminHttpError('INTERNAL_ERROR', 'Internal server error');
  } else if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2034') {
    admin = conflict('The record was modified at the same time. Please retry.');
  } else {
    // Server-side log without message/stack (they could contain SQL or values); the client gets a generic message.
    const name = error instanceof Error ? error.name : typeof error;
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    console.error('Unhandled admin API error', name, typeof code === 'string' ? code : '', requestId ?? '');
    admin = new AdminHttpError('INTERNAL_ERROR', 'Internal server error');
  }
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (admin.extras.retryAfterSeconds !== undefined) headers['Retry-After'] = String(admin.extras.retryAfterSeconds);
  if (requestId) headers['X-Request-Id'] = requestId;
  return Response.json(errorBody(admin), { status: admin.status, headers });
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}
