import { isSafeHttpsUrl } from '@nhis/shared-types';
import { API_BASE_URL } from '../config/api';

/** Public file shipped with the app (from /public), correct under any base path such as /TNNHIS/. */
export function assetUrl(path: string): string {
  return `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\/+/, '')}`;
}

const API_PATH_PREFIX = '/api/v1';

/**
 * The API answers with paths such as /api/v1/files/<id>. Rewrites them onto the configured API base
 * (for example /TNNHISApi/api/v1) so downloads and images work behind IIS. Other URLs are returned unchanged.
 */
export function resolveApiUrl(path: string, apiBase: string = API_BASE_URL): string {
  return path.startsWith(`${API_PATH_PREFIX}/`) ? `${apiBase}${path.slice(API_PATH_PREFIX.length)}` : path;
}

/**
 * True for an address inside this site: one leading slash, nothing that a browser reads as another host (`//host`, and
 * `/\host`, which browsers treat the same way).
 */
export function isSitePath(address: string): boolean {
  return /^\/(?![/\\])/.test(address);
}

/**
 * Address of a document file from the registry: the API's file route (rewritten onto the API base of the deployment), any
 * other path of this site, or a safe https address. Anything else (`javascript:`, `data:`, `//host`, ...) has no address.
 */
export function documentFileUrl(localPath: string | null | undefined): string | undefined {
  if (typeof localPath !== 'string') return undefined;
  if (isSitePath(localPath)) return resolveApiUrl(localPath);
  return isSafeHttpsUrl(localPath) ? localPath : undefined;
}
