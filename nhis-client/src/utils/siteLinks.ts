import type {
  Bilingual, DocumentRecord, FooterLinkGroup, LinkItem, LinkTarget, Locale, NavHeading, NavLink, NavMenu, NavigationContent,
} from '@nhis/shared-types';
import { isKnownSiteRoute, isSafeHttpsUrl, telHrefFor } from '@nhis/shared-types';
import { ROUTES } from '../config/routes';
import { pickBilingual } from './locale';
import { mailtoHref } from './safeUrl';
import { documentFileUrl } from './urls';

/* ---------------------------------------------------------------------------
 * Links of the managed site content (LinkTarget / LinkItem).
 *
 * `resolveLink` turns a structured target into something that can be rendered, or null when it must not be shown.
 * Callers drop such items with `visibleLinks` (or `resolveNavigation` / `resolveFooterGroups`); <SiteLink> renders one.
 * ------------------------------------------------------------------------- */

export type ResolvedLinkKind = 'route' | 'external' | 'file' | 'mailto' | 'tel';

export interface ResolvedLink {
  kind: ResolvedLinkKind;
  /** route: router path (with an optional #anchor, the router adds the base path); other kinds: the address to put in `href`. */
  href: string;
  /** external addresses and document files open in a new tab. */
  newTab: boolean;
  /** The Documents-module record of a `file` link (for its title). */
  document?: DocumentRecord;
}

export interface LinkContext {
  /** The document registry (`useDocumentRegistry().byId`): `document` targets resolve against it. */
  documentsById: ReadonlyMap<string, DocumentRecord>;
  /**
   * Preview mode. Reserved: document files are served by the public registry in both modes, so it changes nothing today.
   */
  preview?: boolean;
  /** false while the Gallery has no published item: links to the gallery then cannot be shown. Omitted = no such rule. */
  galleryAvailable?: boolean;
}

/** Path of a route href without its #anchor. */
export function routePathOf(href: string): string {
  const hash = href.indexOf('#');
  return hash === -1 ? href : href.slice(0, hash);
}

/** True for a link to the Gallery page (any anchor). */
export function isGalleryTarget(target: LinkTarget): boolean {
  return target.type === 'route' && routePathOf(target.path) === ROUTES.gallery;
}

const DIALLABLE = /^\+?[0-9]{6,15}$/;

/**
 * Where a link leads, or null when it cannot be shown: an unknown route, an address that is not https, a document that is
 * missing, unpublished or without a file, a malformed email address or phone number, or the Gallery while it is empty.
 * Nothing but https://, mailto:, tel: and the site's own routes can come out of this function.
 */
export function resolveLink(target: LinkTarget, context: LinkContext): ResolvedLink | null {
  switch (target.type) {
    case 'route':
      if (!isKnownSiteRoute(target.path)) return null;
      if (context.galleryAvailable === false && isGalleryTarget(target)) return null;
      return { kind: 'route', href: target.path, newTab: false };
    case 'external':
      return isSafeHttpsUrl(target.url) ? { kind: 'external', href: target.url, newTab: true } : null;
    case 'document': {
      const document = context.documentsById.get(target.documentId);
      const href = document && document.availability === 'available' ? documentFileUrl(document.localPath) : undefined;
      return document && href ? { kind: 'file', href, newTab: true, document } : null;
    }
    case 'email': {
      const href = /[?#]/.test(target.address) ? undefined : mailtoHref(target.address);
      return href ? { kind: 'mailto', href, newTab: false } : null;
    }
    case 'phone':
      return DIALLABLE.test(target.number) ? { kind: 'tel', href: telHrefFor(target.number), newTab: false } : null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ labels */

/** The token of a document link's label that stands for the document's own title. */
export const TITLE_TOKEN = '{title}';

/** A label split into pieces of one language each (the document title may be in another language than the label). */
export interface LinkLabel {
  /** The whole label as plain text. */
  text: string;
  /** Language of the label text. */
  lang: Locale;
  segments: Array<{ text: string; lang: Locale }>;
}

/** Title of a document in the current language (the label when the record has no title). */
function documentTitle(document: DocumentRecord, locale: Locale): { text: string; lang: Locale } {
  const title = pickBilingual(document.title, locale);
  return title.text ? title : pickBilingual(document.label, locale);
}

/**
 * The label of a link in the current language (English, marked as such, when no Tamil text exists). For a document file
 * `{title}` is replaced by the document's title; for any other target the label is used as written.
 */
export function linkLabel(label: Bilingual, link: ResolvedLink | null, locale: Locale): LinkLabel {
  const picked = pickBilingual(label, locale);
  const document = link?.kind === 'file' ? link.document : undefined;
  if (!document || !picked.text.includes(TITLE_TOKEN)) {
    return { text: picked.text, lang: picked.lang, segments: [{ text: picked.text, lang: picked.lang }] };
  }
  const title = documentTitle(document, locale);
  const parts = picked.text.split(TITLE_TOKEN);
  const segments: LinkLabel['segments'] = [];
  parts.forEach((part, index) => {
    if (part) segments.push({ text: part, lang: picked.lang });
    if (index < parts.length - 1 && title.text) segments.push({ text: title.text, lang: title.lang });
  });
  return { text: segments.map((segment) => segment.text).join(''), lang: picked.lang, segments };
}

/* ------------------------------------------------------------------ lists */

export interface LinkView<T> { item: T; link: ResolvedLink }

/** The items that are visible and whose target can be shown, each with its resolved link, in the given order. */
export function visibleLinks<T extends { visible: boolean; target: LinkTarget }>(items: readonly T[], context: LinkContext): Array<LinkView<T>> {
  const views: Array<LinkView<T>> = [];
  for (const item of items) {
    if (!item.visible) continue;
    const link = resolveLink(item.target, context);
    if (link) views.push({ item, link });
  }
  return views;
}

/* ------------------------------------------------------------------ navigation and footer */

export type NavChildView =
  | { kind: 'link'; id: string; item: NavLink; link: ResolvedLink }
  | { kind: 'heading'; id: string; item: NavHeading };

export type NavEntryView =
  | { kind: 'link'; id: string; item: NavLink; link: ResolvedLink }
  | { kind: 'menu'; id: string; item: NavMenu; children: NavChildView[] };

/** Visible children of a menu: hidden or unresolvable links drop out, and a heading stays only when a link follows it. */
function menuChildren(menu: NavMenu, context: LinkContext): NavChildView[] {
  const children: NavChildView[] = [];
  let heading: NavHeading | undefined;
  for (const child of menu.children) {
    if (child.type === 'heading') {
      heading = child.visible ? child : undefined;
      continue;
    }
    const [view] = visibleLinks([child], context);
    if (!view) continue;
    if (heading) {
      children.push({ kind: 'heading', id: heading.id, item: heading });
      heading = undefined;
    }
    children.push({ kind: 'link', id: view.item.id, item: view.item, link: view.link });
  }
  return children;
}

/**
 * The main menu as it is shown: hidden entries, links that cannot be resolved (missing document, empty Gallery, ...),
 * empty dropdowns and headings without a link below them are left out; order is the editor's order.
 */
export function resolveNavigation(navigation: NavigationContent, context: LinkContext): NavEntryView[] {
  const entries: NavEntryView[] = [];
  for (const item of navigation.items) {
    if (!item.visible) continue;
    if (item.type === 'link') {
      const [view] = visibleLinks([item], context);
      if (view) entries.push({ kind: 'link', id: item.id, item: view.item, link: view.link });
    } else {
      const children = menuChildren(item, context);
      if (children.length > 0) entries.push({ kind: 'menu', id: item.id, item, children });
    }
  }
  return entries;
}

export interface FooterGroupView { group: FooterLinkGroup; links: Array<LinkView<LinkItem>> }

/** Visible footer link groups that still have at least one link to show. */
export function resolveFooterGroups(groups: readonly FooterLinkGroup[], context: LinkContext): FooterGroupView[] {
  const views: FooterGroupView[] = [];
  for (const group of groups) {
    if (!group.visible) continue;
    const links = visibleLinks(group.links, context);
    if (links.length > 0) views.push({ group, links });
  }
  return views;
}
