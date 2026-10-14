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

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { signal, headers: { Accept: 'application/json' } });
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
 */
/** Entries expire so content published in the administration appears without a full page reload. */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; request: Promise<unknown> }>();

export function getCached<T>(path: string, signal?: AbortSignal): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.request as Promise<T>;
  // The shared request must not be cancelled by one consumer, so it runs without the caller's signal.
  const request = get<T>(path).catch((error: unknown) => {
    cache.delete(path);
    throw error;
  });
  cache.set(path, { at: Date.now(), request });
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
