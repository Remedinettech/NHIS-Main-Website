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
