import { useEffect, useRef, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { DocumentsProvider } from '../../context/DocumentsContext';
import { useLanguage } from '../../context/LanguageContext';
import { SiteSettingsProvider } from '../../context/SiteSettingsContext';
import { SiteLinkContext, useComputedLinkContext } from '../../hooks/useVisibleNav';
import { focusPageHeading } from '../../utils/routeFocus';
import { PreviewBanner } from '../common/PreviewBanner';
import { AnnouncementBar } from './AnnouncementBar';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { SupportStrip } from './SupportStrip';
import './layout.css';

/**
 * After in-app navigation, move focus to the page heading so keyboard and screen-reader users start at the new content.
 * A page that loads its text replaces its heading when the text arrives; the focus follows it (see utils/routeFocus.ts).
 */
function useRouteFocus() {
  const { pathname, hash } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (hash) return; // in-page anchor: the browser scrolls to it
    window.scrollTo(0, 0);
    return focusPageHeading();
  }, [pathname, hash]);
}

/** Provides what links need (document registry, preview mode, Gallery rule) to everything below, computed once. */
function LinkContextProvider({ children }: { children: ReactNode }) {
  const value = useComputedLinkContext();
  return <SiteLinkContext.Provider value={value}>{children}</SiteLinkContext.Provider>;
}

export default function SiteLayout() {
  const { t } = useLanguage();
  useRouteFocus();

  return (
    <SiteSettingsProvider>
      <DocumentsProvider>
        <LinkContextProvider>
          <a className="skip-link" href="#main">{t('site.skipToContent')}</a>
          <PreviewBanner />
          <SupportStrip />
          <SiteHeader />
          <AnnouncementBar />
          <main id="main" tabIndex={-1} className="site-main">
            <Outlet />
          </main>
          <SiteFooter />
        </LinkContextProvider>
      </DocumentsProvider>
    </SiteSettingsProvider>
  );
}
