import { ApiRequestError } from '../../services/http';
import type { MessageKey, MessageParams } from '../../locales';

/** Maps a failed request to a user-facing message key (so every failure reads clearly in both languages). */
export function errorMessageKey(error: Error): { key: MessageKey; params?: MessageParams } {
  if (error instanceof ApiRequestError) {
    if (error.kind === 'network') return { key: 'common.networkError' };
    if (error.kind === 'http') return { key: 'common.serverError', params: { status: error.status ?? '' } };
  }
  return { key: 'common.unexpectedError' };
}
