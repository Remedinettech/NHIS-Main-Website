import type { AdminRecordMeta } from '@nhis/shared-types';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useMutation } from '../../hooks/useMutation';
import { runRecordAction, type ModuleName, type RecordRequestAction } from '../../services/records.api';
import { ApiError } from '../../services/http';
import { allowedRecordActions, type RecordAction } from '../../utils/capabilities';
import { ConfirmDialog } from './Dialog';
import { describeMutationError } from './errorMessage';
import { RecordActionsMenu } from './RecordActionsMenu';
import { useToast } from './Toast';

interface CopyEntry { title: string; confirm: string; busy: string; done: string; text: (name: string) => string; destructive?: boolean }

const COPY: Record<RecordRequestAction, CopyEntry> = {
  publish: {
    title: 'Publish this record?', confirm: 'Publish', busy: 'Publishing…', done: 'Published.',
    text: () => 'It becomes visible on the public website straight away.',
  },
  unpublish: {
    title: 'Unpublish this record?', confirm: 'Unpublish', busy: 'Unpublishing…', done: 'Unpublished.',
    text: () => 'It is removed from the public website and returns to Draft. Nothing is deleted.',
  },
  archive: {
    title: 'Archive this record?', confirm: 'Archive', busy: 'Archiving…', done: 'Archived.', destructive: true,
    text: () => 'It is removed from the public website and hidden from normal lists. You can restore it later.',
  },
  restore: {
    title: 'Restore this record?', confirm: 'Restore', busy: 'Restoring…', done: 'Restored as a draft.',
    text: () => 'It returns to Draft and is not public until it is published again.',
  },
  'discard-draft': {
    title: 'Discard the unpublished changes?', confirm: 'Discard changes', busy: 'Discarding…', done: 'Unpublished changes discarded.', destructive: true,
    text: () => 'The published version stays as it is. The edits that were not published are lost.',
  },
  delete: {
    title: 'Delete this record permanently?', confirm: 'Delete', busy: 'Deleting…', done: 'Deleted.', destructive: true,
    text: () => 'This cannot be undone. Only drafts that were never published can be deleted; use Archive for anything else.',
  },
};

interface RecordActionsProps {
  module: ModuleName;
  /** Identifier used in the URL (the id, or the slug for pages). */
  id: string;
  meta: Pick<AdminRecordMeta, 'status' | 'version' | 'hasDraft' | 'publishedAt'>;
  /** Human name of the record; shown in confirmations, messages and the menu's accessible name. */
  name: string;
  /** Called after a successful action (or after a conflict) so the list or record can be reloaded. */
  onChanged: () => void;
  /** Called for the Edit menu item (usually `navigate(...)`). */
  onEdit?: () => void;
  /** Actions to leave out (for example `['delete']` for pages). */
  exclude?: readonly RecordAction[];
}

/**
 * The standard per-record menu: shows only what the signed-in role may do for the record's state, confirms with the
 * record name, runs the action with `expectedVersion`, reports success only after a 2xx response and then calls `onChanged`.
 */
export function RecordActions({ module, id, meta, name, onChanged, onEdit, exclude = [] }: RecordActionsProps) {
  const { role } = useAuth();
  const toast = useToast();
  const [pending, setPending] = useState<RecordRequestAction | null>(null);
  const mutation = useMutation((action: RecordRequestAction) => runRecordAction(module, id, action, meta.version));

  const actions = allowedRecordActions(role, meta).filter((a) => !exclude.includes(a));

  const execute = async (action: RecordRequestAction) => {
    const result = await mutation.run(action);
    if (!result) return;
    if (result.ok) {
      setPending(null);
      toast.success(`${name}: ${COPY[action].done}`);
      onChanged();
      return;
    }
    if (result.error instanceof ApiError && result.error.isConflict) onChanged();
  };

  const select = (action: RecordAction) => {
    if (action === 'edit') { onEdit?.(); return; }
    mutation.reset();
    if (action === 'restore') { setPending('restore'); void execute('restore'); return; }
    setPending(action);
  };

  const active = pending ? COPY[pending] : null;
  return (
    <>
      <RecordActionsMenu actions={actions} onSelect={select} recordName={name} disabled={mutation.pending} />
      {active && pending && (
        <ConfirmDialog
          open
          title={active.title}
          subject={name}
          confirmLabel={active.confirm}
          busyLabel={active.busy}
          destructive={active.destructive}
          busy={mutation.pending}
          error={mutation.error ? describeMutationError(mutation.error) : undefined}
          onConfirm={() => void execute(pending)}
          onCancel={() => { setPending(null); mutation.reset(); }}
        >
          {active.text(name)}
        </ConfirmDialog>
      )}
    </>
  );
}
