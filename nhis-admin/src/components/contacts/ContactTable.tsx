import type { ContactDirectory, ContactRow } from '@nhis/shared-types';
import { displayColumns } from '../../config/contactColumns';
import { TableWrap } from '../common/TableWrap';
import { tidy } from '../../utils/text';

interface ContactTableProps { directory: ContactDirectory; rows: readonly ContactRow[] }

/** Friendly headings over the columns of a directory; cell values are shown exactly as stored. */
export function ContactTable({ directory, rows }: ContactTableProps) {
  const columns = displayColumns(directory.id, directory.columns);
  return (
    <TableWrap label={`${directory.label.en} rows`}>
      <table className="data-table data-table--min">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => <td key={c.key} className={c.kind === 'text' ? undefined : 'nowrap'}>{tidy(row.cells[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
