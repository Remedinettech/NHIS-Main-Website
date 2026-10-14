import { ApiError } from '../../services/http';
import { retryMessage } from '../../utils/validation';

/** Plain-language reason for a failed read request (list or detail load). */
export function describeError(error: Error): string {
  if (error instanceof ApiError) {
    if (error.kind === 'network') return 'The data service could not be reached. Please check your connection and try again.';
    if (error.status === 403) return 'You do not have permission to view this.';
    if (error.kind === 'http') return 'The data service reported a problem. Please try again in a moment.';
    return 'The data service returned a response that could not be read. Please try again.';
  }
  return 'Something unexpected went wrong while loading this data. Please try again.';
}

/**
 * Message for a failed save or action. Server messages for validation, conflict and state errors are written for
 * people and are shown as they are; unexpected server errors get a generic sentence.
 */
export function describeMutationError(error: Error): string {
  if (!(error instanceof ApiError)) return 'Something unexpected went wrong. Nothing was changed. Please try again.';
  if (error.kind === 'network') return 'The server could not be reached. Nothing was changed. Check your connection and try again.';
  switch (error.code) {
    case 'RATE_LIMITED': return retryMessage(error.retryAfterSeconds);
    case 'FORBIDDEN': return 'Your role does not allow this action.';
    case 'CSRF': return 'Your session could not be verified. Reload the page and try again.';
    case 'UNAUTHENTICATED': return 'Your session has ended. Sign in again.';
    case 'CONFLICT': return 'This record was changed by someone else. Reload the latest version and try again.';
    case 'INTERNAL_ERROR': return 'The server could not complete this request. Nothing was changed. Please try again.';
    default: return error.message || 'The request could not be completed.';
  }
}
