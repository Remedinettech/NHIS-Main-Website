import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { HomeSectionId } from '@nhis/shared-types';
import { CoverageStatement } from '../components/scheme/CoverageStatement';
import { ManagedHero, ManagedHelplines, ManagedHighlights, ManagedDocuments, ManagedPathways, ManagedQuickAccess } from '../components/scheme/ManagedHome';
import { Partners } from '../components/scheme/Partners';
import { APP_CONFIG } from '../config/app';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSiteDocument } from '../hooks/useSiteContent';

/** Legacy portal entry points (/?Pagename=...) are forwarded to the existing portal so old bookmarks keep working. */
const LEGACY_PORTAL_PAGES = new Set(['TNportal', 'Pensioners', 'Administrator']);

/** The sections below the hero. The hero is always first (the content rules keep it first and visible). */
const SECTIONS: Record<Exclude<HomeSectionId, 'hero'>, ReactNode> = {
  quickAccess: <ManagedQuickAccess />,
  pathways: <ManagedPathways />,
  documents: <ManagedDocuments />,
  coverage: <CoverageStatement />,
  helplines: <ManagedHelplines />,
  highlights: <ManagedHighlights />,
  partners: <Partners />,
};

export default function HomePage() {
  const { sections } = useSiteDocument('home');
  const [params] = useSearchParams();
  const legacyPage = params.get('Pagename');
  const forward = legacyPage !== null && LEGACY_PORTAL_PAGES.has(legacyPage);
  useDocumentTitle(undefined);

  useEffect(() => {
    if (forward) window.location.replace(`${APP_CONFIG.legacyPortalBaseUrl}/?${new URLSearchParams({ Pagename: legacyPage ?? '' })}`);
  }, [forward, legacyPage]);

  if (forward) return null;

  // Visible sections in the editor's order (an unknown id or a repeated one is ignored). Coverage and helplines that
  // follow each other share one two-column band.
  const seen = new Set<string>();
  const visible = sections.filter((section) => {
    if (!section.visible || !Object.prototype.hasOwnProperty.call(SECTIONS, section.id) || seen.has(section.id)) return false;
    seen.add(section.id);
    return true;
  });
  return (
    <>
      <ManagedHero />
      <div className="container page home">
        {visible.map((section, index) => {
          const id = section.id as keyof typeof SECTIONS;
          if (id === 'helplines' && visible[index - 1]?.id === 'coverage') return null;
          if (id === 'coverage' && visible[index + 1]?.id === 'helplines') {
            return <div key={id} className="home-section home-band">{SECTIONS.coverage}{SECTIONS.helplines}</div>;
          }
          return <div key={id} className={id === 'quickAccess' && index === 0 ? undefined : 'home-section'}>{SECTIONS[id]}</div>;
        })}
      </div>
    </>
  );
}
