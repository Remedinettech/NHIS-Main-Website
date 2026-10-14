import { NextResponse, type NextRequest } from 'next/server';
import {
  actualResponseHeaders, allowedOrigin, isPublicApiPath, loadPublicCorsConfig, mergeVary, preflightHeaders, requestedHeadersAllowed,
} from './common/cors';

/**
 * CORS for the public read API only (see common/cors.ts). Runs for /api/v1/**; /api/v1/admin/** is skipped, so the
 * admin API keeps its own same-origin/CSRF rules and never gets CORS headers. IIS must NOT add CORS headers as well.
 */
export const config = { matcher: '/api/v1/:path*' };

const corsConfig = loadPublicCorsConfig();

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (!isPublicApiPath(pathname)) return NextResponse.next();

  const origin = request.headers.get('origin');
  const allowed = allowedOrigin(origin, corsConfig);

  if (origin !== null && request.method === 'OPTIONS' && request.headers.has('access-control-request-method')) {
    const method = request.headers.get('access-control-request-method')?.toUpperCase();
    const headers = new Headers({ Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers', 'Cache-Control': 'no-store' });
    const permitted = allowed !== undefined && (method === 'GET' || method === 'HEAD')
      && requestedHeadersAllowed(request.headers.get('access-control-request-headers'));
    if (!permitted) return new NextResponse(null, { status: 403, headers });
    for (const [name, value] of Object.entries(preflightHeaders(allowed))) headers.set(name, value);
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  // The response depends on Origin whenever it can carry CORS headers, so caches must key on it (even when this
  // particular request has no Origin or a disallowed one).
  response.headers.set('Vary', mergeVary(response.headers.get('vary')));
  if (allowed !== undefined) {
    for (const [name, value] of Object.entries(actualResponseHeaders(allowed))) response.headers.set(name, value);
  }
  return response;
}
