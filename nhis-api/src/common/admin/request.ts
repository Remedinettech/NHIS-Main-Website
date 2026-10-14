import { adminConfig, type AdminConfig } from './config';

/**
 * Client address for rate limiting and audit. The runtime does not expose the socket address on a Web `Request`, so the
 * address is read from X-Forwarded-For, counting `trustedProxyHops` entries from the RIGHT (the entry appended by the
 * nearest trusted hop), which a client cannot forge by sending its own header. Returns null when unavailable.
 */
export function clientIp(request: Request, config: AdminConfig = adminConfig()): string | null {
  const header = request.headers.get('x-forwarded-for');
  if (!header) return null;
  const entries = header.split(',').map((e) => e.trim()).filter(Boolean);
  if (entries.length === 0) return null;
  const hops = Math.max(1, config.trustedProxyHops);
  const entry = entries[Math.max(0, entries.length - hops)];
  return /^[0-9a-fA-F:.]{2,45}$/.test(entry) ? entry : null;
}

export function clientUserAgent(request: Request): string | null {
  const ua = request.headers.get('user-agent');
  return ua ? ua.slice(0, 300) : null;
}
