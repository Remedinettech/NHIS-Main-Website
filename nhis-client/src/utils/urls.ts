import { API_BASE_URL } from '../config/api';

/** Public file shipped with the app (from /public), correct under any base path such as /TNNHIS/. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

const API_PATH_PREFIX = '/api/v1';

/**
 * The API answers with paths such as /api/v1/files/<id>. Rewrites them onto the configured API base
 * (for example /TNNHISApi/api/v1) so downloads and images work behind IIS. Other URLs are returned unchanged.
 */
export function resolveApiUrl(path: string, apiBase: string = API_BASE_URL): string {
  return path.startsWith(`${API_PATH_PREFIX}/`) ? `${apiBase}${path.slice(API_PATH_PREFIX.length)}` : path;
}
