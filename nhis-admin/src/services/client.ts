import { API_BASE_URL } from '../config/api';
import { createApiClient } from './http';

/** Admin API (`/api/v1/admin`). AuthProvider wires the CSRF token and the 401 handler. */
export const adminApi = createApiClient({ baseUrl: `${API_BASE_URL}/admin` });

/** Public read-only API (`/api/v1`), used by the existing overview screens. */
const publicApi = createApiClient({ baseUrl: API_BASE_URL });

export const get = <T>(path: string, signal?: AbortSignal): Promise<T> => publicApi.getJson<T>(path, { signal });

/**
 * Remembers successful responses for public read-only endpoints so that pages sharing data
 * do not refetch. Failures are never cached, so "Try again" works.
 */
/** Entries expire quickly so changes published here show up without a reload. */
const CACHE_TTL_MS = 15_000;
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
