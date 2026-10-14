import type { DocumentRecord } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { DocumentList } from './DocumentList';
import './documents.css';

interface DocumentGroupProps {
  id: string;
  heading: string;
  documents: ReadonlyArray<DocumentRecord>;
  /** Total in the group before filtering, so a search does not hide how many exist. */
  total?: number;
}

export function DocumentGroup({ id, heading, documents, total }: DocumentGroupProps) {
  const { t } = useLanguage();
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="doc-group" aria-labelledby={headingId}>
      <div className="doc-group__head">
        <h2 id={headingId}>{heading}</h2>
        <Badge tone="info">{t('documents.groupCount', { count: total ?? documents.length })}</Badge>
      </div>
      {documents.length > 0 ? <DocumentList documents={documents} labelledBy={headingId} /> : <p className="text-muted">{t('documents.noMatch')}</p>}
    </section>
  );
}
