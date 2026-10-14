import { adminConfig, type AdminConfig } from './config';

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    let value = part.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    if (!(name in out)) out[name] = value;
  }
  return out;
}

/** The session token from the cookie only. No header, query string or storage value is ever consulted. */
export function readSessionToken(request: Request, config: AdminConfig = adminConfig()): string | null {
  const token = parseCookies(request.headers.get('cookie'))[config.cookieName];
  return token && /^[A-Za-z0-9_-]{20,200}$/.test(token) ? token : null;
}

function attributes(config: AdminConfig, maxAgeSeconds: number): string {
  const parts = [`Path=${config.cookiePath}`, 'HttpOnly', `SameSite=${config.sameSite}`, `Max-Age=${maxAgeSeconds}`];
  if (config.secureCookie) parts.push('Secure');
  return parts.join('; ');
}

export function buildSessionCookie(token: string, maxAgeSeconds: number, config: AdminConfig = adminConfig()): string {
  return `${config.cookieName}=${token}; ${attributes(config, Math.max(0, Math.floor(maxAgeSeconds)))}`;
}

export function buildClearCookie(config: AdminConfig = adminConfig()): string {
  return `${config.cookieName}=; ${attributes(config, 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
