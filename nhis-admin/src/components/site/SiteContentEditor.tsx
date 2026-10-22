import { SITE_CONTENT_INFO, defaultSiteContent, type AdminSiteContent, type SiteContentKey, type SiteContentMap } from '@nhis/shared-types';
import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import { SITE_CONTENT_ENTITY_TYPE, SITE_EDIT_PATHS, previewUrlFor } from '../../config/siteContent';
import { useCan } from '../../hooks/useAuth';
import type { RecordAction } from '../../utils/capabilities';
import { publishAdvice } from '../../utils/saveMessage';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { Icon } from '../common/Icon';
import { StatusBadge } from '../common/StatusBadge';
import { Banner } from '../common/Toast';
import { RecordEditor, type EditorContext } from '../records/RecordEditor';
import { SiteFormContext } from './SiteFormContext';
import { describeFieldPath, validateSiteValues, type FieldErrors } from './siteForm';
import './site.css';

/** What the render function of SiteContentEditor receives: the RecordEditor context for this document. */
export type SiteEditorContext<K extends SiteContentKey> = EditorContext<SiteContentMap[K], AdminSiteContent<K>>;

export interface SiteContentEditorProps<K extends SiteContentKey> {
  /** The document: "header", "navigation", "home", "partners", "footer" or "text". It is the id in the URL of the API. */
  contentKey: K;
  /** The form (it may use hooks). Use `values` / `setField` / `setValues` to edit; the cards of the form go here. */
  children: (ctx: SiteEditorContext<K>) => ReactNode;
}

/** Documents are never unpublished, archived, restored or deleted. */
const NEVER: readonly RecordAction[] = ['unpublish', 'archive', 'restore', 'delete'];

/**
 * Editor shell for one site-content document, built on RecordEditor (save draft, save and publish, discard draft, history,
 * conflict banner, unsaved-changes guard, role-aware buttons). It adds: an intro (what the document controls, drafts versus
 * published, "Preview on website"), a notice while the document is still the built-in content, validation with the shared
 * validator (the same one the server runs, mapped to field paths), and a SiteFormContext so that BilingualInput, ImageField,
 * LinkTargetEditor, ReorderableList and the other form components find their errors and the read-only state by path.
 * Server field errors use the same paths and are shown through the same context.
 */
export function SiteContentEditor<K extends SiteContentKey>({ contentKey, children }: SiteContentEditorProps<K>) {
  const info = SITE_CONTENT_INFO[contentKey];
  const newValues = useMemo(() => defaultSiteContent(contentKey), [contentKey]);
  const validate = useCallback((values: SiteContentMap[K]) => validateSiteValues(contentKey, values), [contentKey]);
  const recordName = useCallback(() => info.label, [info.label]);
  const editPath = useCallback(() => SITE_EDIT_PATHS[contentKey], [contentKey]);
  // A document nobody has saved yet is a virtual row on the server: it cannot be published through the menu, only
  // through "Save and publish", which creates the row first.
  const exclude = useCallback((record: AdminSiteContent<K> | null): readonly RecordAction[] => (
    record && !record.customised ? ['publish', ...NEVER] : NEVER
  ), []);

  // A document nobody has saved is the built-in content, not a draft.
  const statusBadge = useCallback((record: AdminSiteContent<K>) => (
    record.customised ? <StatusBadge status={record.meta.status} hasDraft={record.meta.hasDraft} /> : <Badge>Website defaults</Badge>
  ), []);

  return (
    <RecordEditor<SiteContentMap[K], AdminSiteContent<K>>
      module="site-content"
      entityType={SITE_CONTENT_ENTITY_TYPE}
      routeId={contentKey}
      noun={info.label.toLowerCase()}
      listLabel="Website content"
      newValues={newValues}
      listPath="/site"
      editPath={editPath}
      recordName={recordName}
      validate={validate}
      exclude={exclude}
      statusBadge={statusBadge}
      errorFocus="none"
      intro={<SiteIntro contentKey={contentKey} />}
    >
      {(ctx) => <EditorBody ctx={ctx} render={children} />}
    </RecordEditor>
  );
}

/**
 * The body below the intro. A component of its own so that the render function may use hooks: RecordEditor calls its children
 * only after loading, which would otherwise change the number of hooks of RecordEditor between renders.
 */
function EditorBody<K extends SiteContentKey>({ ctx, render }: { ctx: SiteEditorContext<K>; render: (ctx: SiteEditorContext<K>) => ReactNode }) {
  return (
    <SiteFormContext.Provider value={{ errors: ctx.errors, readOnly: ctx.readOnly }}>
      <RecordNotices record={ctx.record} />
      <ErrorSummary errors={ctx.errors} attempt={ctx.failedSaves} />
      {render(ctx)}
    </SiteFormContext.Provider>
  );
}

function SiteIntro({ contentKey }: { contentKey: SiteContentKey }) {
  const info = SITE_CONTENT_INFO[contentKey];
  return (
    <Card>
      <div className="site-intro">
        <div className="site-intro__text">
          <p><strong>{info.label}.</strong> {info.description}</p>
          <p>Published content is what visitors see. Saving creates a private draft; nothing changes on the public website until you publish.</p>
          <p className="editor-note">Tamil text is optional. Where it is empty, the website shows the English text.</p>
        </div>
        <div className="site-intro__actions">
          <a className="btn btn--secondary" href={previewUrlFor(contentKey)} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={18} />Preview on website<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          <p className="ff__hint">The preview shows saved drafts. Save your changes first to see them there.</p>
        </div>
      </div>
    </Card>
  );
}

function RecordNotices({ record }: { record: AdminSiteContent | null }) {
  const canPublish = useCan('content.publish');
  if (!record) return null;
  if (!record.customised) {
    return (
      <Banner tone="info" title="Website defaults">
        The website currently shows the built-in content. Saving creates your first draft; nothing changes publicly until you publish.
      </Banner>
    );
  }
  if (record.meta.status === 'DRAFT') {
    return (
      <Banner tone="info" title="Saved as a draft, not published yet">
        Visitors still see the built-in content. {publishAdvice(canPublish)}
      </Banner>
    );
  }
  return null;
}

const VISIBLE_PROBLEMS = 6;

/**
 * Every problem in one list, so that an error on a value the form does not draw (or on a collapsed row) is never hidden.
 * Focus moves to it when a save finds problems, so that keyboard and screen-reader users land on the list instead of staying
 * on the button they pressed.
 */
function ErrorSummary({ errors, attempt }: { errors: FieldErrors; attempt: number }) {
  const entries = useMemo(() => Object.entries(errors), [errors]);
  const headingId = useId();
  const box = useRef<HTMLElement>(null);
  // The errors object is rebuilt on every render; focus moves when a save was refused (a new attempt), also with the same problems.
  const count = entries.length;
  useEffect(() => {
    if (count > 0) box.current?.focus();
  }, [attempt, count]);
  if (entries.length === 0) return null;
  const item = ([path, message]: [string, string]) => <li key={path}><strong>{describeFieldPath(path)}:</strong> {message}</li>;
  return (
    <section ref={box} className="error-summary" tabIndex={-1} aria-labelledby={headingId}>
      <h2 id={headingId}>{entries.length === 1 ? '1 problem to fix' : `${entries.length} problems to fix`}</h2>
      <ul>{entries.slice(0, VISIBLE_PROBLEMS).map(item)}</ul>
      {entries.length > VISIBLE_PROBLEMS && (
        <details>
          <summary>Show the other {entries.length - VISIBLE_PROBLEMS}</summary>
          <ul>{entries.slice(VISIBLE_PROBLEMS).map(item)}</ul>
        </details>
      )}
    </section>
  );
}
