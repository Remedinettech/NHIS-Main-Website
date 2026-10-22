import type { AdminDocument, DocumentAudience, DocumentCategory } from '@nhis/shared-types';
import { FilterSelect } from '../../components/common/FilterSelect';
import { Icon } from '../../components/common/Icon';
import { LinkButton } from '../../components/common/Button';
import { PageHeader } from '../../components/common/PageHeader';
import { RecordList } from '../../components/records/RecordList';
import { CATEGORY_LABELS } from '../../config/app';
import { useCan } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRecordList } from '../../hooks/useRecordList';
import { formatBytes } from '../../utils/format';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as DocumentCategory[];
export const AUDIENCE_LABELS: Record<DocumentAudience, string> = { employee: 'Employees', pensioner: 'Pensioners', all: 'Everyone' };

export default function DocumentsPage() {
  useDocumentTitle('Documents & downloads');
  const canWrite = useCan('content.write');
  const list = useRecordList<AdminDocument>('documents', { filterKeys: ['category', 'audience'] });

  return (
    <div className="page">
      <PageHeader title="Documents & downloads" intro="Government orders, forms and guides available for download on the public website.">
        {canWrite && (
          <div className="page__actions">
            <LinkButton to="/imports?module=documents" variant="secondary">Import from Excel</LinkButton>
            <LinkButton to="/documents/new"><Icon name="plus" size={18} /> Add document</LinkButton>
          </div>
        )}
      </PageHeader>
      <RecordList<AdminDocument>
        module="documents"
        list={list}
        noun={{ singular: 'document', plural: 'documents' }}
        searchLabel="Search documents"
        searchPlaceholder="Title or order number (English or Tamil)"
        routeId={(r) => r.id}
        recordName={(r) => r.values.titleEn || r.values.labelEn}
        editPath={(r) => `/documents/${encodeURIComponent(r.id)}`}
        filters={(
          <>
            <FilterSelect label="Category" value={list.query.filters.category} onChange={(v) => list.setQuery({ filters: { category: v } })}
              options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]} />
            <FilterSelect label="Audience" value={list.query.filters.audience} onChange={(v) => list.setQuery({ filters: { audience: v } })}
              options={[{ value: '', label: 'Everyone' }, ...(Object.keys(AUDIENCE_LABELS) as DocumentAudience[]).map((a) => ({ value: a, label: AUDIENCE_LABELS[a] }))]} />
          </>
        )}
        columns={[
          {
            header: 'Document',
            render: (r) => (
              <div className="cell-stack">
                <span>{r.values.labelEn}</span>
                {r.values.labelTa.trim() && <span lang="ta" className="text-muted">{r.values.labelTa}</span>}
              </div>
            ),
          },
          { header: 'Category', render: (r) => <span>{CATEGORY_LABELS[r.values.category] ?? r.values.category}</span> },
          { header: 'Audience', render: (r) => <span>{AUDIENCE_LABELS[r.values.audience]}</span> },
          {
            header: 'File',
            render: (r) => {
              const asset = r.draftAsset ?? r.asset;
              return asset ? <span className="nowrap">{formatBytes(asset.bytes)}{r.draftAsset ? ' (new file, unpublished)' : ''}</span> : <span className="text-muted">No file</span>;
            },
          },
        ]}
      />
    </div>
  );
}
