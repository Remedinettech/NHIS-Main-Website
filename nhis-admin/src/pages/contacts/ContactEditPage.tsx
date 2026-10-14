import type { AdminContact, AdminContactDirectory, AdminContactValues } from '@nhis/shared-types';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/common/Card';
import { NumberField, TextField, parseWholeNumber } from '../../components/common/fields';
import { ErrorState, LoadingState } from '../../components/common/StateViews';
import { RecordEditor } from '../../components/records/RecordEditor';
import { displayColumns } from '../../config/contactColumns';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useRecord } from '../../hooks/useRecord';
import { adminApi } from '../../services/client';

function Form({ directory, routeId }: { directory: AdminContactDirectory; routeId?: string }) {
  const columns = displayColumns(directory.id, directory.columns);
  const empty: AdminContactValues = { cells: Object.fromEntries(directory.columns.map((c) => [c.key, ''])), sortOrder: 0 };
  const listPath = `/contacts?directory=${encodeURIComponent(directory.id)}`;

  return (
    <RecordEditor<AdminContactValues, AdminContact>
      module="contacts"
      entityType="contact"
      routeId={routeId}
      noun="contact"
      newValues={empty}
      listPath={listPath}
      editPath={(r) => `/contacts/${encodeURIComponent(r.id)}`}
      recordName={(v) => columns.slice(0, 2).map((c) => v.cells[c.key]?.trim()).filter(Boolean).join(' – ')}
      createBody={(values) => ({ directoryId: directory.id, values })}
      validate={(v) => {
        const errors: Record<string, string> = {};
        if (Object.values(v.cells).every((c) => !c.trim())) errors.cells = 'Enter at least one value.';
        for (const c of columns) {
          const text = (v.cells[c.key] ?? '').trim();
          if (text && c.kind === 'email' && !/^\S+@\S+\.\S+/.test(text)) errors[`cells.${c.key}`] = 'Enter a valid e-mail address.';
          if (text && c.kind === 'phone' && !/\d{3,}/.test(text)) errors[`cells.${c.key}`] = 'Enter a phone number.';
        }
        return errors;
      }}
    >
      {({ values, setValues, setField, errors, readOnly }) => (
        <Card title={directory.labelEn} description="These values appear in this directory on the public Contact page.">
          <div className="editor-section">
            {errors.cells && <p className="ff__error" role="alert">{errors.cells}</p>}
            <div className="editor-grid">
              {columns.map((c) => (
                <TextField
                  key={c.key}
                  label={c.header}
                  value={values.cells[c.key] ?? ''}
                  onChange={(x) => setValues((cur) => ({ ...cur, cells: { ...cur.cells, [c.key]: x } }))}
                  maxLength={500}
                  type={c.kind === 'email' ? 'email' : 'text'}
                  inputMode={c.kind === 'phone' ? 'tel' : c.kind === 'email' ? 'email' : 'text'}
                  disabled={readOnly}
                  error={errors[`cells.${c.key}`]}
                />
              ))}
            </div>
            <NumberField label="Position in the directory" value={String(values.sortOrder)} min={0}
              onChange={(x) => { const n = parseWholeNumber(x); if (n !== null) setField('sortOrder', n); }} disabled={readOnly} error={errors.sortOrder}
              hint="Lower numbers come first." />
          </div>
        </Card>
      )}
    </RecordEditor>
  );
}

/** Resolves which directory a contact belongs to (from the record when editing, from ?directory= when adding). */
export default function ContactEditPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const record = useRecord<AdminContact>('contacts', id);
  const dirs = useAsyncData((signal) => adminApi.getJson<{ data: AdminContactDirectory[] }>('/contacts/directories', { signal }), []);

  const directoryId = id ? record.data?.directoryId : params.get('directory') ?? undefined;
  const directory = dirs.data?.data.find((d) => d.id === directoryId);

  if ((id && record.loading) || dirs.loading) return <div className="page"><LoadingState label="Loading…" rows={2} /></div>;
  if (record.error) return <div className="page"><ErrorState error={record.error} onRetry={record.reload} /></div>;
  if (dirs.error) return <div className="page"><ErrorState error={dirs.error} onRetry={dirs.reload} /></div>;
  if (!directory) return <div className="page"><ErrorState error={new Error('Unknown directory')} title="Choose a directory first" /></div>;
  return <Form directory={directory} routeId={id} />;
}
