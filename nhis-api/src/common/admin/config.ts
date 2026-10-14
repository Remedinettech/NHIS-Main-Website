// /**
//  * Admin authentication configuration, read from process.env on every call (so tests and deployments can change it).
//  * Server-only. No secrets are defined here.
//  *
//  * Env variables: ADMIN_SESSION_IDLE_MINUTES, ADMIN_SESSION_ABSOLUTE_HOURS, ADMIN_COOKIE_SECURE, ADMIN_COOKIE_SAMESITE,
//  * ADMIN_ALLOWED_ORIGINS, ADMIN_TRUSTED_PROXY_HOPS, ADMIN_LOGIN_MAX_PER_EMAIL_IP, ADMIN_LOGIN_MAX_PER_IP,
//  * ADMIN_LOGIN_WINDOW_MINUTES, ADMIN_MAX_BODY_BYTES, ADMIN_COOKIE_NAME, ADMIN_COOKIE_PATH.
//  */
// export const COOKIE_BASE_NAME = 'nhis_admin_session';
// export const DEFAULT_ALLOWED_ORIGINS = ['http://127.0.0.1:5174', 'http://localhost:5174'];

// export interface AdminConfig {
//   readonly secureCookie: boolean;
//   readonly cookieName: string;
//   /** `Path` attribute of the session cookie. Behind IIS this must cover the external API path (for example /TNNHISApi). */
//   readonly cookiePath: string;
//   readonly sameSite: 'Lax' | 'Strict';
//   readonly idleTimeoutMs: number;
//   readonly absoluteTimeoutMs: number;
//   readonly allowedOrigins: readonly string[];
//   /** Number of reverse proxies in front of the API; the client IP is taken that many entries from the right of X-Forwarded-For. */
//   readonly trustedProxyHops: number;
//   readonly loginWindowMs: number;
//   readonly maxFailuresPerEmailIp: number;
//   readonly maxFailuresPerIp: number;
//   readonly maxBodyBytes: number;
// }

// type Env = Record<string, string | undefined>;

// function int(raw: string | undefined, fallback: number, min: number, max: number): number {
//   if (raw === undefined || !/^\d{1,9}$/.test(raw.trim())) return fallback;
//   const n = Number(raw.trim());
//   return n >= min && n <= max ? n : fallback;
// }

// export function normalizeOrigin(value: string): string | null {
//   try {
//     const url = new URL(value.trim());
//     if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
//     return url.origin;
//   } catch {
//     return null;
//   }
// }

// /** Cookie base name: letters, digits, underscore and hyphen only (so it is always a valid cookie token). */
// function cookieBaseName(raw: string | undefined): string {
//   const name = raw?.trim();
//   return name && /^[A-Za-z0-9_-]{3,64}$/.test(name) ? name : COOKIE_BASE_NAME;
// }

// /** Cookie path: an absolute path without spaces, semicolons or control characters; anything else falls back to "/". */
// function cookiePath(raw: string | undefined): string {
//   const path = raw?.trim();
//   if (!path) return '/';
//   return /^\/[A-Za-z0-9._~/-]*$/.test(path) && !path.includes('//') ? path : '/';
// }

// export function loadAdminConfig(env: Env = process.env): AdminConfig {
//   const secureCookie = env.NODE_ENV === 'production' || env.ADMIN_COOKIE_SECURE?.trim().toLowerCase() === 'true';
//   const base = cookieBaseName(env.ADMIN_COOKIE_NAME);
//   const path = cookiePath(env.ADMIN_COOKIE_PATH);
//   const origins = (env.ADMIN_ALLOWED_ORIGINS ?? '')
//     .split(',')
//     .map((o) => normalizeOrigin(o))
//     .filter((o): o is string => o !== null);
//   return {
//     secureCookie,
//     // The __Host- prefix is only valid with Secure and Path=/. With a narrower path the cookie stays Secure and HttpOnly
//     // but cannot carry the prefix, so an application-specific name is used instead.
//     cookieName: secureCookie && path === '/' ? `__Host-${base}` : base,
//     cookiePath: path,
//     sameSite: env.ADMIN_COOKIE_SAMESITE?.trim().toLowerCase() === 'strict' ? 'Strict' : 'Lax',
//     idleTimeoutMs: int(env.ADMIN_SESSION_IDLE_MINUTES, 30, 1, 24 * 60) * 60_000,
//     absoluteTimeoutMs: int(env.ADMIN_SESSION_ABSOLUTE_HOURS, 8, 1, 24 * 30) * 3_600_000,
//     allowedOrigins: origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS,
//     trustedProxyHops: int(env.ADMIN_TRUSTED_PROXY_HOPS, 1, 0, 10),
//     loginWindowMs: int(env.ADMIN_LOGIN_WINDOW_MINUTES, 15, 1, 24 * 60) * 60_000,
//     maxFailuresPerEmailIp: int(env.ADMIN_LOGIN_MAX_PER_EMAIL_IP, 5, 1, 1000),
//     maxFailuresPerIp: int(env.ADMIN_LOGIN_MAX_PER_IP, 30, 1, 100000),
//     maxBodyBytes: int(env.ADMIN_MAX_BODY_BYTES, 256 * 1024, 1024, 8 * 1024 * 1024),
//   };
// }

// export const adminConfig = (): AdminConfig => loadAdminConfig();

/**
 * Server-only admin authentication configuration.
 *
 * Production cookies are Secure by default.
 * Temporary HTTP requires ADMIN_ALLOW_INSECURE_HTTP=true
 * and explicitly configured ADMIN_ALLOWED_ORIGINS.
 *
 * ADMIN_COOKIE_SECURE=true always forces Secure cookies.
 */

export const COOKIE_BASE_NAME = 'nhis_admin_session';

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5174',
  'http://localhost:5174',
];

export interface AdminConfig {
  readonly secureCookie: boolean;
  readonly cookieName: string;
  readonly cookiePath: string;
  readonly sameSite: 'Lax' | 'Strict';
  readonly idleTimeoutMs: number;
  readonly absoluteTimeoutMs: number;
  readonly allowedOrigins: readonly string[];
  readonly trustedProxyHops: number;
  readonly loginWindowMs: number;
  readonly maxFailuresPerEmailIp: number;
  readonly maxFailuresPerIp: number;
  readonly maxBodyBytes: number;
}

type Env = Record<string, string | undefined>;

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function int(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || !/^\d{1,9}$/.test(raw.trim())) {
    return fallback;
  }

  const value = Number(raw.trim());
  return value >= min && value <= max ? value : fallback;
}

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function cookieBaseName(raw: string | undefined): string {
  const name = raw?.trim();

  return name && /^[A-Za-z0-9_-]{3,64}$/.test(name)
    ? name
    : COOKIE_BASE_NAME;
}

function cookiePath(raw: string | undefined): string {
  const path = raw?.trim();

  if (!path) return '/';

  return /^\/[A-Za-z0-9._~/-]*$/.test(path) && !path.includes('//')
    ? path
    : '/';
}

export function loadAdminConfig(
  env: Env = process.env,
): AdminConfig {
  const isProduction = env.NODE_ENV === 'production';
  const allowInsecureHttp = isTrue(env.ADMIN_ALLOW_INSECURE_HTTP);

  const secureCookie =
    isTrue(env.ADMIN_COOKIE_SECURE) ||
    (isProduction && !allowInsecureHttp);

  const base = cookieBaseName(env.ADMIN_COOKIE_NAME);
  const path = cookiePath(env.ADMIN_COOKIE_PATH);

  const origins = [
    ...new Set(
      (env.ADMIN_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map(normalizeOrigin)
        .filter((origin): origin is string => origin !== null),
    ),
  ];

  if (allowInsecureHttp && origins.length === 0) {
    throw new Error(
      'Temporary HTTP access requires explicit ADMIN_ALLOWED_ORIGINS.',
    );
  }

  return {
    secureCookie,

    // __Host- requires both Secure and Path=/.
    cookieName:
      secureCookie && path === '/' ? `__Host-${base}` : base,

    cookiePath: path,

    sameSite:
      env.ADMIN_COOKIE_SAMESITE?.trim().toLowerCase() === 'strict'
        ? 'Strict'
        : 'Lax',

    idleTimeoutMs:
      int(env.ADMIN_SESSION_IDLE_MINUTES, 30, 1, 24 * 60) * 60_000,

    absoluteTimeoutMs:
      int(env.ADMIN_SESSION_ABSOLUTE_HOURS, 8, 1, 24 * 30) *
      3_600_000,

    // Production must not fall back to development origins.
    allowedOrigins:
      origins.length > 0
        ? origins
        : isProduction
          ? []
          : DEFAULT_ALLOWED_ORIGINS,

    trustedProxyHops:
      int(env.ADMIN_TRUSTED_PROXY_HOPS, 1, 0, 10),

    loginWindowMs:
      int(env.ADMIN_LOGIN_WINDOW_MINUTES, 15, 1, 24 * 60) *
      60_000,

    maxFailuresPerEmailIp:
      int(env.ADMIN_LOGIN_MAX_PER_EMAIL_IP, 5, 1, 1000),

    maxFailuresPerIp:
      int(env.ADMIN_LOGIN_MAX_PER_IP, 30, 1, 100000),

    maxBodyBytes:
      int(env.ADMIN_MAX_BODY_BYTES, 256 * 1024, 1024, 8 * 1024 * 1024),
  };
}

export const adminConfig = (): AdminConfig => loadAdminConfig();