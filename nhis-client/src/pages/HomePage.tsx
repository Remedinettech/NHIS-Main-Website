import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HomeHero } from '../components/scheme/HomeHero';
import { CoverageStatement } from '../components/scheme/CoverageStatement';
import { HomeDocuments } from '../components/scheme/HomeDocuments';
import { HelplinePanel } from '../components/scheme/HelplinePanel';
import { Partners } from '../components/scheme/Partners';
import { Pathways } from '../components/scheme/Pathways';
import { QuickAccess } from '../components/scheme/QuickAccess';
import { APP_CONFIG } from '../config/app';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** Legacy portal entry points (/?Pagename=...) are forwarded to the existing portal so old bookmarks keep working. */
const LEGACY_PORTAL_PAGES = new Set(['TNportal', 'Pensioners', 'Administrator']);

export default function HomePage() {
  const [params] = useSearchParams();
  const legacyPage = params.get('Pagename');
  const forward = legacyPage !== null && LEGACY_PORTAL_PAGES.has(legacyPage);
  useDocumentTitle(undefined);

  useEffect(() => {
    if (forward) window.location.replace(`${APP_CONFIG.legacyPortalBaseUrl}/?${new URLSearchParams({ Pagename: legacyPage ?? '' })}`);
  }, [forward, legacyPage]);

  if (forward) return null;

  return (
    <>
      <HomeHero />
      <div className="container page home">
        <QuickAccess />
        <div className="home-section"><Pathways /></div>
        <div className="home-section"><HomeDocuments /></div>
        <div className="home-section home-band">
          <CoverageStatement />
          <HelplinePanel />
        </div>
        <div className="home-section"><Partners /></div>
      </div>
    </>
  );
}
