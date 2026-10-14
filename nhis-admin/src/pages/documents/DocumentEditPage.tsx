import type { AdminAsset, AdminDocument, AdminDocumentValues, DocumentAudience, DocumentCategory } from '@nhis/shared-types';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BilingualFields } from '../../components/common/BilingualFields';
import { Card } from '../../components/common/Card';
import { FileUploadField } from '../../components/common/FileUploadField';
import { NumberField, SelectField, TextField, parseWholeNumber } from '../../components/common/fields';
import { RecordEditor, type EditorContext } from '../../components/records/RecordEditor';
import { CATEGORY_LABELS } from '../../config/app';
import { AUDIENCE_LABELS } from './DocumentsPage';
import { resolveApiUrl } from '../../utils/urls';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as DocumentCategory[];
const EMPTY: AdminDocumentValues = {
  category: 'enrolment-form', audience: 'all', sortOrder: 0, labelEn: '', labelTa: '', titleEn: '', titleTa: '',
  dateLabelEn: null, dateLabelTa: null, assetId: null, language: null, availabilityNote: null,
};

function validate(v: AdminDocumentValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.titleEn.trim()) errors.titleEn = 'Enter the document title in English.';
  if (!v.labelEn.trim()) errors.labelEn = 'Enter the full label in English.';
  if (!Number.isInteger(v.sortOrder) || v.sortOrder < 0) errors.sortOrder = 'Enter a whole number, 0 or higher.';
  return errors;
}

function Fields({ ctx }: { ctx: EditorContext<AdminDocumentValues, AdminDocument> }) {
  const { values, setField, errors, readOnly, record } = ctx;
  const [uploaded, setUploaded] = useState<AdminAsset | null>(null);
  const known: AdminAsset | null = uploaded && uploaded.id === values.assetId
    ? uploaded
    : record?.draftAsset?.id === values.assetId ? record.draftAsset : record?.asset?.id === values.assetId ? record.asset : null;

  return (
    <>
      <Card title="Document details" description="The title and label appear on the public website, in English and Tamil.">
        <div className="editor-section">
          <BilingualFields legend="Title" required requireTamil={false} english={values.titleEn} tamil={values.titleTa} maxLength={300}
            onEnglishChange={(x) => setField('titleEn', x)} onTamilChange={(x) => setField('titleTa', x)} englishError={errors.titleEn} tamilError={errors.titleTa} disabled={readOnly}
            hint="For example the order number, such as G.O.Ms.No.71." />
          <BilingualFields legend="Full label" required requireTamil={false} english={values.labelEn} tamil={values.labelTa} maxLength={300}
            onEnglishChange={(x) => setField('labelEn', x)} onTamilChange={(x) => setField('labelTa', x)} englishError={errors.labelEn} tamilError={errors.labelTa} disabled={readOnly}
            hint="The complete wording, including the date if it has one." />
          <div className="editor-grid">
            <TextField label="Date shown (English)" value={values.dateLabelEn ?? ''} onChange={(x) => setField('dateLabelEn', x.trim() ? x : null)} maxLength={80} disabled={readOnly} hint="For example 21 March 2022. Leave empty if there is none." error={errors.dateLabelEn} />
            <TextField label="Date shown (Tamil)" value={values.dateLabelTa ?? ''} onChange={(x) => setField('dateLabelTa', x.trim() ? x : null)} maxLength={80} lang="ta" disabled={readOnly} error={errors.dateLabelTa} />
          </div>
          <div className="editor-grid">
            <SelectField label="Category" required value={values.category} onChange={(x) => setField('category', x as DocumentCategory)} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} disabled={readOnly} error={errors.category} />
            <SelectField label="Audience" required value={values.audience} onChange={(x) => setField('audience', x as DocumentAudience)} options={(Object.keys(AUDIENCE_LABELS) as DocumentAudience[]).map((a) => ({ value: a, label: AUDIENCE_LABELS[a] }))} disabled={readOnly} error={errors.audience} />
            <SelectField label="Language of the file" value={values.language ?? ''} onChange={(x) => setField('language', x === 'en' || x === 'ta' ? x : null)} options={[{ value: 'en', label: 'English' }, { value: 'ta', label: 'Tamil' }]} placeholder="Not specific" disabled={readOnly} />
            <NumberField label="Order in lists" required value={String(values.sortOrder)} min={0} onChange={(x) => { const n = parseWholeNumber(x); if (n !== null) setField('sortOrder', n); }} disabled={readOnly} error={errors.sortOrder} hint="Lower numbers come first." />
          </div>
        </div>
      </Card>
      <Card title="File" description="Uploading or replacing a file is private until the document is published.">
        <div className="editor-section">
          <FileUploadField
            label="PDF file"
            kind="document"
            asset={known}
            disabled={readOnly}
            error={errors.assetId}
            onUploaded={(asset) => { setUploaded(asset); setField('assetId', asset.id); }}
            onRemove={values.assetId ? () => { setUploaded(null); setField('assetId', null); } : undefined}
          />
          {!values.assetId && <p className="editor-note">Without a file the document is listed as unavailable.</p>}
          {record?.asset && record.draftAsset && record.draftAsset.id !== record.asset.id && (
            <p className="editor-note">The published file is “{record.asset.originalName}”. The new file replaces it when this document is published.</p>
          )}
          {record?.asset && (
            <p><a className="ext-link" href={resolveApiUrl(record.asset.adminUrl)} target="_blank" rel="noopener noreferrer">Open the published file<span className="visually-hidden"> (opens in a new tab)</span></a></p>
          )}
          <TextField label="Note when no file is available" value={values.availabilityNote ?? ''} onChange={(x) => setField('availabilityNote', x.trim() ? x : null)} maxLength={300} disabled={readOnly} error={errors.availabilityNote} />
        </div>
      </Card>
    </>
  );
}

export default function DocumentEditPage() {
  const { id } = useParams();
  return (
    <RecordEditor<AdminDocumentValues, AdminDocument>
      module="documents"
      entityType="document"
      routeId={id}
      noun="document"
      newValues={EMPTY}
      listPath="/documents"
      editPath={(r) => `/documents/${encodeURIComponent(r.id)}`}
      recordName={(v) => v.titleEn}
      validate={validate}
    >
      {(ctx) => <Fields ctx={ctx} />}
    </RecordEditor>
  );
}
