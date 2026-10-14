import { ApiError } from '../services/http';
import { retryMessage } from './validation';

export interface LoginFailure {
  message: string;
  /** Wrong credentials: the password box is cleared and refocused. */
  credentials: boolean;
}

/**
 * Maps a failed sign-in to a message. Wrong email, wrong password and inactive accounts all look the same on purpose,
 * so nothing reveals whether an account exists.
 */
export function describeLoginError(error: unknown): LoginFailure {
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMITED' || error.status === 429) return { message: retryMessage(error.retryAfterSeconds), credentials: false };
    if (error.kind === 'network') return { message: 'The server could not be reached. Check your connection and try again.', credentials: false };
    if (error.status === 401 || error.code === 'UNAUTHENTICATED' || error.code === 'INVALID') {
      return { message: 'The email or password is incorrect.', credentials: true };
    }
    if (error.status === 403) return { message: 'Sign-in is not allowed from this address. Contact an administrator.', credentials: false };
  }
  return { message: 'Sign-in is not available right now. Please try again shortly.', credentials: false };
}
