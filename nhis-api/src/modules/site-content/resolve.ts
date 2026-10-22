import { SITE_CONTENT_KEYS, validateSiteContent, type SiteContentKey, type SiteContentMap } from '@nhis/shared-types';

/**
 * Assembles the six documents from stored candidates: a candidate that passes the shared validator is used (as the
 * validator's normalised copy), every other document (no candidate, or an invalid one) comes from `loadDefaults`, which
 * is only called when needed. Shared by the public endpoint (candidates = published values) and the admin preview
 * (candidates = pending draft, else stored value), so both are validated identically.
 */
export async function resolveSiteContent(
  candidates: ReadonlyMap<string, unknown>,
  loadDefaults: () => Promise<SiteContentMap>,
  onInvalid: (key: SiteContentKey) => void = () => undefined,
): Promise<SiteContentMap> {
  const result: Partial<SiteContentMap> = {};
  const use = <K extends SiteContentKey>(key: K, value: SiteContentMap[K]): void => { result[key] = value; };
  const fallback: SiteContentKey[] = [];
  for (const key of SITE_CONTENT_KEYS) {
    if (!candidates.has(key)) {
      fallback.push(key);
      continue;
    }
    const checked = validateSiteContent(key, candidates.get(key));
    if (checked.ok) {
      use(key, checked.value);
    } else {
      onInvalid(key);
      fallback.push(key);
    }
  }
  if (fallback.length > 0) {
    const defaults = await loadDefaults();
    for (const key of fallback) use(key, defaults[key]);
  }
  return result as SiteContentMap;
}
