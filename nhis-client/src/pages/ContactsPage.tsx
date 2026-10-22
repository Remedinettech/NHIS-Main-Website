import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { telHrefFor, type ContactDirectoryId } from '@nhis/shared-types';
import { ContactDirectoryPanel } from '../components/contacts/ContactDirectoryPanel';
import { ContactTabs } from '../components/contacts/ContactTabs';
import { ErrorState, LoadingState } from '../components/common/StateViews';
import { PageHeader } from '../components/common/PageHeader';
import { useLanguage } from '../context/LanguageContext';
import { useContactIndex } from '../hooks/useContent';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSiteContent } from '../hooks/useSiteContent';
import { pickBilingual } from '../utils/locale';
import '../components/contacts/contacts.css';

/** The four source contact directories, each with its own search; the active tab is kept in the URL. */
export default function ContactsPage() {
  const { t, locale } = useLanguage();
  useDocumentTitle(t('contacts.title'));
  const idPrefix = useId().replace(/:/g, '');
  const index = useContactIndex();
  const { header } = useSiteContent().content;
  const [params, setParams] = useSearchParams();
  const [queries, setQueries] = useState<Partial<Record<ContactDirectoryId, string>>>({});

  const helplines = header.helplines.filter((line) => line.visible);
  const directories = index.data?.data ?? [];
  const requested = params.get('directory');
  const active = (directories.find((d) => d.id === requested) ?? directories[0])?.id;

  return (
    <div className="page container contacts-page">
      <PageHeader title={t('contacts.title')} intro={t('contacts.intro')} />
      {helplines.length > 0 && (
        <section className="contact-helplines panel" aria-labelledby="contact-helplines-title">
          <h2 id="contact-helplines-title" className="contact-helplines__title">{t('contacts.helplines')}</h2>
          <ul>
            {helplines.map((line) => {
              const label = pickBilingual(line.label, locale);
              return <li key={line.id}><span lang={label.lang}>{label.text}</span>: <a href={telHrefFor(line.number)}>{line.number}</a></li>;
            })}
            {header.availability && <li>{t('contacts.timings')}: {header.availability}</li>}
          </ul>
        </section>
      )}
      {index.error && !index.data && <ErrorState error={index.error} titleKey="contacts.loadError" onRetry={index.reload} />}
      {index.loading && !index.data && <LoadingState rows={3} />}
      {active && (
        <div className="contact-directories">
          <ContactTabs
            directories={directories}
            active={active}
            idPrefix={idPrefix}
            onSelect={(id) => setParams((current) => {
              const next = new URLSearchParams(current);
              next.set('directory', id);
              return next;
            }, { replace: true })}
          />
          <ContactDirectoryPanel
            key={active}
            id={active}
            idPrefix={idPrefix}
            query={queries[active] ?? ''}
            onQueryChange={(value) => setQueries((current) => ({ ...current, [active]: value }))}
          />
        </div>
      )}
    </div>
  );
}
