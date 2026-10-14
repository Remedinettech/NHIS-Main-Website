import { NotImplementedError } from './utils/errors';

/**
 * Authorization contract placeholder.
 *
 * No authentication provider is wired in this starter and no write endpoints exist. `requireRole` therefore
 * ALWAYS denies; it exists so future admin routes have one place to call and cannot silently succeed.
 */
export type Role = 'editor' | 'publisher' | 'admin';

export interface AuthContext {
  readonly authenticated: false;
  readonly userId: null;
  readonly roles: readonly Role[];
}

export const NOT_IMPLEMENTED_MESSAGE = 'Authentication is not implemented in this starter';

/** Every request is anonymous until a real provider is added. */
export function getAuthContext(_request?: Request): AuthContext {
  return { authenticated: false, userId: null, roles: [] };
}

/** Always throws a 501 NOT_IMPLEMENTED error (never returns), regardless of the arguments. */
export function requireRole(_context: AuthContext, ..._roles: Role[]): never {
  throw new NotImplementedError(NOT_IMPLEMENTED_MESSAGE);
}
