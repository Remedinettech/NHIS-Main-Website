import { adminConfig, normalizeOrigin, type AdminConfig } from './config';
import { AdminHttpError } from './errors';
import { safeEqual } from './tokens';

export const CSRF_HEADER = 'x-csrf-token';
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Origin (or, failing that, Referer) check. `requirePresent` is used by login, which must come from an allowed origin. */
export function assertAllowedOrigin(request: Request, config: AdminConfig = adminConfig(), requirePresent = false): void {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  let candidate: string | null = null;
  if (origin !== null) {
    candidate = normalizeOrigin(origin);
  } else if (referer !== null) {
    candidate = normalizeOrigin(referer);
  } else if (requirePresent) {
    throw new AdminHttpError('CSRF', 'A valid Origin header is required.');
  } else {
    return;
  }
  if (candidate === null || !config.allowedOrigins.includes(candidate)) {
    throw new AdminHttpError('CSRF', 'Request origin is not allowed.');
  }
}

/** Mutating requests: X-CSRF-Token must equal the session's token (constant time) and the origin must be allowed. */
export function assertCsrf(request: Request, sessionCsrfToken: string, config: AdminConfig = adminConfig()): void {
  assertAllowedOrigin(request, config);
  const supplied = request.headers.get(CSRF_HEADER);
  if (!supplied || !safeEqual(supplied, sessionCsrfToken)) {
    throw new AdminHttpError('CSRF', 'Missing or invalid CSRF token.');
  }
}
