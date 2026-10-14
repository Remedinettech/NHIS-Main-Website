import type { AdminApiErrorBody, AdminFieldError } from '@nhis/shared-types';

export type ApiFailureKind = 'network' | 'http' | 'invalid-response';
export type ApiErrorCode = AdminApiErrorBody['error']['code'];

/** Failure of a request to nhis-api (admin or public). The UI maps it to a plain-language message. */
export class ApiError extends Error {
  readonly kind: ApiFailureKind;
  readonly status?: number;
  readonly code?: ApiErrorCode | string;
  readonly details: AdminFieldError[];
  readonly retryAfterSeconds?: number;
  /** Latest record sent with a 409 CONFLICT so the UI can offer to reload it. */
  readonly current?: unknown;

  constructor(kind: ApiFailureKind, message: string, extra: {
    status?: number; code?: string; details?: AdminFieldError[]; retryAfterSeconds?: number; current?: unknown;
  } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = extra.status;
    this.code = extra.code;
    this.details = extra.details ?? [];
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.current = extra.current;
  }

  get isConflict(): boolean { return this.code === 'CONFLICT'; }
  get isUnauthenticated(): boolean { return this.status === 401; }

  /** Field errors keyed by field name (the first message per field wins). */
  get fieldErrors(): Record<string, string> { return fieldErrorMap(this.details); }
}

/** Kept for existing imports. */
export const ApiRequestError = ApiError;

export function fieldErrorMap(details: readonly AdminFieldError[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of details ?? []) {
    const key = normaliseFieldPath(item.field);
    if (!(key in map)) map[key] = item.message;
  }
  return map;
}

/** `values.helplines[0].number` and `helplines.0.number` both become `helplines.0.number`. */
export function normaliseFieldPath(field: string): string {
  return field.replace(/^values\./, '').replace(/\[(\d+)\]/g, '.$1');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Builds an ApiError from a failed response. Tolerates bodies that are not the standard error shape. */
export function parseErrorResponse(status: number, body: unknown, retryAfterHeader?: string | null): ApiError {
  const raw = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const message = raw && typeof raw.message === 'string' && raw.message ? raw.message : `Request failed (${status})`;
  const code = raw && typeof raw.code === 'string' ? raw.code : undefined;
  const details: AdminFieldError[] = [];
  if (raw && Array.isArray(raw.details)) {
    for (const item of raw.details) {
      if (isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string') details.push({ field: item.field, message: item.message });
    }
  }
  let retryAfterSeconds: number | undefined;
  if (raw && typeof raw.retryAfterSeconds === 'number' && Number.isFinite(raw.retryAfterSeconds)) retryAfterSeconds = raw.retryAfterSeconds;
  else if (retryAfterHeader && /^\d+$/.test(retryAfterHeader.trim())) retryAfterSeconds = Number(retryAfterHeader.trim());
  return new ApiError('http', message, { status, code, details, retryAfterSeconds, current: raw?.current });
}

export interface RequestOptions {
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Do not treat a 401 as an expired session (used by sign-in, where 401 means wrong credentials). */
  skipUnauthenticatedHandler?: boolean;
}

export interface ClientConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Returns the current CSRF token (kept in memory only). */
  getCsrfToken?: () => string | undefined;
  /** Called when any request (except those that opt out) answers 401. */
  onUnauthenticated?: (error: ApiError) => void;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export interface ApiClient {
  getJson<T>(path: string, options?: RequestOptions): Promise<T>;
  postJson<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  putJson<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  deleteJson<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  /** Multipart upload. The browser sets the content type (with the boundary), so none is forced here. */
  upload<T>(path: string, form: FormData, options?: RequestOptions): Promise<T>;
  configure(next: Partial<Pick<ClientConfig, 'getCsrfToken' | 'onUnauthenticated'>>): void;
}

/**
 * Admin/public API client. Cookies travel with `credentials: 'same-origin'` (the dev proxy makes /api same-origin);
 * the CSRF token is added to every mutating request. Mutations are never retried.
 */
export function createApiClient(initial: ClientConfig): ApiClient {
  const config: ClientConfig = { ...initial };

  async function request<T>(method: string, path: string, body: unknown, options: RequestOptions = {}, form?: FormData): Promise<T> {
    const doFetch = config.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
    const headers: Record<string, string> = { Accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    if (MUTATING.has(method)) {
      const token = config.getCsrfToken?.();
      if (token) headers['X-CSRF-Token'] = token;
    }
    let response: Response;
    try {
      response = await doFetch(`${config.baseUrl}${path}${buildQuery(options.query)}`, {
        method, headers, body: payload, signal: options.signal, credentials: 'same-origin', cache: 'no-store',
      });
    } catch (cause) {
      if (options.signal?.aborted) throw cause;
      throw new ApiError('network', 'The server could not be reached');
    }
    if (!response.ok) {
      const parsed = (await response.json().catch(() => null)) as unknown;
      const error = parseErrorResponse(response.status, parsed, response.headers.get('Retry-After'));
      if (response.status === 401 && !options.skipUnauthenticatedHandler) config.onUnauthenticated?.(error);
      throw error;
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text().catch(() => '');
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('invalid-response', 'The server returned an unreadable response', { status: response.status });
    }
  }

  return {
    getJson: (path, options) => request('GET', path, undefined, options),
    postJson: (path, body, options) => request('POST', path, body ?? {}, options),
    putJson: (path, body, options) => request('PUT', path, body ?? {}, options),
    deleteJson: (path, body, options) => request('DELETE', path, body, options),
    upload: (path, form, options) => request('POST', path, undefined, options, form),
    configure: (next) => { Object.assign(config, next); },
  };
}
