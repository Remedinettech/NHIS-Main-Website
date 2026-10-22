import type { PublicationStatus } from '@nhis/shared-types';

/** What a successful save did, as far as the message is concerned. */
export interface SaveOutcomeSummary {
  /** The record did not exist before (the first save of a new record). */
  created: boolean;
  /** The save was followed by a publish that succeeded. */
  published: boolean;
  /** Status and draft flag of the record the server answered with. */
  status: PublicationStatus;
  hasDraft: boolean;
}

/**
 * The sentence shown after a successful save. It always says whether the visitors of the website can see the change: a record that
 * was never published (status DRAFT), and the unpublished edits of a published record, are saved as a draft and stay private.
 */
export function describeSave(name: string, outcome: SaveOutcomeSummary): string {
  if (outcome.published) return `${name} was saved and published.`;
  if (outcome.created) return `${name} was created as a draft.`;
  const stillPrivate = outcome.hasDraft || outcome.status === 'DRAFT';
  return stillPrivate ? `${name} was saved as a draft. It is not public until it is published.` : `${name} was saved.`;
}

/**
 * The closing sentence of the notices about unpublished changes. An Editor cannot publish, so "Use Publish" would send them looking
 * for a button that is not there: they are told who can publish instead.
 */
export function publishAdvice(canPublish: boolean): string {
  return canPublish ? 'Use Publish when these changes are ready.' : 'A publisher or administrator can publish them when they are ready.';
}
