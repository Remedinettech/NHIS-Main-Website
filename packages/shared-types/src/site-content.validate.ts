import { MANUAL_PDF, MANUAL_VIDEO_FILES } from './user-manual';
import type {
  FooterContent, FooterLinkGroup, FooterLogo, HeaderContent, HelplineEntry, HighlightItem, HomeActionLink, HomeContent,
  HomeSectionId, HomeSectionSetting, LinkItem, LinkTarget, NavHeading, NavLink, NavMenu, NavigationContent, PartnerCategory, PartnerEntry,
  PartnersContent, UserManualContent, ManualMediaSource, PathwayGroup, PathwayLink, QuickTile, SiteContentIssue, SiteContentKey, SiteContentMap, SiteImage, TextContent,
} from './site-content.types';
import {
  BUILT_IN_ASSET_PATTERN, HOME_SECTION_IDS, SITE_CONTENT_LIMITS, SITE_CONTENT_MAX_BYTES, SITE_ICON_NAMES, SITE_ID_PATTERN,
  SITE_ROUTES, isSiteContentKey,
} from './site-content.constants';
import { editableTextEntry } from './site-text.catalog';

/*
 * Strict validator and normaliser for the six site-content documents (docs/site-content-management.md, section 5).
 *
 * Pure TypeScript, no dependencies: it runs unchanged in the Admin (inline errors), in the API (authoritative check)
 * and in any bundler. It never throws for bad input; it collects every problem and returns either a normalised deep
 * copy (known properties only, strings trimmed and NFC-normalised) or the list of issues. `field` is the path of the
 * problem inside the document: dots for properties, brackets for list items ("partners[2].logo.alt.en"). A problem
 * with the document as a whole has the empty field "". For interface texts the key of the Client message is part of
 * the path ("overrides.hospitals.intro.en").
 */

export type SiteContentValidation<K extends SiteContentKey> =
  | { ok: true; value: SiteContentMap[K] }
  | { ok: false; issues: SiteContentIssue[] };

export interface SiteContentRefs {
  /** Documents-module ids referenced by `document` links and by `home.documents.documentIds`, in document order. */
  documentIds: string[];
  /** Uploaded images (SiteImage.assetId), in document order. */
  assetIds: string[];
}

type Bilingual = SiteImage['alt'];
type DocumentCategory = HomeContent['documents']['categories'][number];
type Rec = Record<string, unknown>;

const L = SITE_CONTENT_LIMITS;

/* ------------------------------------------------------------------ constants */

const MAX_ISSUES = 100;
const MAX_PIXELS = 20000;

const ASSET_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DOCUMENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ANCHOR_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Same rule as EMAIL_RE in nhis-api/src/common/admin/validation.ts (plus the no-".." check applied below). */
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
/** A number as displayed ("1800-233-5666", "+91 44 2345 6789"). */
const DISPLAYED_NUMBER_RE = /^\+?[0-9][0-9 -]*$/;
const DIALLABLE_RE = /^\+?[0-9]{6,15}$/;

const CONTROL_SINGLE_LINE = /[\u0000-\u001F\u007F-\u009F]/;
const CONTROL_MULTI_LINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;
const MARKUP = /<[A-Za-z/!?]/;
const URL_FORBIDDEN_CHARS = /[\x00-\x20\x7F-\x9F]/;
/** Characters with a meaning in a mailto: URI (query separator, parameter separators, escapes, fragment). */
const MAILTO_SPECIAL = /[?&=%#]/;
const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

const DOCUMENT_CATEGORY_SET: Record<DocumentCategory, true> = {
  'govt-order-employee': true, 'govt-order-pensioner': true, 'policy-non-payable': true,
  'enrolment-guide': true, 'enrolment-form': true, 'hospital-suspension': true,
};
const DOCUMENT_CATEGORIES = Object.keys(DOCUMENT_CATEGORY_SET) as DocumentCategory[];

const LINK_TARGET_TYPES = ['route', 'external', 'document', 'email', 'phone'] as const;
const ACTION_VARIANTS = ['primary', 'secondary', 'ghost'] as const;

/* ------------------------------------------------------------------ plumbing */

interface Ctx {
  issues: SiteContentIssue[];
  /** Paths of values that were not objects at all (already reported); further problems at or beneath them would only be noise. */
  broken: string[];
}

function fail(c: Ctx, field: string, message: string): void {
  if (c.issues.length > MAX_ISSUES) return;
  if (c.issues.length === MAX_ISSUES) {
    c.issues.push({ field: '', message: 'More problems were found. Fix the ones listed first.' });
    return;
  }
  if (c.broken.some((path) => field === path || field.startsWith(`${path}.`) || field.startsWith(`${path}[`))) return;
  c.issues.push({ field, message });
}

const at = (base: string, key: string): string => (base ? `${base}.${key}` : key);
const itemAt = (base: string, index: number): string => `${base}[${index}]`;

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Own properties only, so nothing is ever read from a prototype. */
const own = (record: Rec, key: string): unknown => (Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined);

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** Requires an object and rejects every property that is not in `keys`. Returns {} after reporting a non-object. */
function readObject(c: Ctx, input: unknown, field: string, keys: readonly string[]): Rec {
  if (!isRecord(input)) {
    fail(c, field, 'Must be an object.');
    c.broken.push(field);
    return {};
  }
  for (const key of Object.keys(input)) {
    if (!keys.includes(key)) fail(c, at(field, key), 'Unknown property.');
  }
  return input;
}

/** Validates every entry of a bounded list. Entries for which `each` returns undefined are left out (the problem is already reported). */
function list<T>(c: Ctx, input: unknown, field: string, max: number, each: (entry: unknown, entryField: string) => T | undefined): T[] {
  if (input === undefined || input === null) {
    fail(c, field, 'This list is required.');
    return [];
  }
  if (!Array.isArray(input)) {
    fail(c, field, 'Must be a list.');
    return [];
  }
  const entries: unknown[] = input;
  if (entries.length > max) fail(c, field, `Too many entries: ${entries.length}, the limit is ${max}.`);
  const out: T[] = [];
  entries.slice(0, max).forEach((entry, index) => {
    const value = each(entry, itemAt(field, index));
    if (value !== undefined) out.push(value);
  });
  return out;
}

/* ------------------------------------------------------------------ field kinds */

interface TextSpec { max: number; multiline?: boolean; optional?: boolean }

const LABEL: TextSpec = { max: L.label };
const HEADING: TextSpec = { max: L.heading };
const TEXT: TextSpec = { max: L.text };
const LONG_TEXT: TextSpec = { max: L.longText, multiline: true };
const ADDRESS: TextSpec = { max: L.text, multiline: true, optional: true };
const ALT: TextSpec = { max: L.alt };
const optional = (spec: TextSpec): TextSpec => ({ ...spec, optional: true });

/**
 * Characters that hide or reorder text: zero-width space (200B), line and paragraph separators (2028, 2029), bidi
 * embeddings and overrides (202A-202E, 2066-2069), word joiner and invisible operators (2060-2064) and the BOM (FEFF).
 * ZWNJ and ZWJ (200C, 200D) stay allowed because Indic scripts use them.
 */
function isInvisibleChar(code: number): boolean {
  return code === 0x200b || code === 0x2028 || code === 0x2029 || code === 0xfeff
    || (code >= 0x202a && code <= 0x202e) || (code >= 0x2060 && code <= 0x2064) || (code >= 0x2066 && code <= 0x2069);
}

/** Invisible characters or unpaired UTF-16 surrogates. */
function hasHiddenChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isInvisibleChar(code)) return true;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/** Plain text: NFC, trimmed, no control characters (line breaks only where `multiline`), no HTML-like markup, bounded length. */
function plainText(c: Ctx, input: unknown, field: string, spec: TextSpec, requiredMessage = 'This field is required.'): string {
  if (input === undefined || input === null) {
    if (!spec.optional) fail(c, field, requiredMessage);
    return '';
  }
  if (typeof input !== 'string') {
    fail(c, field, 'Must be text.');
    return '';
  }
  const text = input.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (text === '') {
    if (!spec.optional) fail(c, field, requiredMessage);
    return '';
  }
  if ((spec.multiline ? CONTROL_MULTI_LINE : CONTROL_SINGLE_LINE).test(text) || hasHiddenChars(text)) {
    fail(c, field, spec.multiline
      ? 'Contains characters that are not allowed (only line breaks are allowed besides normal text).'
      : 'Contains characters that are not allowed (line breaks, tabs, control or invisible characters).');
  } else if (MARKUP.test(text)) {
    fail(c, field, 'HTML tags are not allowed. Enter plain text only.');
  } else if (text.length > spec.max) {
    fail(c, field, `Too long: ${text.length} characters, the limit is ${spec.max}.`);
  }
  return text;
}

/** English is required unless the spec is optional; Tamil is always optional (empty means "show the English text"). */
function bilingual(c: Ctx, input: unknown, field: string, spec: TextSpec, requiredMessage = 'The English text is required.'): Bilingual {
  const o = input === undefined || input === null ? {} : readObject(c, input, field, ['en', 'ta']);
  return {
    en: plainText(c, own(o, 'en'), at(field, 'en'), spec, requiredMessage),
    ta: plainText(c, own(o, 'ta'), at(field, 'ta'), optional(spec)),
  };
}

/** A trimmed, non-empty string for machine values (ids, URLs, numbers). Returns undefined for absent/blank values. */
function token(c: Ctx, input: unknown, field: string, isOptional = false): string | undefined {
  if (input === undefined || input === null) {
    if (!isOptional) fail(c, field, 'This field is required.');
    return undefined;
  }
  if (typeof input !== 'string') {
    fail(c, field, 'Must be text.');
    return undefined;
  }
  const text = input.trim();
  if (text === '') {
    if (!isOptional) fail(c, field, 'This field is required.');
    return undefined;
  }
  return text;
}

function flag(c: Ctx, input: unknown, field: string): boolean {
  if (typeof input === 'boolean') return input;
  fail(c, field, input === undefined || input === null ? 'This field is required.' : 'Must be true or false.');
  return false;
}

function choice<T extends string>(c: Ctx, input: unknown, field: string, allowed: readonly T[], message: string): T {
  if (isOneOf(input, allowed)) return input;
  fail(c, field, input === undefined || input === null ? 'This field is required.' : message);
  return allowed[0];
}

function dimension(c: Ctx, input: unknown, field: string): number | null {
  if (input === undefined || input === null) return null;
  if (typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 && input <= MAX_PIXELS) return input;
  fail(c, field, `Must be a whole number from 1 to ${MAX_PIXELS}.`);
  return null;
}

/** Ids of list items. `seen` makes them unique across the lists that share it. */
function idValue(c: Ctx, input: unknown, field: string, seen?: Set<string>): string {
  const id = token(c, input, field);
  if (id === undefined) return '';
  if (!SITE_ID_PATTERN.test(id)) {
    fail(c, field, `Use letters, digits and hyphens only, starting with a letter (up to ${L.id} characters).`);
    return id;
  }
  if (seen) {
    if (seen.has(id)) fail(c, field, 'This id is used more than once.');
    seen.add(id);
  }
  return id;
}

const isBlank = (input: unknown): boolean => input === undefined || input === null || (typeof input === 'string' && input.trim() === '');

function nullableId(c: Ctx, input: unknown, field: string): string | null {
  return isBlank(input) ? null : idValue(c, input, field);
}

function documentId(c: Ctx, input: unknown, field: string): string {
  const id = token(c, input, field);
  if (id === undefined) return '';
  if (!DOCUMENT_ID_RE.test(id)) fail(c, field, 'Choose a document from the list.');
  return id;
}

function emailAddress(c: Ctx, input: unknown, field: string, isOptional = false): string {
  const text = token(c, input, field, isOptional);
  if (text === undefined) return '';
  if (text.length > L.email) fail(c, field, `Too long: ${text.length} characters, the limit is ${L.email}.`);
  else if (!EMAIL_RE.test(text) || text.includes('..')) fail(c, field, 'Enter a valid email address.');
  // The address is put into a mailto: link as written. ? & = % and # are legal in a mailbox name but turn the link into
  // one that pre-fills subject, body or bcc ("a?bcc=x@example.com"), so a plain address is required.
  else if (MAILTO_SPECIAL.test(text)) fail(c, field, 'Enter a plain email address without ? & = % or #.');
  return text;
}

/** A phone number as displayed ("1800-233-5666"), 3 to 15 digits. The tel: link is derived from it (telHrefFor). */
function displayedNumber(c: Ctx, input: unknown, field: string, isOptional = false): string {
  const text = token(c, input, field, isOptional);
  if (text === undefined) return '';
  const digits = text.replace(/\D/g, '').length;
  if (text.length > L.number) fail(c, field, `Too long: ${text.length} characters, the limit is ${L.number}.`);
  else if (!DISPLAYED_NUMBER_RE.test(text) || digits < 3 || digits > 15) fail(c, field, 'Enter a number with 3 to 15 digits; spaces and hyphens are allowed, and a leading +.');
  return text;
}

/** A phone number for a `phone` link: digits with an optional leading +; spaces and hyphens are removed. */
function diallableNumber(c: Ctx, input: unknown, field: string): string {
  const text = token(c, input, field);
  if (text === undefined) return '';
  const cleaned = text.replace(/[ -]/g, '');
  if (!DIALLABLE_RE.test(cleaned)) fail(c, field, 'Enter a phone number with 6 to 15 digits (a leading + is allowed).');
  return cleaned;
}

/* ------------------------------------------------------------------ links and addresses */

/** Problem with a route path (`/hospitals` or `/forms#policy-lists`), or null when it is a known route. */
function routeProblem(path: string): string | null {
  const hash = path.indexOf('#');
  const base = hash === -1 ? path : path.slice(0, hash);
  if (!SITE_ROUTES.some((route) => route.path === base)) return 'Choose one of the pages of this website.';
  if (hash !== -1 && !ANCHOR_RE.test(path.slice(hash + 1))) return 'The anchor after # may only contain letters, digits, - and _ (up to 64 characters).';
  return null;
}

/** True for one of SITE_ROUTES (exact, case-sensitive), optionally followed by `#anchor`. */
export function isKnownSiteRoute(path: string): boolean {
  return typeof path === 'string' && routeProblem(path) === null;
}

function parseHttpsUrl(raw: string): { href: string } | { problem: string } {
  const text = raw.trim();
  if (text.length > L.url) return { problem: `The web address is too long: ${text.length} characters, the limit is ${L.url}.` };
  if (!/^https:\/\//i.test(text)) return { problem: 'The web address must start with https://.' };
  if (URL_FORBIDDEN_CHARS.test(text)) return { problem: 'The web address must not contain spaces or control characters.' };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { problem: 'This is not a valid web address.' };
  }
  if (url.protocol !== 'https:' || url.hostname === '') return { problem: 'This is not a valid web address.' };
  if (url.username !== '' || url.password !== '') return { problem: 'The web address must not contain a user name or password.' };
  if (url.href.length > L.url) return { problem: `The web address is too long: ${url.href.length} characters, the limit is ${L.url}.` };
  return { href: url.href };
}

/** True for an absolute https:// address with a host, without credentials, within the length limit. */
export function isSafeHttpsUrl(url: string): boolean {
  return typeof url === 'string' && 'href' in parseHttpsUrl(url);
}

/** Returns the normalised address (URL.href), or '' after reporting a problem. */
function httpsUrl(c: Ctx, input: unknown, field: string): string {
  const text = token(c, input, field);
  if (text === undefined) return '';
  const parsed = parseHttpsUrl(text);
  if ('problem' in parsed) {
    fail(c, field, parsed.problem);
    return '';
  }
  return parsed.href;
}

function optionalUrl(c: Ctx, input: unknown, field: string): string | null {
  return isBlank(input) ? null : httpsUrl(c, input, field) || null;
}

function routePath(c: Ctx, input: unknown, field: string): string {
  const text = token(c, input, field);
  if (text === undefined) return '';
  const problem = routeProblem(text);
  if (problem) fail(c, field, problem);
  return text;
}

function linkTarget(c: Ctx, input: unknown, field: string): LinkTarget {
  const type = isRecord(input) ? own(input, 'type') : undefined;
  if (!isRecord(input) || !isOneOf(type, LINK_TARGET_TYPES)) {
    if (isRecord(input)) fail(c, at(field, 'type'), 'Choose what the link opens (page, web address, document, email or phone).');
    else fail(c, field, 'Must be an object.');
    return { type: 'route', path: '/' };
  }
  switch (type) {
    case 'route': {
      const o = readObject(c, input, field, ['type', 'path']);
      return { type, path: routePath(c, own(o, 'path'), at(field, 'path')) };
    }
    case 'external': {
      const o = readObject(c, input, field, ['type', 'url']);
      return { type, url: httpsUrl(c, own(o, 'url'), at(field, 'url')) };
    }
    case 'document': {
      const o = readObject(c, input, field, ['type', 'documentId']);
      return { type, documentId: documentId(c, own(o, 'documentId'), at(field, 'documentId')) };
    }
    case 'email': {
      const o = readObject(c, input, field, ['type', 'address']);
      return { type, address: emailAddress(c, own(o, 'address'), at(field, 'address')) };
    }
    case 'phone': {
      const o = readObject(c, input, field, ['type', 'number']);
      return { type, number: diallableNumber(c, own(o, 'number'), at(field, 'number')) };
    }
  }
}

const LINK_KEYS = ['id', 'label', 'target', 'visible'] as const;

function linkFields(c: Ctx, o: Rec, field: string, seen: Set<string>): LinkItem {
  return {
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    label: bilingual(c, own(o, 'label'), at(field, 'label'), LABEL),
    target: linkTarget(c, own(o, 'target'), at(field, 'target')),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

function linkItem(c: Ctx, input: unknown, field: string, seen: Set<string>): LinkItem {
  return linkFields(c, readObject(c, input, field, LINK_KEYS), field, seen);
}

/* ------------------------------------------------------------------ images */

const IMAGE_KEYS = ['assetId', 'builtIn', 'alt', 'width', 'height'] as const;

function siteImage(c: Ctx, input: unknown, field: string): SiteImage {
  if (input === undefined || input === null) {
    fail(c, field, 'An image is required.');
    return { assetId: null, builtIn: null, alt: { en: '', ta: '' }, width: null, height: null };
  }
  const o = readObject(c, input, field, IMAGE_KEYS);
  const assetField = at(field, 'assetId');
  const builtInField = at(field, 'builtIn');
  const assetText = token(c, own(o, 'assetId'), assetField, true);
  const builtInText = token(c, own(o, 'builtIn'), builtInField, true);
  let assetId: string | null = null;
  let builtIn: string | null = null;
  if (assetText !== undefined) {
    if (ASSET_ID_RE.test(assetText)) assetId = assetText;
    else fail(c, assetField, 'This is not a valid uploaded image.');
  }
  if (builtInText !== undefined) {
    if (BUILT_IN_ASSET_PATTERN.test(builtInText)) builtIn = builtInText;
    else fail(c, builtInField, 'This is not a known built-in image (PNG, JPEG or WebP in the assets folder).');
  }
  if (assetText === undefined && builtInText === undefined) fail(c, field, 'Choose or upload an image.');
  return {
    assetId,
    // An uploaded image wins over the built-in path.
    builtIn: assetId === null ? builtIn : null,
    alt: bilingual(c, own(o, 'alt'), at(field, 'alt'), ALT, 'Describe the image in English (alt text is required).'),
    width: dimension(c, own(o, 'width'), at(field, 'width')),
    height: dimension(c, own(o, 'height'), at(field, 'height')),
  };
}

function nullableImage(c: Ctx, input: unknown, field: string): SiteImage | null {
  return input === undefined || input === null ? null : siteImage(c, input, field);
}

/* ------------------------------------------------------------------ header */

function validateHeader(c: Ctx, input: unknown): HeaderContent {
  const o = readObject(c, input, '', ['emblem', 'portrait', 'showPortrait', 'title', 'subtitle', 'helplineHeading', 'helplines', 'availability', 'loginMenu']);
  // Ids are unique per list: helplines among themselves, login items together with the forgot-password link. The two
  // lists may reuse an id ("employee"): helpline ids are referenced by the homepage pathways, login ids by the portal links.
  const helplineIds = new Set<string>();
  const loginIds = new Set<string>();
  return {
    emblem: siteImage(c, own(o, 'emblem'), 'emblem'),
    portrait: siteImage(c, own(o, 'portrait'), 'portrait'),
    showPortrait: flag(c, own(o, 'showPortrait'), 'showPortrait'),
    title: bilingual(c, own(o, 'title'), 'title', HEADING),
    subtitle: bilingual(c, own(o, 'subtitle'), 'subtitle', HEADING),
    helplineHeading: bilingual(c, own(o, 'helplineHeading'), 'helplineHeading', HEADING),
    helplines: list(c, own(o, 'helplines'), 'helplines', L.helplines, (entry, field) => helpline(c, entry, field, helplineIds)),
    availability: plainText(c, own(o, 'availability'), 'availability', optional(LABEL)),
    loginMenu: loginMenu(c, own(o, 'loginMenu'), 'loginMenu', loginIds),
  };
}

function helpline(c: Ctx, input: unknown, field: string, seen: Set<string>): HelplineEntry {
  const o = readObject(c, input, field, ['id', 'label', 'number', 'visible']);
  return {
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    label: bilingual(c, own(o, 'label'), at(field, 'label'), LABEL),
    number: displayedNumber(c, own(o, 'number'), at(field, 'number')),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

function loginMenu(c: Ctx, input: unknown, field: string, seen: Set<string>): HeaderContent['loginMenu'] {
  const o = readObject(c, input, field, ['label', 'heading', 'items', 'forgotPassword']);
  return {
    label: bilingual(c, own(o, 'label'), at(field, 'label'), LABEL),
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    items: list(c, own(o, 'items'), at(field, 'items'), L.loginItems, (entry, entryField) => linkItem(c, entry, entryField, seen)),
    forgotPassword: linkItem(c, own(o, 'forgotPassword'), at(field, 'forgotPassword'), seen),
  };
}

/* ------------------------------------------------------------------ navigation */

function validateNavigation(c: Ctx, input: unknown): NavigationContent {
  const o = readObject(c, input, '', ['items']);
  const seen = new Set<string>();
  const raw = own(o, 'items');
  const items = list(c, raw, 'items', L.navItems, (entry, field) => navItem(c, entry, field, seen));
  if (Array.isArray(raw) && !items.some((item) => item.visible)) fail(c, 'items', 'The main menu needs at least one visible item.');
  return { items };
}

function navItem(c: Ctx, input: unknown, field: string, seen: Set<string>): NavLink | NavMenu | undefined {
  const type = isRecord(input) ? own(input, 'type') : undefined;
  if (type === 'link') return navLink(c, input, field, seen);
  if (type === 'menu') return navMenu(c, input, field, seen);
  if (isRecord(input)) fail(c, at(field, 'type'), 'Must be "link" or "menu".');
  else fail(c, field, 'Must be an object.');
  return undefined;
}

function navLink(c: Ctx, input: unknown, field: string, seen: Set<string>): NavLink {
  return { type: 'link', ...linkFields(c, readObject(c, input, field, [...LINK_KEYS, 'type']), field, seen) };
}

function navHeading(c: Ctx, input: unknown, field: string, seen: Set<string>): NavHeading {
  const o = readObject(c, input, field, ['type', 'id', 'label', 'visible']);
  return {
    type: 'heading',
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    label: bilingual(c, own(o, 'label'), at(field, 'label'), LABEL),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

function navMenu(c: Ctx, input: unknown, field: string, seen: Set<string>): NavMenu {
  const o = readObject(c, input, field, ['type', 'id', 'label', 'visible', 'children']);
  const id = idValue(c, own(o, 'id'), at(field, 'id'), seen);
  const label = bilingual(c, own(o, 'label'), at(field, 'label'), LABEL);
  const visible = flag(c, own(o, 'visible'), at(field, 'visible'));
  const rawChildren = own(o, 'children');
  const children = list<NavLink | NavHeading>(c, rawChildren, at(field, 'children'), L.navChildren, (entry, entryField) => {
    const type = isRecord(entry) ? own(entry, 'type') : undefined;
    if (type === 'link') return navLink(c, entry, entryField, seen);
    if (type === 'heading') return navHeading(c, entry, entryField, seen);
    if (isRecord(entry)) fail(c, at(entryField, 'type'), 'Must be "link" or "heading".');
    else fail(c, entryField, 'Must be an object.');
    return undefined;
  });
  if (Array.isArray(rawChildren) && !children.some((child) => child.type === 'link')) fail(c, at(field, 'children'), 'A menu needs at least one link.');
  return { type: 'menu', id, label, visible, children };
}

/* ------------------------------------------------------------------ home */

function validateHome(c: Ctx, input: unknown): HomeContent {
  const o = readObject(c, input, '', ['sections', 'hero', 'quickAccess', 'pathways', 'documents', 'coverage', 'helplines', 'highlights']);
  return {
    sections: homeSections(c, own(o, 'sections')),
    hero: homeHero(c, own(o, 'hero'), 'hero'),
    quickAccess: quickAccess(c, own(o, 'quickAccess'), 'quickAccess'),
    pathways: pathways(c, own(o, 'pathways'), 'pathways'),
    documents: homeDocuments(c, own(o, 'documents'), 'documents'),
    coverage: coveragePanel(c, own(o, 'coverage'), 'coverage'),
    helplines: helplinePanel(c, own(o, 'helplines'), 'helplines'),
    highlights: highlights(c, own(o, 'highlights'), 'highlights'),
  };
}

/** Every section exactly once, hero first and visible. */
function homeSections(c: Ctx, input: unknown): HomeSectionSetting[] {
  // Parallel to the returned list: the id of each entry, or null when it is not a known section.
  const order: Array<HomeSectionId | null> = [];
  const sections = list<HomeSectionSetting>(c, input, 'sections', HOME_SECTION_IDS.length, (entry, field) => {
    const o = readObject(c, entry, field, ['id', 'visible']);
    const raw = own(o, 'id');
    const known = isOneOf(raw, HOME_SECTION_IDS) ? raw : null;
    if (known !== null && order.includes(known)) fail(c, at(field, 'id'), 'This section is listed more than once.');
    order.push(known);
    return {
      id: choice(c, raw, at(field, 'id'), HOME_SECTION_IDS, 'This is not a known homepage section.'),
      visible: flag(c, own(o, 'visible'), at(field, 'visible')),
    };
  });
  if (!Array.isArray(input)) return sections;
  const missing = HOME_SECTION_IDS.filter((id) => !order.includes(id));
  if (missing.length > 0) fail(c, 'sections', `Every section must be listed exactly once. Missing: ${missing.join(', ')}.`);
  const heroIndex = order.indexOf('hero');
  if (heroIndex > 0) fail(c, 'sections[0].id', 'The hero section must stay first.');
  if (heroIndex !== -1 && !sections[heroIndex].visible) fail(c, `${itemAt('sections', heroIndex)}.visible`, 'The hero section cannot be hidden.');
  return sections;
}

function homeHero(c: Ctx, input: unknown, field: string): HomeContent['hero'] {
  const o = readObject(c, input, field, ['eyebrow', 'title', 'description', 'coverageHeading', 'coverageStatement', 'actions', 'banner', 'search']);
  const seen = new Set<string>();
  return {
    eyebrow: bilingual(c, own(o, 'eyebrow'), at(field, 'eyebrow'), LABEL),
    title: bilingual(c, own(o, 'title'), at(field, 'title'), HEADING),
    description: bilingual(c, own(o, 'description'), at(field, 'description'), optional(TEXT)),
    coverageHeading: bilingual(c, own(o, 'coverageHeading'), at(field, 'coverageHeading'), HEADING),
    coverageStatement: bilingual(c, own(o, 'coverageStatement'), at(field, 'coverageStatement'), LONG_TEXT),
    actions: list(c, own(o, 'actions'), at(field, 'actions'), L.homeActions, (entry, entryField) => homeAction(c, entry, entryField, seen)),
    banner: nullableImage(c, own(o, 'banner'), at(field, 'banner')),
    search: heroSearch(c, own(o, 'search'), at(field, 'search')),
  };
}

function homeAction(c: Ctx, input: unknown, field: string, seen: Set<string>): HomeActionLink {
  const o = readObject(c, input, field, [...LINK_KEYS, 'variant']);
  return {
    ...linkFields(c, o, field, seen),
    variant: choice(c, own(o, 'variant'), at(field, 'variant'), ACTION_VARIANTS, 'Choose primary, secondary or ghost.'),
  };
}

function heroSearch(c: Ctx, input: unknown, field: string): HomeContent['hero']['search'] {
  const o = readObject(c, input, field, ['heading', 'hint', 'placeholder', 'button', 'browseAll', 'showCount']);
  return {
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    hint: bilingual(c, own(o, 'hint'), at(field, 'hint'), optional(TEXT)),
    placeholder: bilingual(c, own(o, 'placeholder'), at(field, 'placeholder'), LABEL),
    button: bilingual(c, own(o, 'button'), at(field, 'button'), LABEL),
    browseAll: bilingual(c, own(o, 'browseAll'), at(field, 'browseAll'), LABEL),
    showCount: flag(c, own(o, 'showCount'), at(field, 'showCount')),
  };
}

function quickAccess(c: Ctx, input: unknown, field: string): HomeContent['quickAccess'] {
  const o = readObject(c, input, field, ['heading', 'tiles']);
  const seen = new Set<string>();
  return {
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    tiles: list(c, own(o, 'tiles'), at(field, 'tiles'), L.quickTiles, (entry, entryField) => quickTile(c, entry, entryField, seen)),
  };
}

function quickTile(c: Ctx, input: unknown, field: string, seen: Set<string>): QuickTile {
  const o = readObject(c, input, field, ['id', 'icon', 'label', 'hint', 'target', 'visible']);
  return {
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    icon: choice(c, own(o, 'icon'), at(field, 'icon'), SITE_ICON_NAMES, 'Choose one of the available icons.'),
    label: bilingual(c, own(o, 'label'), at(field, 'label'), LABEL),
    hint: bilingual(c, own(o, 'hint'), at(field, 'hint'), optional(LABEL)),
    target: linkTarget(c, own(o, 'target'), at(field, 'target')),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

function pathways(c: Ctx, input: unknown, field: string): HomeContent['pathways'] {
  const o = readObject(c, input, field, ['heading', 'groups']);
  const seen = new Set<string>();
  return {
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    groups: list(c, own(o, 'groups'), at(field, 'groups'), L.pathwayGroups, (entry, entryField) => pathwayGroup(c, entry, entryField, seen)),
  };
}

function pathwayGroup(c: Ctx, input: unknown, field: string, seen: Set<string>): PathwayGroup {
  const o = readObject(c, input, field, ['id', 'heading', 'links', 'helplineId', 'visible']);
  const linkIds = new Set<string>();
  return {
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    links: list(c, own(o, 'links'), at(field, 'links'), L.pathwayLinks, (entry, entryField) => pathwayLink(c, entry, entryField, linkIds)),
    helplineId: nullableId(c, own(o, 'helplineId'), at(field, 'helplineId')),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

function pathwayLink(c: Ctx, input: unknown, field: string, seen: Set<string>): PathwayLink {
  const o = readObject(c, input, field, [...LINK_KEYS, 'icon']);
  return {
    ...linkFields(c, o, field, seen),
    icon: choice(c, own(o, 'icon'), at(field, 'icon'), SITE_ICON_NAMES, 'Choose one of the available icons.'),
  };
}

function homeDocuments(c: Ctx, input: unknown, field: string): HomeContent['documents'] {
  const o = readObject(c, input, field, ['heading', 'intro', 'documentIds', 'categories', 'links']);
  const documentIds = new Set<string>();
  const categories = new Set<string>();
  const linkIds = new Set<string>();
  return {
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    intro: bilingual(c, own(o, 'intro'), at(field, 'intro'), optional(TEXT)),
    documentIds: list(c, own(o, 'documentIds'), at(field, 'documentIds'), L.documentIds, (entry, entryField) => {
      const id = documentId(c, entry, entryField);
      if (documentIds.has(id)) fail(c, entryField, 'This document is listed more than once.');
      documentIds.add(id);
      return id;
    }),
    categories: list(c, own(o, 'categories'), at(field, 'categories'), DOCUMENT_CATEGORIES.length, (entry, entryField) => {
      const category = choice(c, entry, entryField, DOCUMENT_CATEGORIES, 'This is not a known document category.');
      if (isOneOf(entry, DOCUMENT_CATEGORIES)) {
        if (categories.has(category)) fail(c, entryField, 'This category is listed more than once.');
        categories.add(category);
      }
      return category;
    }),
    // No limit of its own in SITE_CONTENT_LIMITS: bounded like a footer group.
    links: list(c, own(o, 'links'), at(field, 'links'), L.footerLinks, (entry, entryField) => linkItem(c, entry, entryField, linkIds)),
  };
}

function coveragePanel(c: Ctx, input: unknown, field: string): HomeContent['coverage'] {
  const o = readObject(c, input, field, ['heading', 'linkLabel']);
  return {
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    linkLabel: bilingual(c, own(o, 'linkLabel'), at(field, 'linkLabel'), LABEL),
  };
}

function helplinePanel(c: Ctx, input: unknown, field: string): HomeContent['helplines'] {
  const o = readObject(c, input, field, ['heading', 'intro']);
  return {
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    intro: bilingual(c, own(o, 'intro'), at(field, 'intro'), optional(TEXT)),
  };
}

function highlights(c: Ctx, input: unknown, field: string): HomeContent['highlights'] {
  const o = readObject(c, input, field, ['heading', 'intro', 'items']);
  const seen = new Set<string>();
  return {
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    intro: bilingual(c, own(o, 'intro'), at(field, 'intro'), optional(TEXT)),
    items: list(c, own(o, 'items'), at(field, 'items'), L.highlights, (entry, entryField) => highlight(c, entry, entryField, seen)),
  };
}

function highlight(c: Ctx, input: unknown, field: string, seen: Set<string>): HighlightItem {
  const o = readObject(c, input, field, ['id', 'value', 'label', 'note', 'visible']);
  return {
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    value: bilingual(c, own(o, 'value'), at(field, 'value'), LABEL),
    label: bilingual(c, own(o, 'label'), at(field, 'label'), LABEL),
    note: bilingual(c, own(o, 'note'), at(field, 'note'), optional(TEXT)),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

/* ------------------------------------------------------------------ partners */

function validatePartners(c: Ctx, input: unknown): PartnersContent {
  const o = readObject(c, input, '', ['heading', 'categories', 'partners']);
  const categoryIds = new Set<string>();
  const partnerIds = new Set<string>();
  return {
    heading: bilingual(c, own(o, 'heading'), 'heading', HEADING),
    categories: list(c, own(o, 'categories'), 'categories', L.partnerCategories, (entry, field) => partnerCategory(c, entry, field, categoryIds)),
    partners: list(c, own(o, 'partners'), 'partners', L.partners, (entry, field) => partnerEntry(c, entry, field, partnerIds, categoryIds)),
  };
}

function partnerCategory(c: Ctx, input: unknown, field: string, seen: Set<string>): PartnerCategory {
  const o = readObject(c, input, field, ['id', 'caption', 'visible']);
  return {
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    caption: bilingual(c, own(o, 'caption'), at(field, 'caption'), LABEL),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

function partnerEntry(c: Ctx, input: unknown, field: string, seen: Set<string>, categoryIds: Set<string>): PartnerEntry {
  const o = readObject(c, input, field, ['id', 'categoryId', 'name', 'logo', 'url', 'visible']);
  const id = idValue(c, own(o, 'id'), at(field, 'id'), seen);
  const categoryField = at(field, 'categoryId');
  const categoryId = idValue(c, own(o, 'categoryId'), categoryField);
  if (SITE_ID_PATTERN.test(categoryId) && !categoryIds.has(categoryId)) fail(c, categoryField, 'Choose one of the partner groups.');
  return {
    id,
    categoryId,
    name: bilingual(c, own(o, 'name'), at(field, 'name'), LABEL),
    logo: siteImage(c, own(o, 'logo'), at(field, 'logo')),
    url: optionalUrl(c, own(o, 'url'), at(field, 'url')),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

/* ------------------------------------------------------------------ footer */

function validateFooter(c: Ctx, input: unknown): FooterContent {
  const o = readObject(c, input, '', ['showWordmark', 'logos', 'about', 'linkGroups', 'helplines', 'contact', 'copyright']);
  const logoIds = new Set<string>();
  const groupIds = new Set<string>();
  return {
    showWordmark: flag(c, own(o, 'showWordmark'), 'showWordmark'),
    logos: list(c, own(o, 'logos'), 'logos', L.footerLogos, (entry, field) => footerLogo(c, entry, field, logoIds)),
    about: footerAbout(c, own(o, 'about'), 'about'),
    linkGroups: list(c, own(o, 'linkGroups'), 'linkGroups', L.footerGroups, (entry, field) => footerGroup(c, entry, field, groupIds)),
    helplines: footerHelplines(c, own(o, 'helplines'), 'helplines'),
    contact: footerContact(c, own(o, 'contact'), 'contact'),
    copyright: bilingual(c, own(o, 'copyright'), 'copyright', TEXT),
  };
}

function footerLogo(c: Ctx, input: unknown, field: string, seen: Set<string>): FooterLogo {
  const o = readObject(c, input, field, ['id', 'image', 'url', 'visible']);
  return {
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    image: siteImage(c, own(o, 'image'), at(field, 'image')),
    url: optionalUrl(c, own(o, 'url'), at(field, 'url')),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

function footerAbout(c: Ctx, input: unknown, field: string): FooterContent['about'] {
  const o = readObject(c, input, field, ['heading', 'text']);
  return {
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    text: bilingual(c, own(o, 'text'), at(field, 'text'), LONG_TEXT),
  };
}

function footerGroup(c: Ctx, input: unknown, field: string, seen: Set<string>): FooterLinkGroup {
  const o = readObject(c, input, field, ['id', 'heading', 'links', 'visible']);
  const linkIds = new Set<string>();
  return {
    id: idValue(c, own(o, 'id'), at(field, 'id'), seen),
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    links: list(c, own(o, 'links'), at(field, 'links'), L.footerLinks, (entry, entryField) => linkItem(c, entry, entryField, linkIds)),
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
  };
}

function footerHelplines(c: Ctx, input: unknown, field: string): FooterContent['helplines'] {
  const o = readObject(c, input, field, ['visible', 'heading']);
  return {
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
  };
}

function footerContact(c: Ctx, input: unknown, field: string): FooterContent['contact'] {
  const o = readObject(c, input, field, ['visible', 'heading', 'address', 'email', 'phone']);
  return {
    visible: flag(c, own(o, 'visible'), at(field, 'visible')),
    heading: bilingual(c, own(o, 'heading'), at(field, 'heading'), HEADING),
    address: bilingual(c, own(o, 'address'), at(field, 'address'), ADDRESS),
    email: emailAddress(c, own(o, 'email'), at(field, 'email'), true),
    phone: displayedNumber(c, own(o, 'phone'), at(field, 'phone'), true),
  };
}

/* ------------------------------------------------------------------ interface text */

function placeholdersOf(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(PLACEHOLDER), (match) => match[1]));
}

const braced = (names: string[]): string => names.map((name) => `{${name}}`).join(', ');

/** Every {placeholder} of the built-in text must be kept unchanged, and no other placeholder may be added. */
function checkPlaceholders(c: Ctx, builtIn: string, text: string, field: string): void {
  const expected = placeholdersOf(builtIn);
  const actual = placeholdersOf(text);
  const missing = Array.from(expected).filter((name) => !actual.has(name));
  const extra = Array.from(actual).filter((name) => !expected.has(name));
  if (missing.length > 0) fail(c, field, `Keep ${braced(missing)} exactly as written. The website fills it in.`);
  else if (extra.length > 0) fail(c, field, `${braced(extra)} cannot be used in this text.`);
}

function validateText(c: Ctx, input: unknown): TextContent {
  const o = readObject(c, input, '', ['overrides']);
  const raw = own(o, 'overrides');
  const overrides: Record<string, Bilingual> = {};
  if (raw === undefined || raw === null) {
    fail(c, 'overrides', 'This field is required.');
  } else if (!isRecord(raw)) {
    fail(c, 'overrides', 'Must be an object.');
  } else {
    for (const key of Object.keys(raw)) {
      const field = at('overrides', key);
      const entry = editableTextEntry(key);
      if (!entry) {
        fail(c, field, 'This text cannot be changed here.');
        continue;
      }
      // An empty language means "keep the built-in text"; an entry that is empty in both languages is dropped.
      const spec: TextSpec = { max: entry.maxLength, multiline: entry.multiline, optional: true };
      const value = bilingual(c, own(raw, key), field, spec);
      if (value.en !== '') checkPlaceholders(c, entry.defaults.en, value.en, at(field, 'en'));
      if (value.ta !== '') checkPlaceholders(c, entry.defaults.ta || entry.defaults.en, value.ta, at(field, 'ta'));
      if (value.en !== '' || value.ta !== '') overrides[key] = value;
    }
  }
  return { overrides };
}

/* ------------------------------------------------------------------ entry point */

function validateManual(c: Ctx, input: unknown): UserManualContent {
  const o = readObject(c, input, '', ['title', 'intro', 'manual', 'videos']);
  const source = (input: unknown, field: string, video: boolean): ManualMediaSource => {
    const kind = isRecord(input) ? own(input, 'type') : undefined;
    const o = readObject(c, input, field, kind === 'upload' ? ['type', 'assetId'] : kind === 'external' ? ['type', 'url'] : ['type', 'path']);
    if (kind === 'upload') {
      const assetId = token(c, own(o, 'assetId'), at(field, 'assetId')) ?? '';
      if (!ASSET_ID_RE.test(assetId)) fail(c, at(field, 'assetId'), 'Use a valid uploaded asset ID.');
      return { type: 'upload', assetId };
    }
    if (kind === 'external' && video) {
      const typed = token(c, own(o, 'url'), at(field, 'url')) ?? '';
      // Stored in its normalised form (URL.href) like every other address of the site content: what is stored is what a browser reads.
      const parsed = parseHttpsUrl(typed);
      const url = 'href' in parsed ? parsed.href : '';
      if (url === '' || url.length > 500) fail(c, at(field, 'url'), 'Use an https web address without credentials.');
      return { type: 'external', url };
    }
    if (kind !== 'builtIn') fail(c, at(field, 'type'), 'Choose a supported source type.');
    const path = token(c, own(o, 'path'), at(field, 'path')) ?? '';
    if (video ? !(MANUAL_VIDEO_FILES as readonly string[]).includes(path) : path !== MANUAL_PDF) fail(c, at(field, 'path'), 'Unknown built-in file.');
    return { type: 'builtIn', path };
  };
  const m = readObject(c, own(o, 'manual'), 'manual', ['title', 'buttonLabel', 'visible', 'source']);
  const seen = new Set<string>();
  return {
    title: bilingual(c, own(o, 'title'), 'title', { max: L.heading }),
    intro: bilingual(c, own(o, 'intro'), 'intro', { max: L.text, optional: true, multiline: true }),
    manual: { title: bilingual(c, own(m, 'title'), 'manual.title', { max: L.heading }), buttonLabel: bilingual(c, own(m, 'buttonLabel'), 'manual.buttonLabel', { max: L.label }), visible: flag(c, own(m, 'visible'), 'manual.visible'), source: source(own(m, 'source'), 'manual.source', false) },
    videos: list(c, own(o, 'videos'), 'videos', 40, (input, field) => {
      const v = readObject(c, input, field, ['id', 'title', 'description', 'visible', 'source']);
      return { id: idValue(c, own(v, 'id'), at(field, 'id'), seen), title: bilingual(c, own(v, 'title'), at(field, 'title'), { max: L.heading }), description: bilingual(c, own(v, 'description'), at(field, 'description'), { max: L.text, optional: true, multiline: true }), visible: flag(c, own(v, 'visible'), at(field, 'visible')), source: source(own(v, 'source'), at(field, 'source'), true) };
    }),
  };
}

const VALIDATORS: { [K in SiteContentKey]: (c: Ctx, input: unknown) => SiteContentMap[K] } = {
  header: validateHeader,
  navigation: validateNavigation,
  home: validateHome,
  partners: validatePartners,
  footer: validateFooter,
  text: validateText,
  manual: validateManual,
};

/** Size of the JSON text in UTF-8 bytes (no Buffer: the module also runs in browsers), or null when it cannot be serialised. */
function jsonBytes(input: unknown): number | null {
  let json: string | undefined;
  try {
    json = JSON.stringify(input);
  } catch {
    return null;
  }
  if (json === undefined) return null;
  let bytes = 0;
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < json.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function rejected(message: string): { ok: false; issues: SiteContentIssue[] } {
  return { ok: false, issues: [{ field: '', message }] };
}

/**
 * Validates and normalises one site-content document. Never throws for bad input.
 * `ok: true` carries a normalised deep copy; `ok: false` carries every problem found (at most about 100).
 */
export function validateSiteContent<K extends SiteContentKey>(key: K, input: unknown): SiteContentValidation<K> {
  if (!isSiteContentKey(key)) return rejected('This is not a known content document.');
  const bytes = jsonBytes(input);
  if (bytes === null) return rejected('The content could not be read.');
  if (bytes > SITE_CONTENT_MAX_BYTES) {
    return rejected(`The content is too large (${Math.ceil(bytes / 1000)} KB, the limit is ${Math.floor(SITE_CONTENT_MAX_BYTES / 1000)} KB).`);
  }
  if (!isRecord(input)) return rejected('The content must be an object.');
  const c: Ctx = { issues: [], broken: [] };
  const value = VALIDATORS[key](c, input) as SiteContentMap[K];
  return c.issues.length === 0 ? { ok: true, value } : { ok: false, issues: c.issues };
}

/* ------------------------------------------------------------------ helpers for other code */

/** `tel:` link for a number as displayed: digits and a leading + only. */
export function telHrefFor(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`;
}

type AnyDocument = SiteContentMap[SiteContentKey];
type LinkLike = { target: LinkTarget };

const documentIdsOf = (links: readonly LinkLike[]): string[] =>
  links.flatMap((link) => (link.target.type === 'document' ? [link.target.documentId] : []));

/** Ids of Documents-module files referenced by the (validated) document, in document order. */
function documentRefs(key: SiteContentKey, doc: AnyDocument): string[] {
  switch (key) {
    case 'header': {
      const { loginMenu } = doc as HeaderContent;
      return documentIdsOf([...loginMenu.items, loginMenu.forgotPassword]);
    }
    case 'navigation':
      return (doc as NavigationContent).items.flatMap((item) => (item.type === 'link'
        ? documentIdsOf([item])
        : documentIdsOf(item.children.filter((child): child is NavLink => child.type === 'link'))));
    case 'home': {
      const home = doc as HomeContent;
      return [
        ...documentIdsOf(home.hero.actions),
        ...documentIdsOf(home.quickAccess.tiles),
        ...documentIdsOf(home.pathways.groups.flatMap((group) => group.links)),
        ...home.documents.documentIds,
        ...documentIdsOf(home.documents.links),
      ];
    }
    case 'footer':
      return documentIdsOf((doc as FooterContent).linkGroups.flatMap((group) => group.links));
    default:
      return [];
  }
}

/** Every image slot of a document (in document order) with a setter, so that images can be read or replaced uniformly. */
function imageSlots(key: SiteContentKey, doc: AnyDocument): Array<{ image: SiteImage; set: (next: SiteImage) => void }> {
  switch (key) {
    case 'header': {
      const header = doc as HeaderContent;
      return [
        { image: header.emblem, set: (next) => { header.emblem = next; } },
        { image: header.portrait, set: (next) => { header.portrait = next; } },
      ];
    }
    case 'home': {
      const { hero } = doc as HomeContent;
      const banner = hero.banner;
      return banner ? [{ image: banner, set: (next) => { hero.banner = next; } }] : [];
    }
    case 'partners':
      return (doc as PartnersContent).partners.map((partner) => ({ image: partner.logo, set: (next: SiteImage) => { partner.logo = next; } }));
    case 'footer':
      return (doc as FooterContent).logos.map((logo) => ({ image: logo.image, set: (next: SiteImage) => { logo.image = next; } }));
    default:
      return [];
  }
}

/** Documents-module ids and uploaded-image ids a (validated) document refers to, de-duplicated, in document order. */
export function collectSiteContentRefs<K extends SiteContentKey>(key: K, value: SiteContentMap[K]): SiteContentRefs {
  const assetIds = imageSlots(key, value).flatMap(({ image }) => (image.assetId ? [image.assetId] : []));
  return { documentIds: Array.from(new Set(documentRefs(key, value))), assetIds: Array.from(new Set(assetIds)) };
}

function cloneData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry: unknown) => cloneData(entry)) as unknown as T;
  if (typeof value === 'object' && value !== null) {
    const copy: Rec = {};
    for (const [name, entry] of Object.entries(value)) {
      if (name !== '__proto__') copy[name] = cloneData(entry);
    }
    return copy as T;
  }
  return value;
}

/** A copy of the (already validated) document in which every SiteImage has been replaced by `fn(image)`. The input is not modified. */
export function mapSiteImages<K extends SiteContentKey>(key: K, value: SiteContentMap[K], fn: (image: SiteImage) => SiteImage): SiteContentMap[K] {
  const copy = cloneData(value);
  for (const slot of imageSlots(key, copy)) slot.set(fn(slot.image));
  return copy;
}
