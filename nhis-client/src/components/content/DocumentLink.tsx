import { useDocumentRegistry } from '../../context/DocumentsContext';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from '../common/Icon';
import { pickBilingual } from '../../utils/locale';
import { cx } from '../../utils/classNames';
import './content.css';
import { documentFileUrl } from '../../utils/urls';

interface DocumentLinkProps {
  documentId: string;
  /** Link text exactly as in the source. */
  text: string;
  /** Render as a button-style link (block level "View all" / "Download" actions). */
  asButton?: boolean;
  lang?: string;
}

/**
 * Link to a registry document. Available PDFs open the unchanged local copy in a new tab.
 * Unavailable documents are shown as plain text with an explicit marker, never silently dropped.
 */
export function DocumentLink({ documentId, text, asButton, lang }: DocumentLinkProps) {
  const { t, locale } = useLanguage();
  const { byId } = useDocumentRegistry();
  const doc = byId.get(documentId);
  const title = doc ? pickBilingual(doc.label, locale).text : '';
  const href = doc ? documentFileUrl(doc.localPath) : undefined;

  if (!doc) {
    // Registry still loading, or the id is unknown: show the source text without a dead link.
    return <span lang={lang}>{text}</span>;
  }
  if (doc.availability === 'unavailable' || !href) {
    return (
      <span className="doc-link doc-link--unavailable" lang={lang}>
        {text} <span className="doc-link__flag">({t('documents.unavailableBadge')})</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      lang={lang}
      className={cx('doc-link', asButton && 'btn btn--secondary')}
    >
      <Icon name="file" size={asButton ? 18 : 16} className="doc-link__icon" />
      {text}
      <span className="visually-hidden">
        {' '}— {title} ({t('common.pdf')}, {t('common.opensInNewTab')})
      </span>
    </a>
  );
}
