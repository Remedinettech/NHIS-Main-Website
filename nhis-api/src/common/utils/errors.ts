/**
 * Error contract shared by services and route handlers.
 *
 * Services throw `ApiError` subclasses; route handlers convert anything thrown into a JSON response with
 * `errorResponse`. Unknown errors become a generic 500 and never leak messages or stack traces.
 */
export type ErrorCode = 'INVALID_QUERY' | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'NOT_IMPLEMENTED' | 'UNAVAILABLE' | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 INVALID_QUERY */
export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, 'INVALID_QUERY', message);
  }
}

/** 404 NOT_FOUND */
export class NotFoundError extends ApiError {
  constructor(message = 'Record not found') {
    super(404, 'NOT_FOUND', message);
  }
}

/** 501 NOT_IMPLEMENTED */
export class NotImplementedError extends ApiError {
  constructor(message: string) {
    super(501, 'NOT_IMPLEMENTED', message);
  }
}

/** 503 UNAVAILABLE (the database or another dependency cannot be reached; there is no JSON fallback). */
export class UnavailableError extends ApiError {
  constructor(message = 'The service is temporarily unavailable') {
    super(503, 'UNAVAILABLE', message);
  }
}

const body = (code: ErrorCode, message: string) => ({ error: { code, message } });

/** Error responses are never cacheable. */
const ERROR_HEADERS = { 'Cache-Control': 'no-store' } as const;
const errorJson = (code: ErrorCode, message: string, status: number, headers: Record<string, string> = {}) =>
  Response.json(body(code, message), { status, headers: { ...ERROR_HEADERS, ...headers } });

const UNREACHABLE_PRISMA_CODES = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1010', 'P1011', 'P1017', 'P2024']);

/**
 * True when the error means the database cannot be used (connection refused, timeout, authentication failure,
 * pool exhausted, engine crash). Detected by name/code so this module does not import the Prisma client.
 */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  if (name === 'PrismaClientInitializationError' || name === 'PrismaClientRustPanicError') return true;
  if (name === 'PrismaClientKnownRequestError') {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && UNREACHABLE_PRISMA_CODES.has(code);
  }
  return false;
}

export function badRequest(message: string) {
  return errorJson('INVALID_QUERY', message, 400);
}

export function notFound(message = 'Record not found') {
  return errorJson('NOT_FOUND', message, 404);
}

export function serverError() {
  return errorJson('INTERNAL_ERROR', 'Internal server error', 500);
}

export function methodNotAllowed(allowed: readonly string[]) {
  return errorJson('METHOD_NOT_ALLOWED', 'Method not allowed', 405, { Allow: allowed.join(', ') });
}

export function notImplemented(message: string) {
  return errorJson('NOT_IMPLEMENTED', message, 501);
}

/** Maps anything thrown by a service to a safe JSON error response. */
export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return errorJson(error.code, error.message, error.status);
  if (isDatabaseUnavailableError(error)) {
    console.error('Database unavailable', (error as { name?: string; code?: string }).name, (error as { code?: string }).code ?? '');
    return errorJson('UNAVAILABLE', 'The service is temporarily unavailable', 503);
  }
  // Log server-side only; the client receives a generic message.
  console.error('Unhandled API error', error instanceof Error ? error.name : typeof error);
  return serverError();
}
