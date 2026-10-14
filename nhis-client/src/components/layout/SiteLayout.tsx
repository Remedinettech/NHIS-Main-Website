import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { DocumentsProvider } from '../../context/DocumentsContext';
import { useLanguage } from '../../context/LanguageContext';
import { SiteSettingsProvider } from '../../context/SiteSettingsContext';
import { AnnouncementBar } from './AnnouncementBar';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { SupportStrip } from './SupportStrip';
import './layout.css';

/** After in-app navigation, move focus to the page heading so keyboard and screen-reader users start at the new content. */
function useRouteFocus(mainRef: React.RefObject<HTMLElement | null>) {
  const { pathname, hash } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (hash) return; // in-page anchor: the browser scrolls to it
    window.scrollTo(0, 0);
    const heading = document.getElementById('page-title');
    (heading ?? mainRef.current)?.focus({ preventScroll: true });
  }, [pathname, hash, mainRef]);
}

export default function SiteLayout() {
  const { t } = useLanguage();
  const mainRef = useRef<HTMLElement>(null);
  useRouteFocus(mainRef);

  return (
    <SiteSettingsProvider>
      <DocumentsProvider>
        <a className="skip-link" href="#main">{t('site.skipToContent')}</a>
        <SupportStrip />
        <SiteHeader />
        <AnnouncementBar />
        <main id="main" ref={mainRef} tabIndex={-1} className="site-main">
          <Outlet />
        </main>
        <SiteFooter />
      </DocumentsProvider>
    </SiteSettingsProvider>
  );
}
