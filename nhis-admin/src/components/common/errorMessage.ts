import { ApiError } from '../../services/http';
import { retryMessage } from '../../utils/validation';

/** Plain-language reason for a failed read request (list or detail load). */
export function describeError(error: Error): string {
  if (error instanceof ApiError) {
    if (error.code === 'MIGRATION_REQUIRED') return 'Database setup is incomplete. The operator must back up the database and review/apply the pending migrations, then restart the API. See docs/DEPLOYMENT-SITE-CONTENT.md. Repeated retries will not fix this.';
    if (error.kind === 'network') return 'The data service could not be reached. Please check your connection and try again.';
    if (error.status === 403) return 'You do not have permission to view this.';
    if (error.kind === 'http') return 'The data service reported a problem. Please try again in a moment.';
    return 'The data service returned a response that could not be read. Please try again.';
  }
  return 'Something unexpected went wrong while loading this data. Please try again.';
}

/**
 * Message for a failed save or action. Server messages for validation, conflict and state errors are written for
 * people and are shown as they are; unexpected server errors get a generic sentence. `somethingChanged` is for the failure of a
 * later step of an action whose first step succeeded (a draft that was saved but not published): the sentences then do not
 * claim that nothing was changed.
 */
export function describeMutationError(error: Error, options: { somethingChanged?: boolean } = {}): string {
  const unchanged = options.somethingChanged ? '' : ' Nothing was changed.';
  if (!(error instanceof ApiError)) return `Something unexpected went wrong.${unchanged} Please try again.`;
  if (error.kind === 'network') return `The server could not be reached.${unchanged} Check your connection and try again.`;
  switch (error.code) {
    case 'MIGRATION_REQUIRED': return 'Database setup is incomplete. No changes were saved. Ask the operator to review/apply the pending migrations after backing up the database, then restart the API.';
    case 'RATE_LIMITED': return retryMessage(error.retryAfterSeconds);
    case 'FORBIDDEN': return 'Your role does not allow this action.';
    case 'CSRF': return 'Your session could not be verified. Reload the page and try again.';
    case 'UNAUTHENTICATED': return 'Your session has ended. Sign in again.';
    case 'CONFLICT': return 'This record was changed by someone else. Reload the latest version and try again.';
    case 'INTERNAL_ERROR': return `The server could not complete this request.${unchanged} Please try again.`;
    default: return error.message || 'The request could not be completed.';
  }
}
