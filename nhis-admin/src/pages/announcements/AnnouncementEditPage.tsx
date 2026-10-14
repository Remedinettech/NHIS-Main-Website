import type { AdminAnnouncement, AdminAnnouncementValues } from '@nhis/shared-types';
import { useParams } from 'react-router-dom';
import { Card } from '../../components/common/Card';
import { NumberField, SelectField, TextField, parseWholeNumber } from '../../components/common/fields';
import { InlineNodesEditor, useDocumentOptions } from '../../components/records/InlineNodesEditor';
import { RecordEditor } from '../../components/records/RecordEditor';
import { inlineToText } from '../../utils/format';
import { KIND_LABELS } from './AnnouncementsPage';

const EMPTY: AdminAnnouncementValues = {
  kind: 'general', severity: 'notice', messageEn: [{ type: 'text', text: '' }], messageTa: [], startsAt: null, endsAt: null, sortOrder: 0,
};

/** ISO <-> value of a datetime-local input (local time, minutes). */
const toLocal = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function validate(v: AdminAnnouncementValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!inlineToText(v.messageEn)) errors.messageEn = 'Enter the message in English.';
  if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) errors.endsAt = 'The end must be after the start.';
  return errors;
}

export default function AnnouncementEditPage() {
  const { id } = useParams();
  const documents = useDocumentOptions();
  return (
    <RecordEditor<AdminAnnouncementValues, AdminAnnouncement>
      module="announcements"
      entityType="announcement"
      routeId={id}
      noun="announcement"
      newValues={EMPTY}
      listPath="/announcements"
      editPath={(r) => `/announcements/${encodeURIComponent(r.id)}`}
      recordName={(v) => inlineToText(v.messageEn).slice(0, 60)}
      validate={validate}
    >
      {({ values, setField, errors, readOnly }) => (
        <>
          <Card title="Message" description="The notice appears at the top of the public website in the visitor’s language.">
            <div className="editor-section">
              <InlineNodesEditor label="Message in English" required path="messageEn" nodes={values.messageEn} onChange={(n) => setField('messageEn', n)} documents={documents} errors={errors} lang="en" disabled={readOnly}
                hint="Add text, then optional links such as a document to download." />
              <InlineNodesEditor label="Message in Tamil" path="messageTa" nodes={values.messageTa} onChange={(n) => setField('messageTa', n)} documents={documents} errors={errors} lang="ta" disabled={readOnly}
                hint="Leave empty to show the English message to Tamil visitors." />
            </div>
          </Card>
          <Card title="Type and timing">
            <div className="editor-section">
              <div className="editor-grid">
                <SelectField label="Type" value={values.kind} onChange={(x) => setField('kind', x as AdminAnnouncementValues['kind'])} options={(Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))} disabled={readOnly} error={errors.kind} />
                <SelectField label="Importance" value={values.severity} onChange={(x) => setField('severity', x as AdminAnnouncementValues['severity'])} options={[{ value: 'notice', label: 'Notice' }, { value: 'warning', label: 'Important (highlighted)' }]} disabled={readOnly} error={errors.severity} />
                <NumberField label="Order" value={String(values.sortOrder)} min={0} onChange={(x) => { const n = parseWholeNumber(x); if (n !== null) setField('sortOrder', n); }} disabled={readOnly} error={errors.sortOrder} hint="Lower numbers are shown first." />
              </div>
              <div className="editor-grid">
                <TextField label="Show from" type="datetime-local" value={toLocal(values.startsAt)} onChange={(x) => setField('startsAt', fromLocal(x))} disabled={readOnly} error={errors.startsAt} hint="Optional. Your local time." />
                <TextField label="Show until" type="datetime-local" value={toLocal(values.endsAt)} onChange={(x) => setField('endsAt', fromLocal(x))} disabled={readOnly} error={errors.endsAt} hint="Optional. The notice hides itself after this time." />
              </div>
            </div>
          </Card>
        </>
      )}
    </RecordEditor>
  );
}
