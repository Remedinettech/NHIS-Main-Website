import type { AdminGalleryItem } from '@nhis/shared-types';
import { Icon } from '../../components/common/Icon';
import { LinkButton } from '../../components/common/Button';
import { PageHeader } from '../../components/common/PageHeader';
import { RecordList } from '../../components/records/RecordList';
import { useCan } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRecordList } from '../../hooks/useRecordList';
import { resolveApiUrl } from '../../utils/urls';

export default function GalleryPage() {
  useDocumentTitle('Gallery');
  const canWrite = useCan('content.write');
  const list = useRecordList<AdminGalleryItem>('gallery');
  return (
    <div className="page">
      <PageHeader title="Gallery" intro="Photographs shown in the public gallery. The Gallery page appears on the website once an item is published.">
        {canWrite && <div className="page__actions"><LinkButton to="/gallery/new"><Icon name="plus" size={18} /> Add image</LinkButton></div>}
      </PageHeader>
      <RecordList<AdminGalleryItem>
        module="gallery"
        list={list}
        noun={{ singular: 'image', plural: 'images' }}
        searchLabel="Search images"
        searchPlaceholder="Caption (English or Tamil)"
        routeId={(r) => r.id}
        recordName={(r) => r.values.titleEn || r.values.titleTa}
        editPath={(r) => `/gallery/${encodeURIComponent(r.id)}`}
        emptyHint="Add the first image to start the gallery."
        columns={[
          { header: 'Image', render: (r) => <img src={resolveApiUrl(r.asset.adminUrl)} alt="" width="72" height="54" loading="lazy" className="thumb" /> },
          {
            header: 'Caption',
            rowHeader: true,
            render: (r) => (
              <div className="cell-stack">
                <span>{r.values.titleEn}</span>
                {r.values.titleTa.trim() && <span lang="ta" className="text-muted">{r.values.titleTa}</span>}
              </div>
            ),
          },
          { header: 'Order', render: (r) => <span>{r.values.sortOrder}</span> },
        ]}
      />
    </div>
  );
}
