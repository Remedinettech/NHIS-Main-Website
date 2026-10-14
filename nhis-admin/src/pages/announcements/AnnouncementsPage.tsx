import type { AdminAnnouncement } from '@nhis/shared-types';
import { Badge } from '../../components/common/Badge';
import { Icon } from '../../components/common/Icon';
import { LinkButton } from '../../components/common/Button';
import { PageHeader } from '../../components/common/PageHeader';
import { RecordList } from '../../components/records/RecordList';
import { useCan } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRecordList } from '../../hooks/useRecordList';
import { inlineToText } from '../../utils/format';

export const KIND_LABELS = { suspension: 'Hospital suspension', 'login-support': 'Login support', general: 'General notice' } as const;

const excerpt = (text: string) => (text.length > 110 ? `${text.slice(0, 110)}…` : text);

export default function AnnouncementsPage() {
  useDocumentTitle('Announcements');
  const canWrite = useCan('content.write');
  const list = useRecordList<AdminAnnouncement>('announcements');
  return (
    <div className="page">
      <PageHeader title="Announcements" intro="Notices shown at the top of the public website.">
        {canWrite && <div className="page__actions"><LinkButton to="/announcements/new"><Icon name="plus" size={18} /> Add announcement</LinkButton></div>}
      </PageHeader>
      <RecordList<AdminAnnouncement>
        module="announcements"
        list={list}
        noun={{ singular: 'announcement', plural: 'announcements' }}
        searchLabel="Search announcements"
        searchPlaceholder="Words in the message (English or Tamil)"
        routeId={(r) => r.id}
        recordName={(r) => excerpt(inlineToText(r.values.messageEn))}
        editPath={(r) => `/announcements/${encodeURIComponent(r.id)}`}
        columns={[
          {
            header: 'Message',
            rowHeader: true,
            render: (r) => (
              <div className="cell-stack">
                <span>{excerpt(inlineToText(r.values.messageEn))}</span>
                {r.values.messageTa.length > 0 && <span lang="ta" className="text-muted">{excerpt(inlineToText(r.values.messageTa))}</span>}
              </div>
            ),
          },
          { header: 'Type', render: (r) => <span>{KIND_LABELS[r.values.kind]}</span> },
          { header: 'Importance', render: (r) => (r.values.severity === 'warning' ? <Badge tone="warning">Important</Badge> : <Badge>Notice</Badge>) },
        ]}
      />
    </div>
  );
}
