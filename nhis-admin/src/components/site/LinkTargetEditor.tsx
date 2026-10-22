import type { LinkTarget } from '@nhis/shared-types';
import {
  LINK_KINDS, LINK_KIND_LABELS, ROUTE_PAGE_OPTIONS, ROUTE_SECTION_OPTIONS, emptyLinkTarget, joinRoutePath, liveLinkProblem,
  routeSelectValue, splitRoutePath, telLinkPreview, type LinkKind,
} from '../../utils/siteContentLinks';
import { Button } from '../common/Button';
import { TextField } from '../common/fields';
import { SiteSelect } from './SiteSelect';
import { useSiteForm } from './SiteFormContext';
import { useSiteDocuments } from './useSiteDocuments';
import { firstError, type FieldErrors } from './siteForm';
import './site.css';

export interface LinkTargetEditorProps {
  /** Legend of the group. Default "Where the link leads". */
  label?: string;
  /** Path of the target in the document ("loginMenu.items.1.target"). Errors are read from `${path}`, `${path}.type` and the field of the kind (`.path`, `.url`, `.documentId`, `.address`, `.number`). */
  path: string;
  value: LinkTarget;
  onChange: (next: LinkTarget) => void;
  /** Kinds offered by the kind select, in this order. Default: page, document, web address, e-mail, phone. */
  kinds?: readonly LinkKind[];
  disabled?: boolean;
  /** Overrides the errors of the surrounding SiteContentEditor. */
  errors?: FieldErrors;
}

/**
 * Edits where a link leads. A kind select (page of this site, document, web address, e-mail, phone) decides which input
 * follows: a page or section of the website, a document of the Documents module, an https:// address, an e-mail address or a
 * phone number. Typed values are checked while typing (isKnownSiteRoute, isSafeHttpsUrl, ...); the shared validator
 * and the server remain authoritative when the document is saved. Changing the kind starts a new, empty target.
 */
export function LinkTargetEditor({ label = 'Where the link leads', path, value, onChange, kinds = LINK_KINDS, disabled, errors }: LinkTargetEditorProps) {
  const form = useSiteForm();
  const errs = errors ?? form.errors;
  const off = disabled || form.readOnly;
  const live = liveLinkProblem(value);
  const telLink = value.type === 'phone' ? telLinkPreview(value.number) : '';
  // A kind that is no longer offered (stored content) stays selectable so the select tells the truth.
  const offered = kinds.includes(value.type) ? kinds : [value.type, ...kinds];

  const changeKind = (kind: string) => {
    if (kind !== value.type && (LINK_KINDS as readonly string[]).includes(kind)) onChange(emptyLinkTarget(kind as LinkKind));
  };

  return (
    <fieldset className="link-editor" disabled={off}>
      <legend className="bilingual__legend">{label}</legend>
      {errs[path] && <p className="ff__error" role="alert">{errs[path]}</p>}
      <div className="link-editor__grid">
        <SiteSelect
          label="The link opens" value={value.type} onChange={changeKind} options={offered.map((kind) => ({ value: kind, label: LINK_KIND_LABELS[kind] }))}
          error={errs[`${path}.type`]} disabled={off}
        />
        <div className="link-editor__stack">
          {value.type === 'route' && <RouteFields path={path} value={value} onChange={onChange} errors={errs} live={live} disabled={off} />}
          {value.type === 'external' && (
            <TextField
              label="Web address" type="url" inputMode="url" value={value.url} placeholder="https://" disabled={off} required
              onChange={(url) => onChange({ type: 'external', url })}
              error={firstError(errs, `${path}.url`) ?? live ?? undefined}
              hint="Must start with https://. On the website it opens in a new tab."
            />
          )}
          {value.type === 'document' && <DocumentFields path={path} value={value} onChange={onChange} errors={errs} disabled={off} />}
          {value.type === 'email' && (
            <TextField
              label="E-mail address" type="email" inputMode="email" value={value.address} disabled={off} required
              onChange={(address) => onChange({ type: 'email', address })}
              error={firstError(errs, `${path}.address`) ?? live ?? undefined}
            />
          )}
          {value.type === 'phone' && (
            <TextField
              label="Phone number" type="tel" inputMode="tel" value={value.number} disabled={off} required
              onChange={(number) => onChange({ type: 'phone', number })}
              error={firstError(errs, `${path}.number`) ?? live ?? undefined}
              hint={telLink
                ? <>Digits with an optional leading +; spaces and hyphens are removed. The link will dial <span className="ff__code">{telLink}</span>.</>
                : 'Digits with an optional leading +; spaces and hyphens are removed.'}
            />
          )}
        </div>
      </div>
    </fieldset>
  );
}

interface KindFieldsProps<T extends LinkTarget> {
  path: string;
  value: T;
  onChange: (next: LinkTarget) => void;
  errors: FieldErrors;
  disabled?: boolean;
}

/** Page select (pages, then sections of pages) and the optional section anchor. */
function RouteFields({ path, value, onChange, errors, live, disabled }: KindFieldsProps<Extract<LinkTarget, { type: 'route' }>> & { live: string | null }) {
  const { base, anchor } = splitRoutePath(value.path);
  return (
    <>
      <SiteSelect
        label="Page" required value={routeSelectValue(value.path)} placeholder="Choose a page" disabled={disabled}
        options={ROUTE_PAGE_OPTIONS} groups={[{ label: 'Sections of pages', options: ROUTE_SECTION_OPTIONS }]}
        onChange={(next) => onChange({ type: 'route', path: next })}
        error={firstError(errors, `${path}.path`) ?? live ?? undefined}
      />
      <TextField
        label="Section on the page (optional)" value={anchor} maxLength={64} disabled={disabled || base === ''}
        onChange={(next) => onChange({ type: 'route', path: joinRoutePath(base, next) })}
        hint={base === '' ? 'Choose a page first.' : 'The part after # in the address, for example policy-lists. Leave empty to open the top of the page.'}
      />
    </>
  );
}

/** Document picker. The list is loaded when this kind is chosen. */
function DocumentFields({ path, value, onChange, errors, disabled }: KindFieldsProps<Extract<LinkTarget, { type: 'document' }>>) {
  const documents = useSiteDocuments();
  const options = documents.data ?? [];
  const known = options.find((option) => option.value === value.documentId);
  const choices = value.documentId !== '' && !known && documents.data
    ? [{ value: value.documentId, label: `Unknown document (${value.documentId})` }, ...options]
    : options;
  const loadFailed = documents.error !== undefined && !documents.data;
  return (
    <>
      <SiteSelect
        label="Document" required value={value.documentId} disabled={disabled || (documents.loading && !documents.data)}
        placeholder={documents.loading && !documents.data ? 'Loading documents…' : 'Choose a document'} options={choices}
        onChange={(documentId) => onChange({ type: 'document', documentId })}
        error={firstError(errors, `${path}.documentId`)}
        hint={known && !known.published
          ? 'This document is not published yet, so the link stays hidden on the website until it is.'
          : 'Documents are managed under Documents. A document that is not published is hidden on the website.'}
      />
      {loadFailed && (
        <div className="form-actions">
          <p className="ff__error" role="alert">The list of documents could not be loaded.</p>
          <Button variant="secondary" size="sm" onClick={documents.reload}>Try again</Button>
        </div>
      )}
    </>
  );
}
