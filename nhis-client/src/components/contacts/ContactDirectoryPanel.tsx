import { useMemo } from 'react';
import type { ContactDirectoryId } from '@nhis/shared-types';
import { CONTACT_COLUMN_LABELS } from '../../config/contactColumns';
import { useLanguage } from '../../context/LanguageContext';
import { useContactDirectory } from '../../hooks/useContent';
import type { MessageKey } from '../../locales';
import { matchesAllWords } from '../../utils/text';
import { SearchField } from '../common/SearchField';
import { EmptyState, ErrorState, LoadingState } from '../common/StateViews';
import { Button } from '../common/Button';
import { ContactCell } from './ContactCell';
import './contacts.css';

interface ContactDirectoryPanelProps {
  id: ContactDirectoryId;
  query: string;
  onQueryChange: (value: string) => void;
  idPrefix: string;
}

/** One directory: independent search and a table (stacked cards on small screens). */
export function ContactDirectoryPanel({ id, query, onQueryChange, idPrefix }: ContactDirectoryPanelProps) {
  const { t } = useLanguage();
  const { data, error, loading, reload } = useContactDirectory(id);
  const directory = data?.data;

  const rows = useMemo(() => {
    if (!directory) return [];
    return directory.rows.filter((row) => matchesAllWords(Object.values(row.cells).join(' '), query));
  }, [directory, query]);

  const label = t(`contacts.directories.${id}` as MessageKey);
  const headingFor = (key: string, fallback: string) => {
    const labelKey = CONTACT_COLUMN_LABELS[id][key];
    return labelKey ? t(labelKey) : fallback;
  };

  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className="contact-panel" tabIndex={0}>
      {loading && !directory && <LoadingState rows={3} />}
      {error && !directory && <ErrorState error={error} titleKey="contacts.loadError" onRetry={reload} />}
      {directory && (
        <>
          <div className="contact-tools">
            <SearchField
              label={t('contacts.searchLabel')}
              value={query}
              onChange={onQueryChange}
              placeholder={t('contacts.searchPlaceholder')}
              name={`q-${id}`}
            />
            <p className="contact-tools__count" role="status" aria-live="polite">
              {t('contacts.rowCount', { shown: rows.length, total: directory.total })}
            </p>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              title={t('contacts.noMatch')}
              action={query ? <Button variant="secondary" onClick={() => onQueryChange('')}>{t('common.clear')}</Button> : undefined}
            />
          ) : (
            <div className="contact-table-wrap">
              <table className="contact-table" role="table">
                <caption className="visually-hidden">{label}</caption>
                <thead>
                  <tr role="row">
                    {directory.columns.map((column) => (
                      <th key={column.key} scope="col" role="columnheader">{headingFor(column.key, column.header)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} role="row">
                      {directory.columns.map((column) => (
                        <td key={column.key} role="cell" data-label={headingFor(column.key, column.header)}>
                          <ContactCell column={column} value={(row.cells[column.key] ?? '').trim()} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
