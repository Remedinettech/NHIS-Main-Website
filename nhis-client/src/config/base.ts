/**
 * Router basename derived from the Vite base URL: "/" in development (no basename) and for example "/TNNHIS/" in
 * production, where the app lives in an IIS application. The router receives it without the trailing slash.
 */
export const ROUTER_BASENAME = (import.meta.env?.BASE_URL ?? '/').replace(/\/+$/, '');
