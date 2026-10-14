/** Lower-cased, NFC-normalised text with whitespace runs collapsed; used for matching only, never for display. */
export function normalizeForSearch(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** True when every whitespace-separated word of `query` appears in `haystack` (literal match, no regular expressions). */
export function matchesAllWords(haystack: string, query: string): boolean {
  const needle = normalizeForSearch(query);
  if (!needle) return true;
  const text = normalizeForSearch(haystack);
  return needle.split(' ').every((word) => text.includes(word));
}

/** Display-only tidy-up for source strings that contain stray line breaks and double spaces. */
export function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Splits a multi-line source value into its non-empty lines, keeping the line structure. */
export function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
