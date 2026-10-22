import { useContext } from 'react';
import type { SiteContentKey, SiteContentMap } from '@nhis/shared-types';
import { SiteContentContext, type SiteContentValue } from '../context/SiteContentContext';

/**
 * The managed site content: `content` is always complete (built-in values stand in until the API answers or when it
 * fails), `status` is "loading" | "ready" | "fallback" and `preview` tells whether unpublished changes are shown.
 */
export function useSiteContent(): SiteContentValue {
  const value = useContext(SiteContentContext);
  if (!value) throw new Error('useSiteContent must be used inside <SiteContentProvider>');
  return value;
}

/** One document of the content, e.g. `useSiteDocument('header')`. */
export function useSiteDocument<K extends SiteContentKey>(key: K): SiteContentMap[K] {
  return useSiteContent().content[key];
}
