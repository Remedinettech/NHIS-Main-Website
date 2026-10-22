import { Navigate } from 'react-router-dom';
import type { GalleryItem, GalleryResponse, Locale, PageContent, PageResponse } from '@nhis/shared-types';
import { ErrorState, LoadingState } from '../components/common/StateViews';
import { PageHeader } from '../components/common/PageHeader';
import { ContentPageView } from '../components/content/ContentPageView';
import { ROUTES } from '../config/routes';
import { useLanguage } from '../context/LanguageContext';
import { usePage, useGallery } from '../hooks/useContent';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ApiRequestError } from '../services/http';
import type { AsyncState } from '../types/async';
import { pickBilingual } from '../utils/locale';
import { displayedPageContent, hasPageContent } from '../utils/pageContent';
import { galleryImageUrl } from '../utils/siteImages';
import '../components/gallery/gallery.css';

/** What the Gallery route shows, from the answers of the gallery and of the Pages-module page "gallery". */
export type GalleryPageState =
  | { kind: 'loading' }
  /** The page cannot be judged (its request failed) and the gallery is empty, so there is nothing to show but the failure. */
  | { kind: 'error'; error: Error; retry: 'gallery' | 'page' }
  /** No picture and no text: a link to this page must not lead to an empty page, so the visitor goes to the home page. */
  | { kind: 'redirect' }
  /** `page` is the page text to show above the pictures (only when it has content); `itemsError` is set when the pictures could not be loaded. */
  | { kind: 'ready'; page: PageContent | undefined; items: GalleryItem[]; itemsError: Error | undefined };

type Answer<T> = Pick<AsyncState<T>, 'data' | 'error'>;

/** A page that does not exist (HTTP 404) is a page without content, not a failure. */
const isMissing = (error: Error | undefined): boolean => error instanceof ApiRequestError && error.kind === 'http' && error.status === 404;

/**
 * Decides what the Gallery route shows. The route is a populated page when it has pictures or when the page "gallery" has
 * text (written in the Admin under Pages); with neither it redirects to the home page.
 */
export function galleryPageState(gallery: Answer<GalleryResponse>, pageAnswer: Answer<PageResponse>, locale: Locale): GalleryPageState {
  const items = gallery.data?.data ?? [];
  const page = pageAnswer.data?.data;
  const pageSettled = page !== undefined || pageAnswer.error !== undefined;
  const gallerySettled = gallery.data !== undefined || gallery.error !== undefined;
  if (!pageSettled || !gallerySettled) return { kind: 'loading' };

  const content = hasPageContent(page, locale) ? page : undefined;
  if (items.length > 0 || content) return { kind: 'ready', page: content, items, itemsError: gallery.data ? undefined : gallery.error };
  // Nothing to show. That is only a certainty when both answers are there.
  if (gallery.error && !gallery.data) return { kind: 'error', error: gallery.error, retry: 'gallery' };
  if (pageAnswer.error && !isMissing(pageAnswer.error)) return { kind: 'error', error: pageAnswer.error, retry: 'page' };
  return { kind: 'redirect' };
}

function GalleryItems({ items }: { items: GalleryItem[] }) {
  const { locale } = useLanguage();
  return (
    <ul className="gallery-grid">
      {items.map((item) => {
        const title = pickBilingual(item.title, locale);
        const src = galleryImageUrl(item.imageUrl);
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
  );
}

interface GalleryPageViewProps {
  gallery: AsyncState<GalleryResponse>;
  page: AsyncState<PageResponse>;
}

/** The Gallery route for given answers (the route itself, `GalleryPage`, supplies the live ones). */
export function GalleryPageView({ gallery, page }: GalleryPageViewProps) {
  const { t, locale, hasOverride } = useLanguage();
  const state = galleryPageState(gallery, page, locale);
  const text = state.kind === 'ready' ? state.page : undefined;

  // A title written under "Page text" replaces the title of the page text (empty = keep the page's own title).
  const written = hasOverride('gallery.title') ? t('gallery.title') : undefined;
  const ownTitle = text ? displayedPageContent(text, locale)?.content.title : undefined;
  useDocumentTitle(written ?? ownTitle ?? t('gallery.title'));

  if (state.kind === 'redirect') return <Navigate to={ROUTES.home} replace />;
  if (state.kind === 'loading') {
    return (
      <div className="page container">
        <PageHeader title={t('gallery.title')} />
        <LoadingState rows={2} />
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="page container">
        <PageHeader title={t('gallery.title')} />
        <ErrorState error={state.error} titleKey={state.retry === 'gallery' ? 'gallery.loadError' : 'pages.loadError'} onRetry={state.retry === 'gallery' ? gallery.reload : page.reload} />
      </div>
    );
  }

  const pictures = (
    <>
      {state.itemsError && <ErrorState error={state.itemsError} titleKey="gallery.loadError" onRetry={gallery.reload} />}
      {state.items.length > 0 && <GalleryItems items={state.items} />}
    </>
  );
  if (text) {
    return <ContentPageView page={text} toc={false} title={written}>{pictures}</ContentPageView>;
  }
  return (
    <div className="page container">
      <PageHeader title={t('gallery.title')} />
      {pictures}
    </div>
  );
}

/** Gallery: the text of the page "gallery" (Pages module) above the pictures. Only genuine items supplied by the API are shown. */
export default function GalleryPage() {
  return <GalleryPageView gallery={useGallery()} page={usePage('gallery')} />;
}
