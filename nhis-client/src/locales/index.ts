import type { Locale } from '@nhis/shared-types';
import { en, type MessageKey } from './en';
import { taSource } from './ta.source';
import { taProposed } from './ta.proposed';

export type { MessageKey } from './en';
export type MessageParams = Record<string, string | number>;

type Flat = Record<string, string>;

function flatten(tree: object, prefix = '', out: Flat = {}): Flat {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else flatten(value as object, path, out);
  }
  return out;
}

const enFlat = flatten(en);
export const ALL_MESSAGE_KEYS = Object.keys(enFlat) as MessageKey[];

export type MessageOrigin = 'source' | 'proposed' | 'fallback-en' | 'english';

const missingTamil = new Set<MessageKey>();

/** Tamil keys that have neither a source label nor a proposed draft (they fall back to English). */
export function listMissingTamilKeys(): MessageKey[] {
  return ALL_MESSAGE_KEYS.filter((key) => !(key in taSource) && !(key in taProposed));
}

/** Tamil keys that are drafts requiring review (not taken from the source site). */
export function listProposedTamilKeys(): MessageKey[] {
  return (Object.keys(taProposed) as MessageKey[]).filter((key) => !(key in taSource));
}

/** Keys requested at runtime that fell back to English (useful in development). */
export function getRuntimeMissingTamilKeys(): MessageKey[] {
  return [...missingTamil];
}

/** Replaces {name} placeholders; a placeholder without a parameter is left as written. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match);
}

export interface Translation { text: string; origin: MessageOrigin }

/** Resolve a message. Tamil falls back to English explicitly (never silently to an empty string). */
export function resolveMessage(locale: Locale, key: MessageKey, params?: MessageParams): Translation {
  if (locale === 'ta') {
    const source = taSource[key];
    if (source !== undefined) return { text: interpolate(source, params), origin: 'source' };
    const proposed = taProposed[key];
    if (proposed !== undefined) return { text: interpolate(proposed, params), origin: 'proposed' };
    missingTamil.add(key);
    return { text: interpolate(enFlat[key], params), origin: 'fallback-en' };
  }
  return { text: interpolate(enFlat[key], params), origin: 'english' };
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  return resolveMessage(locale, key, params).text;
}

/** Language that the text of a translated message is actually written in. */
export function messageLanguage(locale: Locale, key: MessageKey): Locale {
  return resolveMessage(locale, key).origin === 'fallback-en' ? 'en' : locale;
}
