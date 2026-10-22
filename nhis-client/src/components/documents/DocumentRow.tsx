import type { DocumentRecord } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import type { MessageKey } from '../../locales';
import { formatBytes } from '../../utils/format';
import { pickBilingual } from '../../utils/locale';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { T } from '../common/T';
import './documents.css';
import { documentFileUrl } from '../../utils/urls';

/** Reusable document row: title, category, date from the label, size and a download action. */
export function DocumentRow({ doc }: { doc: DocumentRecord }) {
  const { t, locale } = useLanguage();
  const title = pickBilingual(doc.title, locale);
  const otherLocale = locale === 'en' ? 'ta' : 'en';
  const otherLabel = doc.label[otherLocale].trim();
  const showOtherLabel = otherLabel !== '' && otherLabel !== doc.label[locale].trim();
  const dateText = doc.dateLabel[locale] ?? doc.dateLabel[otherLocale];
  const href = documentFileUrl(doc.localPath);
  const available = doc.availability === 'available' && href !== undefined;
  const downloadName = pickBilingual(doc.label, locale).text;

  return (
    <li className={available ? 'doc-row' : 'doc-row doc-row--unavailable'}>
      <div className="doc-row__icon" aria-hidden="true"><Icon name="file" size={24} /></div>
      <div className="doc-row__main">
        <h3 className="doc-row__title" lang={title.lang}>{title.text}</h3>
        <p className="doc-row__meta">
          <Badge tone="neutral">{t(`documents.categories.${doc.category}` as MessageKey)}</Badge>
          {!available && <Badge tone="danger">{t('documents.unavailableBadge')}</Badge>}
          {dateText && (
            <span className="doc-row__date">
              <span className="text-muted">{t('documents.date')}: </span>
              <span lang={doc.dateLabel[locale] ? locale : otherLocale}>{dateText}</span>
            </span>
          )}
          {doc.pages !== undefined && <span className="text-muted">{t('documents.pagesCount', { count: doc.pages })}</span>}
          {doc.bytes !== undefined && <span className="text-muted">{formatBytes(doc.bytes)}</span>}
          {doc.language && <Badge tone="info">{doc.language === 'ta' ? t('documents.langTa') : t('documents.langEn')}</Badge>}
        </p>
        {showOtherLabel && <p className="doc-row__alt text-muted" lang={otherLocale}>{otherLabel}</p>}
        {!available && (
          <p className="doc-row__warning" role="note">
            <Icon name="alert" size={16} /> <T k="documents.unavailableNote" />
          </p>
        )}
      </div>
      <div className="doc-row__actions">
        {available ? (
          <>
            <a
              className="btn btn--primary btn--sm"
              href={href}
              download
              aria-label={t('documents.downloadAria', { title: downloadName })}
            >
              <Icon name="download" size={18} />
              <span>{t('common.download')}</span>
            </a>
            <a className="btn btn--secondary btn--sm" href={href} target="_blank" rel="noopener noreferrer">
              <span>{t('common.pdf')}</span>
              <Icon name="external" size={16} />
              <span className="visually-hidden"> {downloadName} ({t('common.opensInNewTab')})</span>
            </a>
          </>
        ) : (
          <span className="doc-row__none">{t('documents.unavailableAction')}</span>
        )}
      </div>
    </li>
  );
}
