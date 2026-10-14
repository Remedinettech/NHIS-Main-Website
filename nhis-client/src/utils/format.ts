import type { Locale } from '@nhis/shared-types';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const localeTag: Record<Locale, string> = { en: 'en-IN', ta: 'ta-IN' };

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTag[locale]).format(value);
}

/** Formats an ISO date (YYYY-MM-DD). Falls back to the raw value when it cannot be parsed. */
export function formatIsoDate(iso: string, locale: Locale): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return iso;
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  return new Intl.DateTimeFormat(localeTag[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
