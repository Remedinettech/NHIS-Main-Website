import type { AdminRecordMeta } from '@nhis/shared-types';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { StatusFilter, UseRecordList } from '../../hooks/useRecordList';
import type { ModuleName } from '../../services/records.api';
import type { RecordAction } from '../../utils/capabilities';
import { formatNumber } from '../../utils/format';
import { Card } from '../common/Card';
import { FilterSelect } from '../common/FilterSelect';
import { Pagination } from '../common/Pagination';
import { SearchField } from '../common/SearchField';
import { EmptyState, ErrorState, LoadingState } from '../common/StateViews';
import { StatusBadge } from '../common/StatusBadge';
import { TableWrap } from '../common/TableWrap';
import { RecordActions } from '../common/RecordActions';
import { Button } from '../common/Button';
import './records.css';

export interface RecordColumn<T> { header: string; render: (record: T) => ReactNode; rowHeader?: boolean }

interface RecordListProps<T extends { id: string; meta: AdminRecordMeta }> {
  module: ModuleName;
  list: UseRecordList<T>;
  columns: ReadonlyArray<RecordColumn<T>>;
  /** Accessible name of the table and noun used in counts ("hospital"/"hospitals"). */
  noun: { singular: string; plural: string };
  searchLabel: string;
  searchPlaceholder: string;
  /** Identifier used in URLs (id, or slug for pages). */
  routeId: (record: T) => string;
  recordName: (record: T) => string;
  editPath: (record: T) => string;
  /** Extra filter controls shown next to search and status. */
  filters?: ReactNode;
  exclude?: readonly RecordAction[];
  emptyHint?: string;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
];

/** Search + status filter + table + pagination shared by every content module. All filtering happens on the server. */
export function RecordList<T extends { id: string; meta: AdminRecordMeta }>({
  module, list, columns, noun, searchLabel, searchPlaceholder, routeId, recordName, editPath, filters, exclude, emptyHint,
}: RecordListProps<T>) {
  const { data, error, loading, refreshing, reload, query, setQuery, setPage } = list;
  const [text, setText] = useState(query.q);
  const debounced = useDebouncedValue(text, 300);
  const lastPushed = useRef(query.q);

  useEffect(() => {
    if (debounced.trim() !== lastPushed.current) {
      lastPushed.current = debounced.trim();
      setQuery({ q: debounced.trim() });
    }
  }, [debounced, setQuery]);
  useEffect(() => {
    if (query.q !== lastPushed.current) { lastPushed.current = query.q; setText(query.q); }
  }, [query.q]);

  const hasFilters = Boolean(query.q || query.status !== 'ALL' || Object.values(query.filters).some(Boolean));
  const clear = () => {
    lastPushed.current = '';
    setText('');
    setQuery({ q: '', status: 'ALL', filters: Object.fromEntries(Object.keys(query.filters).map((k) => [k, ''])) });
  };

  const first = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <>
      <Card>
        <div className="filters filters--record">
          <SearchField label={searchLabel} value={text} onChange={setText} placeholder={searchPlaceholder} />
          <FilterSelect label="Status" value={query.status} onChange={(value) => setQuery({ status: value as StatusFilter })} options={STATUS_OPTIONS} />
          {filters}
        </div>
        {hasFilters && <div className="filters__clear"><Button variant="ghost" size="sm" onClick={clear}>Clear search and filters</Button></div>}
      </Card>

      {loading && !data && <LoadingState label={`Loading ${noun.plural}…`} rows={4} />}
      {error && !data && <ErrorState error={error} title={`The ${noun.plural} could not be loaded`} onRetry={reload} />}
      {data && (
        <section aria-label="Results" className="stack">
          {error && <ErrorState error={error} title="The list could not be refreshed" onRetry={reload} />}
          <p role="status" aria-live="polite" className="text-muted result-count">
            {data.total === 0 ? `No ${noun.plural} match.` : `Showing ${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(data.total)} ${data.total === 1 ? noun.singular : noun.plural}`}
            {refreshing ? ' (updating…)' : ''}
          </p>
          {data.total === 0 ? (
            <EmptyState title={`No ${noun.plural} found`}>{emptyHint ?? 'Change or clear the search and filters.'}</EmptyState>
          ) : (
            <>
              <TableWrap label={`${noun.plural[0].toUpperCase()}${noun.plural.slice(1)}`}>
                <table className="data-table data-table--wide">
                  <thead>
                    <tr>
                      {columns.map((c) => <th key={c.header} scope="col">{c.header}</th>)}
                      <th scope="col">Status</th>
                      <th scope="col"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((record) => (
                      <tr key={record.id}>
                        {columns.map((c, i) => (c.rowHeader || (i === 0 && columns.every((x) => !x.rowHeader))
                          ? <th scope="row" key={c.header}>{c.render(record)}</th>
                          : <td key={c.header}>{c.render(record)}</td>))}
                        <td><StatusBadge status={record.meta.status} hasDraft={record.meta.hasDraft} /></td>
                        <td className="record-actions-cell">
                          <Link className="btn btn--secondary btn--sm" to={editPath(record)}>
                            {record.meta.status === 'ARCHIVED' ? 'View' : 'Edit'}
                            <span className="visually-hidden"> {recordName(record)}</span>
                          </Link>
                          <RecordActions
                            module={module}
                            id={routeId(record)}
                            meta={record.meta}
                            name={recordName(record)}
                            onChanged={reload}
                            exclude={['edit', ...(exclude ?? [])]}
                          />
                        </td>
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
    </>
  );
}
