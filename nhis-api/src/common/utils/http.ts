import crypto from 'node:crypto';
import { errorResponse } from './errors';

/**
 * Public GET responses are served with `Cache-Control: no-cache` and a strong ETag: browsers and proxies must
 * revalidate on every request, so a publish in the admin is visible immediately, while unchanged content costs
 * only a 304. Error responses are `no-store` (see errors.ts).
 */
export const PUBLIC_CACHE_CONTROL = 'no-cache';

/** Strong validator derived from the exact response bytes. */
export function strongEtag(body: string | Uint8Array): string {
  return `"${crypto.createHash('sha256').update(body).digest('base64url').slice(0, 32)}"`;
}

/** True when `If-None-Match` matches the ETag (list form, weak prefix and `*` are honoured for GET). */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//, ''))
    .includes(etag);
}

/** 304 Not Modified carrying the validators. */
export function notModified(etag: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': PUBLIC_CACHE_CONTROL, ...extraHeaders } });
}

/** JSON 200 for public data with `no-cache` + strong ETag; answers 304 when the request is already current. */
export function okJson(payload: unknown, request?: Request): Response {
  const text = JSON.stringify(payload);
  const etag = strongEtag(text);
  if (request && etagMatches(request.headers.get('if-none-match'), etag)) return notModified(etag);
  return new Response(text, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': PUBLIC_CACHE_CONTROL, ETag: etag },
  });
}

/** Runs a service call and converts the result / any thrown error into a Response. Pass the request to enable 304s. */
export async function handle<T>(run: () => T | Promise<T>, request?: Request): Promise<Response> {
  try {
    return okJson(await run(), request);
  } catch (error) {
    return errorResponse(error);
  }
}
