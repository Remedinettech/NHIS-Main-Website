import { useId } from 'react';
import { MANUAL_PDF, MANUAL_VIDEO_FILES, isSafeHttpsUrl, manualEmbedUrl, type Bilingual, type Locale, type ManualMediaSource, type ManualVideo } from '@nhis/shared-types';
import { PageHeader } from '../components/common/PageHeader';
import { BilingualText } from '../components/common/SiteLink';
import { EmptyState } from '../components/common/StateViews';
import { T } from '../components/common/T';
import { useLanguage } from '../context/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSiteContent } from '../hooks/useSiteContent';
import { pickBilingual } from '../utils/locale';
import { assetUrl, resolveApiUrl } from '../utils/urls';
import './user-manual.css';

/*
 * The User Manual page: the manual PDF and the workflow videos of the managed "manual" document (Admin: Site content,
 * User Manual). Everything shown is plain text; a file is only used from a source the content rules know:
 *  - a built-in file of the Client build (one of the files named in shared-types/user-manual.ts),
 *  - an uploaded file of the API (public once a published document uses it; in preview mode the administration's copy),
 *  - an https address, embedded only for the known providers (YouTube, Google Drive) and otherwise a plain link.
 */

const BUILT_IN_FILES: ReadonlySet<string> = new Set([MANUAL_PDF, ...MANUAL_VIDEO_FILES]);
const UPLOADED_FILE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** What an embedded provider player may do: run its own scripts and open the video's page, nothing else on this site. */
const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox';
const EMBED_FEATURES = 'fullscreen; encrypted-media; picture-in-picture';
/**
 * Only the origin of this site is sent to the provider (never the path or the query). YouTube refuses an embed that arrives
 * without a Referer header ("error 153"), so "no-referrer" is not an option; this is the browsers' default and YouTube's advice.
 */
const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin';

/**
 * The address of a source, or '' when it cannot be shown (an unknown built-in file, a malformed upload id, an address that
 * is not a safe https address). Uploads come from the administration's files in preview mode (the session authorises
 * them), otherwise from the public files; both follow the API base of the deployment (/TNNHISApi/api/v1 on IIS).
 */
export function manualFileUrl(source: ManualMediaSource, preview: boolean): string {
  switch (source.type) {
    case 'builtIn':
      return BUILT_IN_FILES.has(source.path) ? assetUrl(source.path) : '';
    case 'upload':
      return UPLOADED_FILE_ID.test(source.assetId) ? resolveApiUrl(`/api/v1/${preview ? 'admin/' : ''}files/${source.assetId}`) : '';
    case 'external':
      return isSafeHttpsUrl(source.url) ? source.url : '';
    default:
      return '';
  }
}

/**
 * Whether the browser honours the `download` attribute for this address: only for files of this site (a built-in file or
 * a file of the API behind the same host). For anything else the attribute is ignored, so it is not set.
 */
export function isSameSiteFile(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

/** The `lang` attribute for a text that is shown in another language than the page (fallback to English). */
const langIfOther = (lang: Locale, locale: Locale): Locale | undefined => (lang === locale ? undefined : lang);

/** The panel with the manual PDF: its title and the download button. */
function ManualDownload({ title, buttonLabel, url }: { title: Bilingual; buttonLabel: Bilingual; url: string }) {
  const { t } = useLanguage();
  const headingId = useId();
  const downloadable = isSameSiteFile(url);
  return (
    <section className="panel manual-download" aria-labelledby={headingId}>
      <h2 id={headingId}><BilingualText value={title} /></h2>
      {/* Opens in a new tab as well, for browsers that show a PDF instead of saving it, so the visitor keeps this page. */}
      <a className="btn btn--primary" href={url} download={downloadable} target="_blank" rel="noopener noreferrer">
        <BilingualText value={buttonLabel} />
        {!downloadable && <span className="visually-hidden"> ({t('common.opensInNewTab')})</span>}
      </a>
    </section>
  );
}

interface VideoPlayerProps {
  source: ManualMediaSource;
  url: string;
  title: { text: string; lang: Locale };
  /** The id of the card's heading, which names a <video>. */
  headingId: string;
}

/**
 * The player of one video:
 *  - a built-in or uploaded file: a <video> with the browser's own controls (no autoplay, only the metadata is loaded
 *    until the visitor presses play) and a visible link below it to download (or open) the file;
 *  - a YouTube or Google Drive address: the provider's player in a sandboxed <iframe> (16:9 box) and a link to the video;
 *  - any other https address: a link only, the page of another site is never embedded.
 */
function VideoPlayer({ source, url, title, headingId }: VideoPlayerProps) {
  const { t, locale } = useLanguage();
  const titleLang = langIfOther(title.lang, locale);

  if (source.type === 'external') {
    const embedUrl = manualEmbedUrl(url);
    return (
      <>
        {embedUrl && (
          <iframe
            className="manual-video__player"
            src={embedUrl}
            title={title.text}
            lang={titleLang}
            loading="lazy"
            sandbox={EMBED_SANDBOX}
            referrerPolicy={EMBED_REFERRER_POLICY}
            allow={EMBED_FEATURES}
            allowFullScreen
          />
        )}
        <p className="manual-video__link">
          <a href={url} lang={titleLang} target="_blank" rel="noopener noreferrer">
            {title.text}
            <span className="visually-hidden"> ({t('common.opensInNewTab')})</span>
          </a>
        </p>
      </>
    );
  }

  const downloadable = isSameSiteFile(url);
  return (
    <>
      <video className="manual-video__player" controls preload="metadata" playsInline src={url} aria-labelledby={headingId}>
        <T k="manual.videoUnsupported" />
      </video>
      <p className="manual-video__link">
        <a href={url} download={downloadable} target="_blank" rel="noopener noreferrer">
          <T k={downloadable ? 'manual.downloadVideo' : 'manual.openVideo'} />
          <span className="visually-hidden" lang={titleLang}>: {title.text}</span>
        </a>
      </p>
    </>
  );
}

/** One video of the manual: its title (h2), the optional description and the player. */
function VideoCard({ video, url }: { video: ManualVideo; url: string }) {
  const { locale } = useLanguage();
  const headingId = useId();
  const title = pickBilingual(video.title, locale);
  const description = pickBilingual(video.description, locale);
  return (
    <article className="panel manual-video" aria-labelledby={headingId}>
      <h2 id={headingId} lang={langIfOther(title.lang, locale)}>{title.text}</h2>
      {description.text && <p lang={langIfOther(description.lang, locale)}>{description.text}</p>}
      <VideoPlayer source={video.source} url={url} title={title} headingId={headingId} />
    </article>
  );
}

/** Shown when nothing can be shown: the manual and all videos are hidden, or none of their sources is usable. */
function ManualEmptyState() {
  const { t } = useLanguage();
  return <EmptyState title={t('manual.emptyTitle')}>{t('manual.emptyText')}</EmptyState>;
}

export default function UserManualPage() {
  const { content: { manual }, preview } = useSiteContent();
  const { locale } = useLanguage();
  const title = pickBilingual(manual.title, locale);
  const hasIntro = pickBilingual(manual.intro, locale).text !== '';
  useDocumentTitle(title.text);

  // What can be shown, in the editor's order: the visible manual and the visible videos whose source gives an address.
  const manualUrl = manual.manual.visible ? manualFileUrl(manual.manual.source, preview) : '';
  const videos = manual.videos
    .filter((video) => video.visible)
    .map((video) => ({ video, url: manualFileUrl(video.source, preview) }))
    .filter(({ url }) => url !== '');

  return (
    <div className="container page user-manual">
      <PageHeader title={title.text} lang={langIfOther(title.lang, locale)} intro={hasIntro ? <BilingualText value={manual.intro} /> : undefined} />
      {manualUrl && <ManualDownload title={manual.manual.title} buttonLabel={manual.manual.buttonLabel} url={manualUrl} />}
      {videos.length > 0 && (
        <ol className="manual-videos">
          {videos.map(({ video, url }) => <li key={video.id}><VideoCard video={video} url={url} /></li>)}
        </ol>
      )}
      {!manualUrl && videos.length === 0 && <ManualEmptyState />}
    </div>
  );
}
