import { SITE_ROUTES, SITE_ROUTE_ANCHORS, isKnownSiteRoute, isSafeHttpsUrl, telHrefFor, type LinkTarget } from '@nhis/shared-types';

/*
 * Pure helpers for the site-content editors: link targets and the "Preview on website" address.
 * No React and no `import.meta`, so they run in the node tests.
 */

export type LinkKind = LinkTarget['type'];

/** Order of the kind select in the link editor. */
export const LINK_KINDS: readonly LinkKind[] = ['route', 'document', 'external', 'email', 'phone'];

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  route: 'Page of this site',
  document: 'Document',
  external: 'Web address',
  email: 'E-mail address',
  phone: 'Phone number',
};

/** A new, still empty target of the given kind (the shared validator then asks for the missing value). */
export function emptyLinkTarget(kind: LinkKind): LinkTarget {
  switch (kind) {
    case 'route': return { type: 'route', path: '' };
    case 'external': return { type: 'external', url: '' };
    case 'document': return { type: 'document', documentId: '' };
    case 'email': return { type: 'email', address: '' };
    case 'phone': return { type: 'phone', number: '' };
  }
}

/** The one string a target holds (path, address, document id, e-mail or number). */
export function linkTargetText(target: LinkTarget): string {
  switch (target.type) {
    case 'route': return target.path;
    case 'external': return target.url;
    case 'document': return target.documentId;
    case 'email': return target.address;
    case 'phone': return target.number;
  }
}

/** Short description for summaries: "Page: /hospitals", "Web address: https://...". */
export function describeLinkTarget(target: LinkTarget): string {
  const text = linkTargetText(target).trim();
  return text ? `${LINK_KIND_LABELS[target.type]}: ${text}` : `${LINK_KIND_LABELS[target.type]}: not chosen yet`;
}

/* ------------------------------------------------------------------ routes */

export interface RouteOption { value: string; label: string }

/** Pages of the public site (SITE_ROUTES). */
export const ROUTE_PAGE_OPTIONS: readonly RouteOption[] = SITE_ROUTES.map((route) => ({ value: route.path, label: route.label }));

/** Sections inside pages (SITE_ROUTE_ANCHORS). */
export const ROUTE_SECTION_OPTIONS: readonly RouteOption[] = SITE_ROUTE_ANCHORS.map((route) => ({ value: route.path, label: route.label }));

/** `/forms#policy-lists` -> { base: '/forms', anchor: 'policy-lists' }. */
export function splitRoutePath(path: string): { base: string; anchor: string } {
  const hash = path.indexOf('#');
  return hash === -1 ? { base: path, anchor: '' } : { base: path.slice(0, hash), anchor: path.slice(hash + 1) };
}

/** Joins a page path and an anchor; an empty anchor leaves the path alone. A leading # in the anchor is ignored. */
export function joinRoutePath(base: string, anchor: string): string {
  const clean = anchor.trim().replace(/^#+/, '');
  return clean === '' ? base : `${base}#${clean}`;
}

/**
 * Value of the page select for a path: the path itself when it is one of the listed pages or sections, else its page part
 * when that is a listed page (the anchor is then shown in its own box), else '' (nothing chosen or an unknown page).
 */
export function routeSelectValue(path: string): string {
  if (ROUTE_PAGE_OPTIONS.some((option) => option.value === path) || ROUTE_SECTION_OPTIONS.some((option) => option.value === path)) return path;
  const { base } = splitRoutePath(path);
  return ROUTE_PAGE_OPTIONS.some((option) => option.value === base) ? base : '';
}

/* ------------------------------------------------------------------ live checks */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIALLABLE = /^\+?[0-9]{6,15}$/;

/** `tel:` address for a phone link number as it will be stored (spaces and hyphens are removed by the validator). */
export const phoneLinkNumber = (text: string): string => text.trim().replace(/[ -]/g, '');

/**
 * Problem with what has been typed so far, for instant feedback in the link editor. Returns null for an empty value
 * (the form validator reports a missing value when the user saves) and for a value that looks right. The server
 * validation stays authoritative.
 */
export function liveLinkProblem(target: LinkTarget): string | null {
  const text = linkTargetText(target).trim();
  if (text === '') return null;
  switch (target.type) {
    case 'route':
      if (isKnownSiteRoute(text)) return null;
      return SITE_ROUTES.some((route) => route.path === splitRoutePath(text).base)
        ? 'The section after # may only contain letters, digits, - and _ (up to 64 characters).'
        : 'Choose one of the pages of this website.';
    case 'external':
      return isSafeHttpsUrl(text) ? null : 'Enter a full web address that starts with https:// (no spaces, no user name or password).';
    case 'document':
      return null;
    case 'email':
      return EMAIL_SHAPE.test(text) ? null : 'Enter a valid e-mail address, for example name@example.org.';
    case 'phone':
      return DIALLABLE.test(phoneLinkNumber(text)) ? null : 'Enter a phone number with 6 to 15 digits (a leading + is allowed).';
  }
}

/** The `tel:` link created for a phone number as displayed; empty when the number has fewer than 3 digits. */
export function telLinkPreview(number: string): string {
  return number.replace(/\D/g, '').length >= 3 ? telHrefFor(number) : '';
}

/* ------------------------------------------------------------------ preview on the website */

/** Default address of the Client: the dev server while developing, the IIS application sub-path in a production build. */
export const DEV_CLIENT_URL = 'http://127.0.0.1:5173';
export const PRODUCTION_CLIENT_URL = '/TNNHIS/';

/**
 * Base address of the public site for "Preview on website". `configured` is VITE_CLIENT_URL; it must be an http(s)
 * address or a path starting with "/", anything else is ignored. Without a usable value the default for the build applies.
 */
export function resolveClientBase(options: { configured?: string | null; production: boolean }): string {
  const value = options.configured?.trim() ?? '';
  // A path must not start with "//": that is a network-path reference to another host. A backslash is read as a slash by browsers
  // ("/\evil.example" opens evil.example), so it is not accepted anywhere in a path.
  const usable = /^https?:\/\/[^\s]+$/i.test(value) || /^\/(?![/\\])[^\s\\]*$/.test(value);
  if (usable) return value;
  return options.production ? PRODUCTION_CLIENT_URL : DEV_CLIENT_URL;
}

/**
 * Address of a public route in preview mode: `<base><path>?preview=1` (the Client remembers the mode for the tab).
 * `base` may or may not end with "/"; `path` is a route such as "/" or "/hospitals" and may carry a "#anchor".
 */
export function buildPreviewUrl(base: string, path = '/'): string {
  const hash = path.indexOf('#');
  const route = hash === -1 ? path : path.slice(0, hash);
  const fragment = hash === -1 ? '' : path.slice(hash);
  const root = base.replace(/\/+$/, '');
  const normalised = route === '' || route === '/' ? '/' : route.startsWith('/') ? route : `/${route}`;
  return `${root}${normalised}?preview=1${fragment}`;
}
