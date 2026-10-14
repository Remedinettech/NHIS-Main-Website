/**
 * Explicit CORS allowlist for the PUBLIC read API (GET/HEAD under /api/v1, except /api/v1/admin).
 *
 * Configure with PUBLIC_API_ALLOWED_ORIGINS: comma-separated browser origins (scheme://host[:port], no path),
 * e.g. "https://www.tn-nhis.net". Unset/empty means no cross-origin access. Origins are never reflected unless
 * they match the list exactly; "*" is not accepted. Credentials are never allowed (public data needs no cookies),
 * and the admin API never receives CORS headers, so its Origin/CSRF checks are unchanged.
 */
export interface PublicCorsConfig {
  readonly allowedOrigins: ReadonlySet<string>;
}

export const CORS_ALLOWED_METHODS = 'GET, HEAD, OPTIONS';
export const CORS_ALLOWED_HEADERS = 'Accept, Accept-Language, Content-Type, If-None-Match';
export const CORS_EXPOSED_HEADERS = 'ETag';
export const CORS_MAX_AGE_SECONDS = '600';

/** Canonical origin ("scheme://host[:port]") or undefined when the value is not a plain http(s) origin. */
export function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function loadPublicCorsConfig(env: Record<string, string | undefined> = process.env): PublicCorsConfig {
  const origins = new Set<string>();
  for (const raw of (env.PUBLIC_API_ALLOWED_ORIGINS ?? '').split(',')) {
    if (!raw.trim() || raw.trim() === '*') continue;
    const origin = normalizeOrigin(raw);
    if (origin) origins.add(origin);
  }
  return { allowedOrigins: origins };
}

/** Paths that take part in public CORS: /api/v1/**, never /api/v1/admin/**. */
export function isPublicApiPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/v1/') && pathname !== '/api/v1') return false;
  return !(pathname === '/api/v1/admin' || pathname.startsWith('/api/v1/admin/'));
}

/** The request origin when it is on the allowlist (exact, canonical match), otherwise undefined. */
export function allowedOrigin(origin: string | null, config: PublicCorsConfig): string | undefined {
  if (!origin) return undefined;
  const canonical = normalizeOrigin(origin);
  if (!canonical || canonical !== origin.trim()) return undefined;
  return config.allowedOrigins.has(canonical) ? canonical : undefined;
}

/** Appends `Origin` to an existing Vary value without dropping what is already there. */
export function mergeVary(existing: string | null, token = 'Origin'): string {
  const parts = (existing ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.includes('*')) return '*';
  if (!parts.some((p) => p.toLowerCase() === token.toLowerCase())) parts.push(token);
  return parts.join(', ');
}

/** Headers for an actual (non-preflight) response to an allowed origin. */
export function actualResponseHeaders(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': CORS_EXPOSED_HEADERS };
}

/** Headers for a successful preflight. */
export function preflightHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    'Access-Control-Max-Age': CORS_MAX_AGE_SECONDS,
  };
}

/** True when every requested header is on the fixed allowlist (comparison is case-insensitive). */
export function requestedHeadersAllowed(requested: string | null): boolean {
  if (!requested) return true;
  const allowed = new Set(CORS_ALLOWED_HEADERS.toLowerCase().split(',').map((h) => h.trim()));
  return requested.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean).every((h) => allowed.has(h));
}
