import type { AdminRecord } from '@nhis/shared-types';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDirtyForm } from '../../hooks/useDirtyForm';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMutation } from '../../hooks/useMutation';
import { useRecord } from '../../hooks/useRecord';
import { createRecord, getRecord, runRecordAction, saveRecord, type ModuleName } from '../../services/records.api';
import { ApiError } from '../../services/http';
import { can, type RecordAction } from '../../utils/capabilities';
import { describeSave, publishAdvice } from '../../utils/saveMessage';
import { Banner, useToast } from '../common/Toast';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { ConflictBanner } from '../common/ConflictBanner';
import { describeMutationError } from '../common/errorMessage';
import { FormActions } from '../common/FormActions';
import { Icon } from '../common/Icon';
import { PageHeader } from '../common/PageHeader';
import { RecordActions } from '../common/RecordActions';
import { ErrorState, LoadingState } from '../common/StateViews';
import { StatusBadge } from '../common/StatusBadge';
import { UnsavedChangesGuard } from '../common/UnsavedChangesGuard';
import './records.css';

/** What a save did: the stored record, whether it was also published, and a sentence when a step after the draft was stored failed. */
interface SaveOutcome<R> { saved: R; published?: boolean; problem?: string }

export interface EditorContext<V, R> {
  values: V;
  setField: <K extends keyof V>(key: K, value: V[K]) => void;
  setValues: (next: V | ((current: V) => V)) => void;
  /** Field errors from client validation and from the server (keys like `nameEn`, `cells.A`). */
  errors: Record<string, string>;
  /** No content.write permission, or the record is archived. */
  readOnly: boolean;
  record: R | null;
  /** How many times a save was refused because of problems with the values (client or server). Lets a form move focus to its problem list each time. */
  failedSaves: number;
}

interface RecordEditorProps<V extends object, R extends AdminRecord<V>> {
  module: ModuleName;
  /** Audit entity type, for the History link. */
  entityType: string;
  /** Id (or slug) from the URL; omit when creating. */
  routeId?: string;
  noun: string;
  newValues: V;
  listPath: string;
  /** Where to go after a record is created. */
  editPath: (record: R) => string;
  recordName: (values: V) => string;
  /** Request body for create (default `{ values }`). */
  createBody?: (values: V) => unknown;
  validate?: (values: V) => Record<string, string>;
  /** Actions to hide in the menu. A function receives the loaded record (null while none), for records whose state decides. */
  exclude?: readonly RecordAction[] | ((record: R | null) => readonly RecordAction[]);
  /** Text of the link back to the list (default "All {noun}s"). */
  listLabel?: string;
  /** Replaces the status chips next to the title (for example "Built-in" for a record that has no row yet). */
  statusBadge?: (record: R) => ReactNode;
  /** Shown above the form (preview links, notes). */
  intro?: ReactNode;
  /**
   * Where focus goes when a save is refused because of problems with the values: the first invalid field (default) or nowhere,
   * for a form that moves focus to its own list of problems.
   */
  errorFocus?: 'first-field' | 'none';
  children: (ctx: EditorContext<V, R>) => ReactNode;
}

/**
 * Create/edit screen shared by every content module: loads the record, tracks edits, saves drafts with the version the
 * user started from (409 -> reload banner), shows server field errors, protects unsaved edits, and offers the
 * publish/unpublish/archive actions for the record's state and the signed-in role.
 */
export function RecordEditor<V extends object, R extends AdminRecord<V>>({
  module, entityType, routeId, noun, newValues, listPath, editPath, recordName, createBody, validate, exclude, listLabel, statusBadge, intro, errorFocus = 'first-field', children,
}: RecordEditorProps<V, R>) {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const loaded = useRecord<R>(module, routeId);
  const [current, setCurrent] = useState<R | null>(null);
  const [created, setCreated] = useState<R | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [failedSaves, setFailedSaves] = useState(0);
  // What went wrong after the draft was saved (the publish step), shown above the form until the next save.
  const [afterSaveProblem, setAfterSaveProblem] = useState<string>();
  const formElement = useRef<HTMLFormElement>(null);
  const form = useDirtyForm<V>(newValues);
  const { markClean } = form;

  useEffect(() => {
    if (loaded.data) {
      setCurrent(loaded.data);
      markClean(loaded.data.values);
    }
  }, [loaded.data, markClean]);

  const save = useMutation(async (values: V, publish: boolean): Promise<SaveOutcome<R>> => {
    let saved: R;
    if (current && routeId) saved = await saveRecord<R, V>(module, routeId, values, current.meta.version);
    else saved = await createRecord<R, unknown>(module, createBody ? createBody(values) : { values });
    if (!publish) return { saved };
    // From here on the draft is stored. If publishing fails, the editor must still show the stored version (its number and
    // values): otherwise the next save is refused as a conflict, and on a new record it would create a second copy.
    try {
      await runRecordAction(module, routeId ?? saved.id, 'publish', saved.meta.version);
    } catch (error) {
      return { saved, problem: `The changes were saved as a draft, but they could not be published: ${describeMutationError(error instanceof Error ? error : new Error('Request failed'), { somethingChanged: true })}` };
    }
    try {
      saved = await getRecord<R>(module, routeId ?? saved.id);
    } catch {
      return { saved, problem: 'The changes were published, but the page could not be refreshed. Reload the page before editing again.' };
    }
    return { saved, published: true };
  });

  const readOnly = !can(role, 'content.write') || current?.meta.status === 'ARCHIVED';
  const name = recordName(form.values).replace(/\s+/g, ' ').trim() || `New ${noun}`;
  useDocumentTitle(routeId ? name : `New ${noun}`);

  const submit = useCallback(async (publish: boolean) => {
    const submitted = form.values;
    setAfterSaveProblem(undefined);
    const problems = validate ? validate(submitted) : {};
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) { setFailedSaves((count) => count + 1); return; }
    const result = await save.run(submitted, publish);
    if (!result) return;
    if (!result.ok && result.error instanceof ApiError && Object.keys(result.error.fieldErrors).length > 0) setFailedSaves((count) => count + 1);
    if (result.ok) {
      const { saved, problem, published } = result.data;
      setCurrent(saved);
      // Edits made while the request ran are kept, not replaced by the saved copy.
      markClean(saved.values, submitted);
      setAfterSaveProblem(problem);
      if (problem) toast.error(problem);
      else toast.success(describeSave(name, { created: !routeId, published: Boolean(published), status: saved.meta.status, hasDraft: saved.meta.hasDraft }));
      if (!routeId) setCreated(saved);
    }
  }, [form.values, markClean, name, routeId, save, toast, validate]);

  // A refused save leaves the keyboard on the Save button: take it to the first field that needs attention.
  useEffect(() => {
    if (failedSaves === 0 || errorFocus === 'none') return;
    formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [failedSaves, errorFocus]);

  // Navigate to the new record only after the form is clean, so the unsaved-changes guard does not intercept it.
  useEffect(() => {
    if (created && !form.dirty) {
      // Consume the redirect once. editPath is often an inline callback, so retaining
      // created would navigate again on subsequent renders of the edit route.
      setCreated(null);
      navigate(editPath(created), { replace: true });
    }
  }, [created, form.dirty, navigate, editPath]);

  const errors = { ...save.fieldErrors, ...clientErrors };

  if (routeId && loaded.loading && !current) return <div className="page"><LoadingState label={`Loading ${noun}…`} rows={3} /></div>;
  if (routeId && loaded.error && !current) {
    return (
      <div className="page">
        <PageHeader title={`This ${noun} could not be opened`} />
        <ErrorState error={loaded.error} title={`The ${noun} could not be loaded`} onRetry={loaded.reload} />
        <Link className="btn btn--secondary" to={listPath}><Icon name="arrowLeft" size={18} /> Back to the list</Link>
      </div>
    );
  }

  const canPublish = can(role, 'content.publish');
  const meta = current?.meta;
  const excludedActions = typeof exclude === 'function' ? exclude(current) : exclude;

  return (
    <div className="page">
      <UnsavedChangesGuard when={form.dirty && !save.pending} />
      <PageHeader title={routeId ? name : `New ${noun}`}>
        <div className="editor-head">
          <div className="editor-head__meta">
            <Link className="btn btn--ghost btn--sm" to={listPath}><Icon name="arrowLeft" size={16} /> {listLabel ?? `All ${noun}s`}</Link>
            {meta && (statusBadge && current ? statusBadge(current) : <StatusBadge status={meta.status} hasDraft={meta.hasDraft} />)}
            {meta?.updatedByEmail && <span className="text-muted editor-note">Last saved by {meta.updatedByEmail} · {new Date(meta.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          </div>
          {current && routeId && (
            <div className="editor-head__meta">
              <Link className="btn btn--ghost btn--sm" to={`/activity?entityType=${entityType}&entityId=${encodeURIComponent(current.id)}`}>History</Link>
              <RecordActions
                module={module}
                id={routeId}
                meta={current.meta}
                name={name}
                exclude={['edit', ...(excludedActions ?? [])]}
                // An action reloads the record, which would silently replace what was typed and not saved yet.
                blockedReason={form.dirty ? 'Save or discard your edits to use the actions.' : undefined}
                onChanged={() => { void loaded.reload(); }}
              />
            </div>
          )}
        </div>
      </PageHeader>

      {intro}
      {current?.meta.status === 'PUBLISHED' && current.meta.hasDraft && (
        <Banner tone="info" title="You are editing unpublished changes">
          The public website still shows the published version. {publishAdvice(canPublish)}
        </Banner>
      )}
      {current?.meta.status === 'ARCHIVED' && <Banner tone="warning" title="This record is archived">Restore it to edit it again. It is not shown on the public website.</Banner>}
      {afterSaveProblem && <Banner tone="error" title="The changes are not published">{afterSaveProblem}</Banner>}
      {save.conflict && <ConflictBanner onReload={() => { save.reset(); void loaded.reload(); }} busy={loaded.loading} />}
      {save.error && !save.conflict && Object.keys(save.fieldErrors).length === 0 && (
        <Banner tone="error" title="The changes were not saved">{describeMutationError(save.error)}</Banner>
      )}
      {(Object.keys(clientErrors).length > 0 || Object.keys(save.fieldErrors).length > 0) && (
        <Banner tone="error" title="Check the highlighted fields">Some fields need attention before this can be saved.</Banner>
      )}

      <form
        ref={formElement}
        className="editor-form"
        noValidate
        onSubmit={(event) => { event.preventDefault(); void submit(false); }}
      >
        {children({ values: form.values, setField: form.setField, setValues: form.setValues, errors, readOnly, record: current, failedSaves })}
        {!readOnly && (
          <div className="editor-footer">
            <FormActions
              saveLabel={routeId ? 'Save changes' : `Create ${noun}`}
              busy={save.pending}
              saveDisabled={routeId ? !form.dirty : false}
              onCancel={() => { form.reset(); setClientErrors({}); save.reset(); if (!routeId) navigate(listPath); }}
              cancelLabel={routeId ? 'Discard edits' : 'Cancel'}
              extra={canPublish ? (
                <Button variant="secondary" disabled={save.pending} onClick={() => void submit(true)}>Save and publish</Button>
              ) : undefined}
            />
          </div>
        )}
        {readOnly && !can(role, 'content.write') && <Card><p className="editor-note">Your role can view this record but not change it.</p></Card>}
      </form>
    </div>
  );
}
