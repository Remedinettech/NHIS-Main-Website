import type { Bilingual, PageResponse, PageSlug, SiteContentKey, SiteContentMap } from '@nhis/shared-types';
import { validateSiteContent, DEFAULT_SITE_CONTENT } from '@nhis/shared-types';
import { ApiRequestError, REVALIDATE_TTL_MS, getCached } from './http';

/* ---------------------------------------------------------------------------
 * Site content requests and preview mode (docs/site-content-management.md, sections 3 and 6).
 *
 * Public mode reads GET /site-content (published values only). Preview mode reads the administration's
 * GET /admin/site-content/preview with the browser's own session cookie and shows unpublished changes; without a valid
 * session (401/403) it falls back to the published content and reports `previewDenied`. Public mode never calls an
 * admin endpoint, and a response of one mode is never served for the other one (separate cache keys).
 * ------------------------------------------------------------------------- */

/** Published content is reused for this long; it is refetched when the window regains focus after that. */
export const SITE_CONTENT_TTL_MS = REVALIDATE_TTL_MS;
/** Preview responses are only shared between the focus and visibility events of one switch to the tab. */
export const PREVIEW_DEDUPE_MS = 2_000;

/** sessionStorage key of the preview flag. Client-specific: the Admin shares this origin on IIS. */
export const PREVIEW_STORAGE_KEY = 'nhis.client.preview';

/* ------------------------------------------------------------------ preview mode flag */

/** What `?preview=` in a query string means: '1' turns preview on, '0' turns it off, anything else leaves it as it is. */
export function previewFromSearch(search: string): boolean | undefined {
  const value = new URLSearchParams(search).get('preview');
  if (value === '1') return true;
  if (value === '0') return false;
  return undefined;
}

let remembered: boolean | undefined;

function readSession(): boolean | undefined {
  try {
    const value = window.sessionStorage.getItem(PREVIEW_STORAGE_KEY);
    return value === '1' ? true : value === '0' ? false : undefined;
  } catch {
    return undefined;
  }
}

function writeSession(on: boolean): void {
  try {
    if (on) window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, '1');
    else window.sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
  } catch { /* storage unavailable: the flag then only lasts while the page stays loaded */ }
}

/**
 * Whether the Client shows unpublished changes. `?preview=1` in the URL turns it on and remembers it for this browser
 * tab (sessionStorage); `?preview=0` turns it off and forgets it. It writes on purpose when it reads the flag: children
 * start their requests before any parent effect could store it. Safe to call during render (idempotent).
 */
export function isPreviewMode(search?: string): boolean {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const fromUrl = previewFromSearch(query);
  if (fromUrl !== undefined) {
    if (fromUrl !== (remembered ?? readSession() ?? false)) writeSession(fromUrl);
    remembered = fromUrl;
    return fromUrl;
  }
  remembered ??= readSession() ?? false;
  return remembered;
}

/** Test hook: forgets the in-memory flag so the next call reads the URL and sessionStorage again. */
export function resetPreviewModeForTests(): void {
  remembered = undefined;
}

/* ------------------------------------------------------------------ site content */

export interface SiteContentLoad {
  /** The `data` object of the response, as received (shape-checked per document by `coerceSiteContent`). */
  data: unknown;
  /** Which endpoint answered. */
  source: 'published' | 'preview';
  /** Preview was requested but the administration refused (no valid session): the published content is shown instead. */
  previewDenied: boolean;
  /** JSON of `data`: equal signatures mean nothing changed, so the UI does not re-render. */
  signature: string;
}

function toLoad(response: unknown, source: SiteContentLoad['source'], previewDenied: boolean): SiteContentLoad {
  const data = typeof response === 'object' && response !== null ? (response as { data?: unknown }).data : undefined;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ApiRequestError('invalid-response', 'The API returned unreadable site content');
  }
  return { data, source, previewDenied, signature: JSON.stringify(data) };
}

const isRefusal = (error: unknown): boolean =>
  error instanceof ApiRequestError && error.kind === 'http' && (error.status === 401 || error.status === 403);

/**
 * Loads the site content. In preview mode the administration's preview endpoint is tried first; any failure there
 * falls back to the published content (`previewDenied` is set only for 401/403). Rejects when nothing could be read,
 * in which case the caller keeps the built-in content.
 */
export async function loadSiteContent(options: { preview: boolean; signal?: AbortSignal }): Promise<SiteContentLoad> {
  const { preview, signal } = options;
  let previewDenied = false;
  if (preview) {
    try {
      const response = await getCached<unknown>('/admin/site-content/preview', signal, { credentials: 'same-origin', ttlMs: PREVIEW_DEDUPE_MS });
      return toLoad(response, 'preview', false);
    } catch (error) {
      if (signal?.aborted) throw error;
      previewDenied = isRefusal(error);
    }
  }
  const response = await getCached<unknown>('/site-content', signal, { ttlMs: SITE_CONTENT_TTL_MS });
  return toLoad(response, 'published', previewDenied);
}

/* ------------------------------------------------------------------ defensive shape checks */

/*
 * The API validates every document before it is stored or published, and the Client validates nothing itself. These
 * checks only guard the rendering code against a response that does not have the documented shape at all (an older or
 * broken API, a proxy error page): a document that fails is replaced by the built-in document, the others are kept.
 * Properties that are not listed are ignored, so a newer API can add fields without breaking this Client.
 */

type Rec = Record<string, unknown>;
type Guard = (value: unknown) => boolean;

const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const str: Guard = (value) => typeof value === 'string';
const bool: Guard = (value) => typeof value === 'boolean';
const num: Guard = (value) => typeof value === 'number' && Number.isFinite(value);
const nullOr = (guard: Guard): Guard => (value) => value === null || guard(value);
const listOf = (guard: Guard): Guard => (value) => Array.isArray(value) && value.every(guard);
const either = (...guards: Guard[]): Guard => (value) => guards.some((guard) => guard(value));
const literal = (expected: string): Guard => (value) => value === expected;
/** An object whose listed properties pass their guards. */
const shape = (fields: Record<string, Guard>): Guard => (value) => isRec(value) && Object.entries(fields).every(([name, guard]) => guard(value[name]));

const bilingual: Guard = shape({ en: str, ta: str });
const image: Guard = shape({ assetId: nullOr(str), builtIn: nullOr(str), alt: bilingual, width: nullOr(num), height: nullOr(num) });
const target: Guard = (value) => isRec(value) && (
  (value.type === 'route' && str(value.path)) || (value.type === 'external' && str(value.url)) ||
  (value.type === 'document' && str(value.documentId)) || (value.type === 'email' && str(value.address)) ||
  (value.type === 'phone' && str(value.number)));
const link = (extra: Record<string, Guard> = {}): Guard => shape({ id: str, label: bilingual, target, visible: bool, ...extra });

const navLink = link({ type: literal('link') });
const navHeading = shape({ type: literal('heading'), id: str, label: bilingual, visible: bool });
const navMenu = shape({ type: literal('menu'), id: str, label: bilingual, visible: bool, children: listOf(either(navLink, navHeading)) });

type Checked = Exclude<SiteContentKey, 'text'>;
const GUARDS: Record<Checked, Guard> = {
  manual: value => validateSiteContent('manual', value).ok,
  header: shape({
    emblem: image, portrait: image, showPortrait: bool, title: bilingual, subtitle: bilingual, helplineHeading: bilingual,
    helplines: listOf(shape({ id: str, label: bilingual, number: str, visible: bool })),
    availability: str,
    loginMenu: shape({ label: bilingual, heading: bilingual, items: listOf(link()), forgotPassword: link() }),
  }),
  navigation: shape({ items: listOf(either(navLink, navMenu)) }),
  home: shape({
    sections: listOf(shape({ id: str, visible: bool })),
    hero: shape({
      eyebrow: bilingual, title: bilingual, description: bilingual, coverageHeading: bilingual, coverageStatement: bilingual,
      actions: listOf(link({ variant: str })), banner: nullOr(image),
      search: shape({ heading: bilingual, hint: bilingual, placeholder: bilingual, button: bilingual, browseAll: bilingual, showCount: bool }),
    }),
    quickAccess: shape({ heading: bilingual, tiles: listOf(shape({ id: str, icon: str, label: bilingual, hint: bilingual, target, visible: bool })) }),
    pathways: shape({
      heading: bilingual,
      groups: listOf(shape({ id: str, heading: bilingual, links: listOf(link({ icon: str })), helplineId: nullOr(str), visible: bool })),
    }),
    documents: shape({ heading: bilingual, intro: bilingual, documentIds: listOf(str), categories: listOf(str), links: listOf(link()) }),
    coverage: shape({ heading: bilingual, linkLabel: bilingual }),
    helplines: shape({ heading: bilingual, intro: bilingual }),
    highlights: shape({ heading: bilingual, intro: bilingual, items: listOf(shape({ id: str, value: bilingual, label: bilingual, note: bilingual, visible: bool })) }),
  }),
  partners: shape({
    heading: bilingual,
    categories: listOf(shape({ id: str, caption: bilingual, visible: bool })),
    partners: listOf(shape({ id: str, categoryId: str, name: bilingual, logo: image, url: nullOr(str), visible: bool })),
  }),
  footer: shape({
    showWordmark: bool,
    logos: listOf(shape({ id: str, image, url: nullOr(str), visible: bool })),
    about: shape({ heading: bilingual, text: bilingual }),
    linkGroups: listOf(shape({ id: str, heading: bilingual, links: listOf(link()), visible: bool })),
    helplines: shape({ visible: bool, heading: bilingual }),
    contact: shape({ visible: bool, heading: bilingual, address: bilingual, email: str, phone: str }),
    copyright: bilingual,
  }),
};

/**
 * The complete content of a response: per document the received value, or the built-in value when the document is
 * missing or has the wrong shape. Of the interface texts, only the entries that have the right shape are kept.
 */
export function coerceSiteContent(data: unknown): SiteContentMap {
  const raw: Rec = isRec(data) ? data : {};
  const pick = <K extends Checked>(key: K): SiteContentMap[K] =>
    GUARDS[key](raw[key]) ? (raw[key] as SiteContentMap[K]) : DEFAULT_SITE_CONTENT[key];
  const text = raw.text;
  const overrides: Record<string, Bilingual> = {};
  if (isRec(text) && isRec(text.overrides)) {
    for (const [key, value] of Object.entries(text.overrides)) if (bilingual(value)) overrides[key] = value as Bilingual;
  }
  return {
    manual: pick('manual'), header: pick('header'), navigation: pick('navigation'), home: pick('home'), partners: pick('partners'), footer: pick('footer'),
    text: { overrides },
  };
}

/** The complete content of a load, or the built-in content before anything has been loaded. */
export function contentOf(load: SiteContentLoad | undefined): SiteContentMap {
  return load ? coerceSiteContent(load.data) : DEFAULT_SITE_CONTENT;
}

/* ------------------------------------------------------------------ pages in preview */

/**
 * A page with its pending draft (GET /admin/pages/<slug>/preview), shaped like the public page response. Without a
 * valid administration session (401/403) the published page is returned instead, so the page never breaks. Like the
 * site content preview, the answer is only shared for a moment (the focus and visibility events of one switch to the tab).
 */
export async function getPreviewPage(slug: PageSlug, published: () => Promise<PageResponse>, signal?: AbortSignal): Promise<PageResponse> {
  try {
    const response = await getCached<{ data: PageResponse['data'] }>(`/admin/pages/${encodeURIComponent(slug)}/preview`, signal, { credentials: 'same-origin', ttlMs: PREVIEW_DEDUPE_MS });
    return { data: response.data, source: 'snapshot', capturedAt: response.data.capturedAt };
  } catch (error) {
    if (isRefusal(error)) return published();
    throw error;
  }
}
