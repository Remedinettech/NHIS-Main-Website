import type { AdminRole } from '@nhis/shared-types';
import { adminConfig } from './config';
import { buildClearCookie, readSessionToken } from './cookies';
import { assertCsrf, SAFE_METHODS } from './csrf';
import { getDb } from './db';
import { adminErrorResponse, forbidden, unauthenticated } from './errors';
import { clientIp } from './request';
import { hasCapability, type Capability } from './roles';
import { resolveSession, type SessionData, type SessionUser } from './sessions';

export interface AdminContext {
  request: Request;
  user: SessionUser;
  session: SessionData;
  ip: string | null;
  requestId: string;
}

export interface WithAdminOptions {
  /** Allowed roles. Omit for any signed-in role. */
  roles?: readonly AdminRole[];
  /** Alternative to `roles`: a capability from the role table. */
  capability?: Capability;
  /** Force the CSRF check even for a safe method. Unsafe methods (POST/PUT/PATCH/DELETE) are ALWAYS checked. */
  mutating?: boolean;
}

type RouteCtx<P> = { params: Promise<P> } | undefined;

/**
 * Wraps a route handler for the admin API:
 *  1. session from the HttpOnly cookie only (401 UNAUTHENTICATED; a stale cookie is cleared),
 *  2. role / capability check (403 FORBIDDEN),
 *  3. CSRF for mutating methods (403 CSRF),
 *  4. handler with `{ request, user, session, ip, requestId, params }`,
 *  5. Cache-Control: no-store on every response; any thrown error becomes the AdminApiErrorBody shape.
 */
export function withAdmin<P = Record<string, never>>(
  handler: (ctx: AdminContext & { params: P }) => Promise<Response> | Response,
  options: WithAdminOptions = {},
) {
  return async (request: Request, routeCtx?: RouteCtx<P>): Promise<Response> => {
    const requestId = crypto.randomUUID();
    let staleCookie = false;
    try {
      const config = adminConfig();
      const token = readSessionToken(request, config);
      const resolved = token ? await resolveSession(token, {}, getDb(), config) : null;
      if (!resolved) {
        staleCookie = token !== null;
        throw unauthenticated();
      }
      const { user, session } = resolved;
      if (options.roles && !options.roles.includes(user.role)) throw forbidden();
      if (options.capability && !hasCapability(user.role, options.capability)) throw forbidden();
      if (options.mutating || !SAFE_METHODS.has(request.method.toUpperCase())) assertCsrf(request, session.csrfToken, config);

      const params = (routeCtx ? await routeCtx.params : {}) as P;
      const response = await handler({ request, user, session, ip: clientIp(request, config), requestId, params });
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Request-Id', requestId);
      return response;
    } catch (error) {
      const response = adminErrorResponse(error, requestId);
      if (staleCookie) response.headers.append('Set-Cookie', buildClearCookie());
      return response;
    }
  };
}

/** `Response.json` helper with the no-store header for admin payloads. */
export function adminJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, { status: init.status ?? 200, headers: { 'Cache-Control': 'no-store', ...init.headers } });
}

/** For routes that do not use withAdmin (login, session probe): same error mapping and no-store. */
export async function adminPublicRoute(run: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const response = await run(requestId);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return adminErrorResponse(error, requestId);
  }
}
