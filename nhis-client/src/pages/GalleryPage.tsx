import { Navigate } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/common/StateViews';
import { PageHeader } from '../components/common/PageHeader';
import { useLanguage } from '../context/LanguageContext';
import { useGallery } from '../hooks/useContent';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { pickBilingual } from '../utils/locale';
import { safeExternalUrl } from '../utils/safeUrl';
import '../components/gallery/gallery.css';
import { resolveApiUrl } from '../utils/urls';

/** Gallery. Only genuine items supplied by the API are shown. */
export default function GalleryPage() {
  const { t, locale } = useLanguage();
  useDocumentTitle(t('gallery.title'));
  const { data, error, loading, reload } = useGallery();

  // A navigation entry must open a populated page: with nothing published, go back to the home page.
  if (data && data.data.length === 0) return <Navigate to="/" replace />;

  return (
    <div className="page container">
      <PageHeader title={t('gallery.title')} />
      {error && !data && <ErrorState error={error} titleKey="gallery.loadError" onRetry={reload} />}
      {loading && !data && <LoadingState rows={2} />}
      {data && data.data.length > 0 && (
        <ul className="gallery-grid">
          {data.data.map((item) => {
            const title = pickBilingual(item.title, locale);
            const src = item.imageUrl.startsWith('/') ? resolveApiUrl(item.imageUrl) : safeExternalUrl(item.imageUrl);
            return src ? (
              <li key={item.id}>
                <figure>
                  <img src={src} alt={title.text} loading="lazy" />
                  <figcaption lang={title.lang}>{title.text}</figcaption>
                </figure>
              </li>
            ) : null;
          })}
        </ul>
      )}
    </div>
  );
}
