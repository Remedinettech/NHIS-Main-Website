import { API_BASE_URL } from '../config/api';

export type ApiFailureKind = 'network' | 'http' | 'invalid-response';

/** Failure of a request to nhis-api. The UI turns this into a localized message. */
export class ApiRequestError extends Error {
  readonly kind: ApiFailureKind;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: ApiFailureKind, message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody { error?: { code?: string; message?: string } }

/** Per-request options. `credentials` is only set by the preview requests, which carry the administrator's session cookie. */
export interface RequestOptions {
  credentials?: RequestCredentials;
  /** How long a `getCached` response is reused (default: CACHE_TTL_MS). */
  ttlMs?: number;
}

export async function get<T>(path: string, signal?: AbortSignal, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { signal, headers: { Accept: 'application/json' }, credentials: options.credentials });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiRequestError('network', 'The API could not be reached');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiRequestError('http', body?.error?.message || `Request failed (${response.status})`, response.status, body?.error?.code);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiRequestError('invalid-response', 'The API returned an unreadable response', response.status);
  }
}

/**
 * Remembers successful responses for read-only snapshot endpoints so that pages sharing data
 * (site settings, document registry) do not refetch. Failures are never cached, so "Try again" works.
 * Entries expire so content published in the administration appears without a full page reload.
 */
const CACHE_TTL_MS = 30_000;

/**
 * How long the content that visitors see changing (site content, documents, announcements, gallery, pages, contacts) is
 * reused. An open tab asks again when the visitor comes back to it (utils/refocus.ts), so what it shows is never older
 * than this at that moment, while repeated switching between tabs makes at most one request per endpoint in this time.
 */
export const REVALIDATE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; request: Promise<unknown> }>();

export function getCached<T>(path: string, signal?: AbortSignal, options: RequestOptions = {}): Promise<T> {
  // Requests with credentials (preview) live under their own key, so a preview response is never served to a public request.
  const key = options.credentials ? `${options.credentials}:${path}` : path;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (options.ttlMs ?? CACHE_TTL_MS)) return hit.request as Promise<T>;
  // The shared request must not be cancelled by one consumer, so it runs without the caller's signal.
  const request = get<T>(path, undefined, options).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { at: Date.now(), request });
  return signal ? withAbort(request, signal) : request;
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

export function clearApiCache(): void { cache.clear(); }
