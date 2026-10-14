import type { AdminRecord } from '@nhis/shared-types';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDirtyForm } from '../../hooks/useDirtyForm';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMutation } from '../../hooks/useMutation';
import { useRecord } from '../../hooks/useRecord';
import { createRecord, getRecord, runRecordAction, saveRecord, type ModuleName } from '../../services/records.api';
import { can, type RecordAction } from '../../utils/capabilities';
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

export interface EditorContext<V, R> {
  values: V;
  setField: <K extends keyof V>(key: K, value: V[K]) => void;
  setValues: (next: V | ((current: V) => V)) => void;
  /** Field errors from client validation and from the server (keys like `nameEn`, `cells.A`). */
  errors: Record<string, string>;
  /** No content.write permission, or the record is archived. */
  readOnly: boolean;
  record: R | null;
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
  exclude?: readonly RecordAction[];
  /** Shown above the form (preview links, notes). */
  intro?: ReactNode;
  children: (ctx: EditorContext<V, R>) => ReactNode;
}

/**
 * Create/edit screen shared by every content module: loads the record, tracks edits, saves drafts with the version the
 * user started from (409 -> reload banner), shows server field errors, protects unsaved edits, and offers the
 * publish/unpublish/archive actions for the record's state and the signed-in role.
 */
export function RecordEditor<V extends object, R extends AdminRecord<V>>({
  module, entityType, routeId, noun, newValues, listPath, editPath, recordName, createBody, validate, exclude, intro, children,
}: RecordEditorProps<V, R>) {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const loaded = useRecord<R>(module, routeId);
  const [current, setCurrent] = useState<R | null>(null);
  const [created, setCreated] = useState<R | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const form = useDirtyForm<V>(newValues);
  const { markClean } = form;

  useEffect(() => {
    if (loaded.data) {
      setCurrent(loaded.data);
      markClean(loaded.data.values);
    }
  }, [loaded.data, markClean]);

  const save = useMutation(async (values: V, publish: boolean) => {
    let saved: R;
    if (current && routeId) saved = await saveRecord<R, V>(module, routeId, values, current.meta.version);
    else saved = await createRecord<R, unknown>(module, createBody ? createBody(values) : { values });
    if (publish) {
      await runRecordAction(module, routeId ?? saved.id, 'publish', saved.meta.version);
      saved = await getRecord<R>(module, routeId ?? saved.id);
    }
    return saved;
  });

  const readOnly = !can(role, 'content.write') || current?.meta.status === 'ARCHIVED';
  const name = recordName(form.values).replace(/\s+/g, ' ').trim() || `New ${noun}`;
  useDocumentTitle(routeId ? name : `New ${noun}`);

  const submit = useCallback(async (publish: boolean) => {
    const problems = validate ? validate(form.values) : {};
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const result = await save.run(form.values, publish);
    if (!result) return;
    if (result.ok) {
      const saved = result.data;
      setCurrent(saved);
      markClean(saved.values);
      toast.success(publish ? `${name} was saved and published.` : routeId ? `${name} was saved${saved.meta.hasDraft ? ' as a draft. It is not public until it is published.' : '.'}` : `${name} was created as a draft.`);
      if (!routeId) setCreated(saved);
    }
  }, [form.values, markClean, name, routeId, save, toast, validate]);

  // Navigate to the new record only after the form is clean, so the unsaved-changes guard does not intercept it.
  useEffect(() => {
    if (created && !form.dirty) navigate(editPath(created), { replace: true });
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

  return (
    <div className="page">
      <UnsavedChangesGuard when={form.dirty && !save.pending} />
      <PageHeader title={routeId ? name : `New ${noun}`}>
        <div className="editor-head">
          <div className="editor-head__meta">
            <Link className="btn btn--ghost btn--sm" to={listPath}><Icon name="arrowLeft" size={16} /> All {noun}s</Link>
            {meta && <StatusBadge status={meta.status} hasDraft={meta.hasDraft} />}
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
                exclude={['edit', ...(exclude ?? [])]}
                onChanged={() => { void loaded.reload(); }}
              />
            </div>
          )}
        </div>
      </PageHeader>

      {intro}
      {current?.meta.status === 'PUBLISHED' && current.meta.hasDraft && (
        <Banner tone="info" title="You are editing unpublished changes">
          The public website still shows the published version. Use Publish when these changes are ready.
        </Banner>
      )}
      {current?.meta.status === 'ARCHIVED' && <Banner tone="warning" title="This record is archived">Restore it to edit it again. It is not shown on the public website.</Banner>}
      {save.conflict && <ConflictBanner onReload={() => { save.reset(); void loaded.reload(); }} busy={loaded.loading} />}
      {save.error && !save.conflict && Object.keys(save.fieldErrors).length === 0 && (
        <Banner tone="error" title="The changes were not saved">{describeMutationError(save.error)}</Banner>
      )}
      {(Object.keys(clientErrors).length > 0 || Object.keys(save.fieldErrors).length > 0) && (
        <Banner tone="error" title="Check the highlighted fields">Some fields need attention before this can be saved.</Banner>
      )}

      <form
        className="editor-form"
        noValidate
        onSubmit={(event) => { event.preventDefault(); void submit(false); }}
      >
        {children({ values: form.values, setField: form.setField, setValues: form.setValues, errors, readOnly, record: current })}
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
