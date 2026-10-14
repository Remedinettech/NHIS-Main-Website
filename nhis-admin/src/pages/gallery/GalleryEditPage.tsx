import type { AdminAsset, AdminGalleryItem, AdminGalleryValues } from '@nhis/shared-types';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BilingualFields } from '../../components/common/BilingualFields';
import { Card } from '../../components/common/Card';
import { FileUploadField } from '../../components/common/FileUploadField';
import { NumberField, parseWholeNumber } from '../../components/common/fields';
import { RecordEditor, type EditorContext } from '../../components/records/RecordEditor';
import { resolveApiUrl } from '../../utils/urls';

const EMPTY: AdminGalleryValues = { titleEn: '', titleTa: '', assetId: '', sortOrder: 0 };

function validate(v: AdminGalleryValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.assetId) errors.assetId = 'Upload an image.';
  if (!v.titleEn.trim()) errors.titleEn = 'Enter a caption in English.';
  if (!Number.isInteger(v.sortOrder) || v.sortOrder < 0) errors.sortOrder = 'Enter a whole number, 0 or higher.';
  return errors;
}

function Fields({ ctx }: { ctx: EditorContext<AdminGalleryValues, AdminGalleryItem> }) {
  const { values, setField, errors, readOnly, record } = ctx;
  const [uploaded, setUploaded] = useState<AdminAsset | null>(null);
  const shown = uploaded && uploaded.id === values.assetId ? uploaded : record?.asset && record.asset.id === values.assetId ? record.asset : null;
  return (
    <>
      <Card title="Image" description="JPEG, PNG or WebP. The image is private until the item is published.">
        <div className="editor-section">
          <FileUploadField label="Image file" required kind="image" asset={shown} disabled={readOnly} error={errors.assetId}
            onUploaded={(asset) => { setUploaded(asset); setField('assetId', asset.id); }} />
          {shown && <img className="preview-image" src={resolveApiUrl(shown.adminUrl)} alt="Preview of the chosen image" />}
        </div>
      </Card>
      <Card title="Caption and order">
        <div className="editor-section">
          <BilingualFields legend="Caption" required requireTamil={false} english={values.titleEn} tamil={values.titleTa} maxLength={200}
            onEnglishChange={(x) => setField('titleEn', x)} onTamilChange={(x) => setField('titleTa', x)} englishError={errors.titleEn} tamilError={errors.titleTa} disabled={readOnly} />
          <NumberField label="Order" value={String(values.sortOrder)} min={0} onChange={(x) => { const n = parseWholeNumber(x); if (n !== null) setField('sortOrder', n); }} disabled={readOnly} error={errors.sortOrder} hint="Lower numbers are shown first." />
        </div>
      </Card>
    </>
  );
}

export default function GalleryEditPage() {
  const { id } = useParams();
  return (
    <RecordEditor<AdminGalleryValues, AdminGalleryItem>
      module="gallery"
      entityType="gallery"
      routeId={id}
      noun="image"
      newValues={EMPTY}
      listPath="/gallery"
      editPath={(r) => `/gallery/${encodeURIComponent(r.id)}`}
      recordName={(v) => v.titleEn}
      validate={validate}
    >
      {(ctx) => <Fields ctx={ctx} />}
    </RecordEditor>
  );
}
