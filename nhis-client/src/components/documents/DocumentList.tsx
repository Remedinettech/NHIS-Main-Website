import type { DocumentRecord } from '@nhis/shared-types';
import { DocumentRow } from './DocumentRow';
import './documents.css';

export function DocumentList({ documents, labelledBy }: { documents: ReadonlyArray<DocumentRecord>; labelledBy?: string }) {
  return (
    <ul className="doc-list" aria-labelledby={labelledBy}>
      {documents.map((doc) => <DocumentRow key={doc.id} doc={doc} />)}
    </ul>
  );
}
