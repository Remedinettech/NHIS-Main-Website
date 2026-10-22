import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { FilterSelect } from '../../components/common/FilterSelect';
import { PageHeader } from '../../components/common/PageHeader';
import { Pagination } from '../../components/common/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/StateViews';
import { TableWrap } from '../../components/common/TableWrap';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listAudit } from '../../services/admin.api';
import { formatNumber } from '../../utils/format';

const ENTITY_TYPES = [
  { value: '', label: 'All content' },
  { value: 'site-content', label: 'Site content' },
  { value: 'content-import', label: 'Excel imports' },
  { value: 'hospital', label: 'Hospitals' },
  { value: 'page', label: 'Pages' },
  { value: 'document', label: 'Documents' },
  { value: 'contact', label: 'Contacts' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'asset', label: 'Uploaded files' },
  { value: 'settings', label: 'Settings' },
  { value: 'user', label: 'Users' },
  { value: 'session', label: 'Sign-ins' },
];

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created', UPDATE: 'Edited', PUBLISH: 'Published', UNPUBLISH: 'Unpublished', ARCHIVE: 'Archived', RESTORE: 'Restored',
  DISCARD_DRAFT: 'Discarded draft', DELETE: 'Deleted', UPLOAD: 'Uploaded', LOGIN: 'Signed in', LOGOUT: 'Signed out', LOGIN_FAILED: 'Failed sign-in',
  IMPORT_START: 'Import started', IMPORT_ROW: 'Import in progress', IMPORT_COMPLETE: 'Import finished',
};

/** Who changed what and when. Read-only history from the audit log. */
export default function ActivityPage() {
  useDocumentTitle('Change history');
  const [params, setParams] = useSearchParams();
  const entityType = params.get('entityType') ?? '';
  const entityId = params.get('entityId') ?? '';
  const [page, setPage] = useState(1);
  const list = useAsyncData(
    (signal) => listAudit({ entityType: entityType || undefined, entityId: entityId || undefined, page, pageSize: 25 }, signal),
    [entityType, entityId, page],
  );
  const data = list.data;

  const update = (patch: { entityType?: string; entityId?: string }) => {
    setPage(1);
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
      return next;
    }, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader title="Change history" intro="A record of changes: who did what, and when." />
      <Card>
        <div className="filters filters--record">
          <FilterSelect label="Show" value={entityType} onChange={(value) => update({ entityType: value })} options={ENTITY_TYPES} />
        </div>
        {entityId && (
          <div className="filters__clear">
            <Badge tone="info">Filtered to one record</Badge>{' '}
            <Button variant="ghost" size="sm" onClick={() => update({ entityId: '' })}>Show all activity</Button>
          </div>
        )}
      </Card>

      {list.loading && !data && <LoadingState label="Loading activity…" rows={4} />}
      {list.error && !data && <ErrorState error={list.error} title="The activity could not be loaded" onRetry={list.reload} />}
      {data && (
        <section aria-label="Results" className="stack">
          <p role="status" aria-live="polite" className="text-muted result-count">{formatNumber(data.total)} {data.total === 1 ? 'entry' : 'entries'}{list.refreshing ? ' (updating…)' : ''}</p>
          {data.total === 0 ? <EmptyState title="No activity yet">Changes will appear here as they are made.</EmptyState> : (
            <>
              <TableWrap label="Activity">
                <table className="data-table data-table--wide">
                  <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Details</th></tr></thead>
                  <tbody>
                    {data.data.map((entry) => (
                      <tr key={entry.id}>
                        <td className="nowrap">{new Date(entry.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td>{entry.actorEmail ?? <span className="text-muted">System</span>}</td>
                        <td><Badge>{ACTION_LABELS[entry.action] ?? entry.action}</Badge></td>
                        <td>{entry.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
