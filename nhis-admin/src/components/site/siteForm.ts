import {
  BUILT_IN_ASSET_PATTERN, SITE_ID_PATTERN, editableTextEntry, validateSiteContent,
  type SiteContentIssue, type SiteContentKey, type SiteContentMap, type SiteImage,
} from '@nhis/shared-types';
import { fieldErrorMap } from '../../services/http';

/*
 * Pure helpers shared by the site-content form components (no React, no `import.meta`, so they run in the node tests).
 * Error keys are field paths with dots for list indexes: `helplines.2.label.en` (see normaliseFieldPath in services/http).
 */

export type FieldErrors = Record<string, string>;

/** Validator or server issues -> `{ path: first message }`, with the same path format as errors from the API. */
export function issuesToFieldErrors(issues: readonly SiteContentIssue[]): FieldErrors {
  return fieldErrorMap(issues);
}

/** Runs the shared validator on the form values. Returns {} when the document is valid. */
export function validateSiteValues<K extends SiteContentKey>(key: K, values: SiteContentMap[K]): FieldErrors {
  const result = validateSiteContent(key, values);
  return result.ok ? {} : issuesToFieldErrors(result.issues);
}

/** True when an error exists at `path` or anywhere beneath it (`helplines.2` covers `helplines.2.label.en`). */
export function hasErrorUnder(errors: FieldErrors, path: string): boolean {
  const prefix = `${path}.`;
  return Object.keys(errors).some((key) => key === path || key.startsWith(prefix));
}

/** The first error at one of the given paths, in the order given. */
export function firstError(errors: FieldErrors, ...paths: string[]): string | undefined {
  for (const path of paths) {
    const message = errors[path];
    if (message) return message;
  }
  return undefined;
}

const SEGMENT_WORDS: Record<string, string> = { en: 'English', ta: 'Tamil', url: 'web address', id: 'id' };

/** Readable form of a field path for the error summary: `loginMenu.items.2.label.en` -> "Login menu > Items > 3 > Label > English". */
export function describeFieldPath(path: string): string {
  if (path === '') return 'The content';
  // Interface texts: the key of a message contains dots ("hospitals.intro"), so name the text by its catalog entry instead.
  // The dots are literal: an unescaped "." also matched a letter, so a key whose last word ends in "en" or "ta" lost those letters.
  const text = /^overrides\.(.+?)(?:\.(en|ta))?$/.exec(path);
  if (text) {
    const entry = editableTextEntry(text[1] as string);
    if (entry) return `${entry.group}: ${entry.label}${text[2] ? ` > ${SEGMENT_WORDS[text[2]]}` : ''}`;
  }
  return path.split('.').map((segment) => {
    if (/^\d+$/.test(segment)) return String(Number(segment) + 1);
    const word = SEGMENT_WORDS[segment] ?? segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' > ');
}

/** Number of characters as the shared validator counts them (NFC, trimmed, UTF-16 units). */
export function characterCount(text: string): number {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').trim().length;
}

/* ------------------------------------------------------------------ ids */

const ID_SUFFIX_LENGTH = 4;
const RANDOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Lower-case ASCII slug of a text: letters, digits and single hyphens ("Employee Helpline!" -> "employee-helpline"). */
export function slugify(text: string): string {
  return text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * New id for a list item: a slug of `base` plus a short random suffix ("helpline-k3x9"), unique among `taken`.
 * Always matches SITE_ID_PATTERN (starts with a letter, letters/digits/hyphens, at most 40 characters). `base` may be
 * Tamil or empty; the slug is then "item". `random` is injectable for tests.
 */
export function makeSiteId(base: string, taken: Iterable<string>, random: () => number = Math.random): string {
  const used = new Set(taken);
  let slug = slugify(base);
  if (!/^[a-z]/.test(slug)) slug = slug === '' ? 'item' : `item-${slug}`;
  // Leave room for "-" and the suffix within the 40 characters of SITE_ID_PATTERN.
  slug = slug.slice(0, 40 - 1 - ID_SUFFIX_LENGTH).replace(/-+$/, '');
  for (;;) {
    let suffix = '';
    for (let i = 0; i < ID_SUFFIX_LENGTH; i++) suffix += RANDOM_ALPHABET.charAt(Math.floor(random() * RANDOM_ALPHABET.length) % RANDOM_ALPHABET.length);
    const id = `${slug}-${suffix}`;
    if (SITE_ID_PATTERN.test(id) && !used.has(id)) return id;
  }
}

/* ------------------------------------------------------------------ list operations (immutable) */

/** Moves the entry at `from` to `to`. Returns the same array when either index is outside the list or they are equal. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items as T[];
  const next = items.slice();
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry as T);
  return next;
}

export function removeItem<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export function replaceItem<T>(items: readonly T[], index: number, next: T): T[] {
  return items.map((entry, i) => (i === index ? next : entry));
}

/** Plural of a lower-case English noun used in the forms: "entry" -> "entries", "group" -> "groups", "branch" -> "branches". */
export function pluralise(noun: string): string {
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

/** Text for the polite live region after a list change. */
export function describeMove(noun: string, from: number, to: number, count: number, name?: string): string {
  const label = name ?? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${from + 1}`;
  return `${label} moved ${to < from ? 'up' : 'down'} to position ${to + 1} of ${count}.`;
}

export function describeRemoval(noun: string, index: number, remaining: number, plural: string = pluralise(noun), name?: string): string {
  const label = name ?? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${index + 1}`;
  return `${label} removed. ${remaining === 0 ? `No ${plural} left.` : `${remaining} ${remaining === 1 ? noun : plural} left.`}`;
}

export function describeAddition(noun: string, position: number, count: number): string {
  const label = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
  return `${label} added at position ${position} of ${count}.`;
}

/* ------------------------------------------------------------------ images */

/** Path of an uploaded image for the signed-in admin (cookie session). Resolve it with resolveApiUrl() before use in an <img>. */
export const adminAssetPath = (assetId: string): string => `/api/v1/admin/files/${encodeURIComponent(assetId)}`;

/** The rule of the shared validator for the id of an uploaded image (8 to 64 letters, digits, "-" or "_"). */
export const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Problem with a typed asset id, or null when it has the right shape (the server checks that it is an uploaded image). */
export function assetIdProblem(text: string): string | null {
  if (text.trim() === '') return 'Enter the asset ID of an uploaded image.';
  return ASSET_ID_PATTERN.test(text.trim()) ? null : 'This is not an asset ID. It has 8 to 64 letters, digits, - or _ and is shown under an uploaded image.';
}

/** An image slot with nothing chosen yet. Sizes stay null: the server reads them from the stored file. */
export function emptySiteImage(): SiteImage {
  return { assetId: null, builtIn: null, alt: { en: '', ta: '' }, width: null, height: null };
}

/** File name of a built-in image path ("assets/header-portrait.jpg" -> "header-portrait.jpg"). */
export const builtInFileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * Address of an image that ships with the website, for the preview in the editor: the public site (`clientBase`, for example
 * "/TNNHIS/") serves it from its own folder. Only a path of the shape the validator accepts (BUILT_IN_ASSET_PATTERN: a file
 * of the assets folder) gives an address; anything else gives null, so the editor never builds a request from a stray string.
 */
export function builtInImageUrl(clientBase: string, path: string): string | null {
  return BUILT_IN_ASSET_PATTERN.test(path) ? `${clientBase.replace(/\/+$/, '')}/${path}` : null;
}
