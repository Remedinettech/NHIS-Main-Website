import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DocumentRecord } from '@nhis/shared-types';
import { ErrorState, LoadingState } from '../components/common/StateViews';
import { PageHeader } from '../components/common/PageHeader';
import { SearchField } from '../components/common/SearchField';
import { DocumentGroup } from '../components/documents/DocumentGroup';
import { useDocumentRegistry } from '../context/DocumentsContext';
import { useLanguage } from '../context/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { matchesAllWords } from '../utils/text';

const searchable = (doc: DocumentRecord) =>
  [doc.label.en, doc.label.ta, doc.title.en, doc.title.ta, doc.dateLabel.en ?? '', doc.dateLabel.ta ?? ''].join(' ');

/** Government orders grouped by audience, in the order of the source menu, with a search over source labels. */
export default function GovernmentOrdersPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('documents.ordersTitle'));
  const { state } = useDocumentRegistry();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';

  const groups = useMemo(() => {
    const all = state.data?.data ?? [];
    const pick = (category: DocumentRecord['category']) =>
      all.filter((doc) => doc.category === category).sort((a, b) => a.order - b.order);
    const employee = pick('govt-order-employee');
    const pensioner = pick('govt-order-pensioner');
    const filter = (docs: DocumentRecord[]) => docs.filter((doc) => matchesAllWords(searchable(doc), query));
    return { employee, pensioner, employeeShown: filter(employee), pensionerShown: filter(pensioner) };
  }, [state.data, query]);

  const setQuery = (value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set('q', value);
      else next.delete('q');
      return next;
    }, { replace: true });

  return (
    <div className="page container">
      <PageHeader title={t('documents.ordersTitle')} intro={t('documents.ordersIntro')} />
      {state.error && !state.data && <ErrorState error={state.error} titleKey="documents.loadError" onRetry={state.reload} />}
      {state.loading && !state.data && <LoadingState rows={4} />}
      {state.data && (
        <>
          <div className="doc-toolbar">
            <SearchField label={t('documents.searchLabel')} value={query} onChange={setQuery} placeholder={t('documents.searchPlaceholder')} name="q" />
          </div>
          <ul className="doc-anchors" aria-label={t('common.onThisPage')}>
            <li><a href="#employee-orders">{t('documents.employeeGroup')} ({groups.employee.length})</a></li>
            <li><a href="#pensioner-orders">{t('documents.pensionerGroup')} ({groups.pensioner.length})</a></li>
          </ul>
          <DocumentGroup id="employee-orders" heading={t('documents.employeeGroup')} documents={groups.employeeShown} total={groups.employee.length} />
          <DocumentGroup id="pensioner-orders" heading={t('documents.pensionerGroup')} documents={groups.pensionerShown} total={groups.pensioner.length} />
        </>
      )}
    </div>
  );
}
