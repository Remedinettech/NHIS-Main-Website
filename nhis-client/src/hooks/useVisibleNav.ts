import { createContext, useContext, useMemo } from 'react';
import { useDocumentRegistry } from '../context/DocumentsContext';
import { useLanguage } from '../context/LanguageContext';
import { hasPageContent } from '../utils/pageContent';
import { resolveFooterGroups, resolveNavigation, type FooterGroupView, type LinkContext, type NavEntryView } from '../utils/siteLinks';
import { useGallery, usePage } from './useContent';
import { useSiteContent } from './useSiteContent';

/**
 * Whether the Gallery page has something to show: published pictures, or text written for the page "gallery" in the Admin
 * (Pages). A link must always open a populated page (the Gallery route redirects to the home page otherwise, see
 * pages/GalleryPage.tsx), so links to the Gallery stay hidden until the API returns at least one of them. It is asked
 * again when the visitor returns to an open tab, so the link follows what is published.
 */
export function useGalleryAvailable(): boolean {
  const { locale } = useLanguage();
  const gallery = useGallery();
  const page = usePage('gallery');
  // While either answer is unknown, or when a request failed, the link stays hidden.
  return (gallery.data?.data.length ?? 0) > 0 || hasPageContent(page.data?.data, locale);
}

/** The link context shared by everything below the site layout (provided once by SiteLayout). */
export const SiteLinkContext = createContext<LinkContext | undefined>(undefined);

/**
 * Computes the link context: the document registry, preview mode and the Gallery rule. Only SiteLayout calls this, once,
 * so that the gallery request and the registry lookups are not repeated for every link.
 */
export function useComputedLinkContext(): LinkContext {
  const { byId } = useDocumentRegistry();
  const { preview } = useSiteContent();
  const galleryAvailable = useGalleryAvailable();
  return useMemo(() => ({ documentsById: byId, preview, galleryAvailable }), [byId, preview, galleryAvailable]);
}

/**
 * What `resolveLink`, `visibleLinks` and `linkLabel` (utils/siteLinks.ts) need to turn managed links into something
 * that can be rendered. Available inside the site layout; <SiteLink> uses it itself.
 */
export function useLinkContext(): LinkContext {
  const value = useContext(SiteLinkContext);
  if (!value) throw new Error('useLinkContext must be used inside the site layout');
  return value;
}

/** The main menu to show: managed navigation with hidden and unresolvable entries removed (see resolveNavigation). */
export function useVisibleNav(): NavEntryView[] {
  const { content } = useSiteContent();
  const context = useLinkContext();
  return useMemo(() => resolveNavigation(content.navigation, context), [content.navigation, context]);
}

/** The footer link groups to show: visible groups with at least one visible, resolvable link. */
export function useVisibleFooterGroups(): FooterGroupView[] {
  const { content } = useSiteContent();
  const context = useLinkContext();
  return useMemo(() => resolveFooterGroups(content.footer.linkGroups, context), [content.footer.linkGroups, context]);
}
