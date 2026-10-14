/** Only https Google Maps links from the source data are rendered as links. */
export function safeMapUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && ['maps.google.com', 'www.google.com', 'google.com'].includes(url.hostname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Absolute http(s) URL, or undefined. Used for external destinations that come from data. */
export function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const EMAIL = /^[^\s@<>()[\]\,;:"]+@[^\s@<>()[\]\,;:"]+\.[^\s@<>()[\]\,;:"]+$/;

export function isEmailAddress(value: string): boolean {
  return EMAIL.test(value.trim());
}

/** Builds a mailto: link for an address shown exactly as in the source. */
export function mailtoHref(address: string): string | undefined {
  const trimmed = address.trim();
  return EMAIL.test(trimmed) ? `mailto:${trimmed}` : undefined;
}

/**
 * Builds a tel: link only for a single, plain phone number (digits with optional +, spaces, hyphens).
 * Anything else (several numbers, extensions, stray text) is left as text rather than guessing.
 */
export function telHref(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^\+?[\d][\d\s-]{5,}$/.test(trimmed)) return undefined;
  const digits = trimmed.replace(/[^\d+]/g, '');
  return digits.length >= 6 && digits.length <= 15 ? `tel:${digits}` : undefined;
}
