import type { AdminPage } from '@nhis/shared-types';
import { Badge } from '../../components/common/Badge';
import { PageHeader } from '../../components/common/PageHeader';
import { RecordList } from '../../components/records/RecordList';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRecordList } from '../../hooks/useRecordList';

export const PAGE_NAMES: Record<string, string> = {
  'employee-policy': 'Employee policy',
  'pensioner-policy': 'Pensioner policy',
  coverage: 'Coverage',
  eligibility: 'Eligibility',
  'how-to-enroll': 'How to enroll',
  forms: 'Forms and downloads',
  grievances: 'Grievances',
  gallery: 'Gallery',
};

export default function PagesListPage() {
  useDocumentTitle('Website pages');
  const list = useRecordList<AdminPage>('pages');
  return (
    <div className="page">
      <PageHeader title="Website pages" intro="Edit bilingual policy and grievance pages, including text, pictures, officer tables and download links. Changes stay private until published." />
      <RecordList<AdminPage>
        module="pages"
        list={list}
        noun={{ singular: 'page', plural: 'pages' }}
        searchLabel="Search pages"
        searchPlaceholder="Page name or title"
        routeId={(r) => r.slug}
        recordName={(r) => PAGE_NAMES[r.slug] ?? r.slug}
        editPath={(r) => `/pages/${encodeURIComponent(r.slug)}`}
        exclude={['unpublish', 'archive', 'restore', 'delete']}
        columns={[
          {
            header: 'Page',
            rowHeader: true,
            render: (r) => (
              <div className="cell-stack">
                <span>{PAGE_NAMES[r.slug] ?? r.slug}</span>
                <span className="text-muted">{r.values.en?.title ?? r.values.ta?.title}</span>
              </div>
            ),
          },
          {
            header: 'Languages',
            render: (r) => (
              <span className="cell-badges">
                <Badge tone={r.values.en ? 'info' : 'neutral'}>{r.values.en ? 'English' : 'No English'}</Badge>
                <Badge tone={r.values.ta ? 'info' : 'neutral'}>{r.values.ta ? 'Tamil' : 'No Tamil'}</Badge>
              </span>
            ),
          },
          { header: 'Linked documents', render: (r) => <span>{r.documentIds.length}</span> },
        ]}
      />
    </div>
  );
}
