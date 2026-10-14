import type { AdminContact, AdminContactDirectory, AdminListResponse } from '@nhis/shared-types';
import { useSearchParams } from 'react-router-dom';
import { LinkButton } from '../../components/common/Button';
import { Icon } from '../../components/common/Icon';
import { PageHeader } from '../../components/common/PageHeader';
import { ErrorState, LoadingState } from '../../components/common/StateViews';
import { Tabs } from '../../components/common/Tabs';
import { RecordList } from '../../components/records/RecordList';
import { displayColumns } from '../../config/contactColumns';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useCan } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRecordList } from '../../hooks/useRecordList';
import { adminApi } from '../../services/client';

const directoryName = (d: AdminContactDirectory) => d.labelEn;

function DirectoryList({ directory }: { directory: AdminContactDirectory }) {
  const canWrite = useCan('content.write');
  const list = useRecordList<AdminContact>('contacts', { fixed: { directoryId: directory.id } });
  const columns = displayColumns(directory.id, directory.columns);
  const summary = (r: AdminContact) => columns.slice(0, 2).map((c) => r.values.cells[c.key]?.trim()).filter(Boolean).join(' – ') || 'Contact';
  return (
    <>
      {canWrite && (
        <div className="page__actions">
          <LinkButton to={`/contacts/new?directory=${encodeURIComponent(directory.id)}`}><Icon name="plus" size={18} /> Add contact</LinkButton>
        </div>
      )}
      <RecordList<AdminContact>
        key={directory.id}
        module="contacts"
        list={list}
        noun={{ singular: 'contact', plural: 'contacts' }}
        searchLabel="Search this directory"
        searchPlaceholder="Name, district, office or number"
        routeId={(r) => r.id}
        recordName={summary}
        editPath={(r) => `/contacts/${encodeURIComponent(r.id)}`}
        columns={columns.map((c, i) => ({
          header: c.header,
          rowHeader: i === 0,
          render: (r: AdminContact) => (r.values.cells[c.key] ?? '').trim() || <span className="text-muted">–</span>,
        }))}
      />
    </>
  );
}

export default function ContactsPage() {
  useDocumentTitle('Contacts');
  const [params] = useSearchParams();
  const dirs = useAsyncData((signal) => adminApi.getJson<{ data: AdminContactDirectory[] }>('/contacts/directories', { signal }), []);
  const directories = dirs.data?.data ?? [];
  const active = directories.find((d) => d.id === params.get('directory')) ?? directories[0];

  return (
    <div className="page">
      <PageHeader title="Contacts" intro="Coordinators, nodal officers and treasury offices listed on the public Contact page." />
      {dirs.loading && !dirs.data && <LoadingState label="Loading directories…" rows={2} />}
      {dirs.error && !dirs.data && <ErrorState error={dirs.error} title="The directories could not be loaded" onRetry={dirs.reload} />}
      {active && (
        <>
          <Tabs
            label="Contact directories"
            activeId={active.id}
            items={directories.map((d) => ({ id: d.id, label: directoryName(d), meta: String(d.total), to: `/contacts?directory=${encodeURIComponent(d.id)}` }))}
          />
          <DirectoryList key={active.id} directory={active} />
        </>
      )}
    </div>
  );
}

export type { AdminListResponse };
