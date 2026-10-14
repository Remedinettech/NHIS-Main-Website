import type { DocumentRecord } from '@nhis/shared-types';
import { AUDIENCE_LABELS, CATEGORY_LABELS } from '../../config/app';
import { formatBytes } from '../../utils/format';
import { Badge } from '../common/Badge';
import { TableWrap } from '../common/TableWrap';

function DocumentRow({ doc }: { doc: DocumentRecord }) {
  return (
    <tr>
      <th scope="row">
        <div className="cell-stack">
          <span>{doc.label.en}</span>
          {doc.label.ta && <span lang="ta" className="text-muted">{doc.label.ta}</span>}
        </div>
      </th>
      <td>{CATEGORY_LABELS[doc.category]}</td>
      <td>{AUDIENCE_LABELS[doc.audience]}</td>
      <td>
        {doc.dateLabel.en || doc.dateLabel.ta ? (
          <div className="cell-stack">
            {doc.dateLabel.en && <span>{doc.dateLabel.en}</span>}
            {doc.dateLabel.ta && <span lang="ta" className="text-muted">{doc.dateLabel.ta}</span>}
          </div>
        ) : <span className="text-muted">–</span>}
      </td>
      <td className="num">{doc.pages ?? '–'}</td>
      <td className="num">{doc.bytes !== undefined ? formatBytes(doc.bytes) : '–'}</td>
      <td>{doc.availability === 'unavailable' ? <Badge tone="danger">Unavailable</Badge> : 'Available'}</td>
    </tr>
  );
}

export function DocumentTable({ documents }: { documents: readonly DocumentRecord[] }) {
  return (
    <TableWrap label="Documents">
      <table className="data-table data-table--wide">
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Category</th>
            <th scope="col">Audience</th>
            <th scope="col">Date</th>
            <th scope="col" className="num">Pages</th>
            <th scope="col" className="num">Size</th>
            <th scope="col">Availability</th>
          </tr>
        </thead>
        <tbody>{documents.map((d) => <DocumentRow key={d.id} doc={d} />)}</tbody>
      </table>
    </TableWrap>
  );
}
