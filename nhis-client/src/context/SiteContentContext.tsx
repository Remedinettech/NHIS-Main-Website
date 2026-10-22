import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SiteContentMap } from '@nhis/shared-types';
import { usePreviewMode } from '../hooks/usePreviewMode';
import { contentOf, loadSiteContent, type SiteContentLoad } from '../services/siteContent.api';
import { onRefocus } from '../utils/refocus';

export type SiteContentStatus = 'loading' | 'ready' | 'fallback';

export interface SiteContentValue {
  /** Always complete: per document the loaded value, or the built-in value (before the first answer, or when it failed). */
  content: SiteContentMap;
  /** loading: first request running (built-in content shown); ready: answered; fallback: the request failed, built-in content shown. */
  status: SiteContentStatus;
  /**
   * The content on screen is the administration's preview (unpublished changes included). Only true once the preview
   * endpoint has answered, so uploaded images come from /admin/files (see utils/siteImages.ts) only when that session
   * works, and the preview banner never claims more than what is shown.
   */
  preview: boolean;
  /** Preview was requested, but the published site is shown instead (no valid administration session, or the preview could not be read). */
  previewDenied: boolean;
}

export const SiteContentContext = createContext<SiteContentValue | undefined>(undefined);

/** Result of the latest request for one mode; `load` is missing when the request failed. */
export interface Outcome { requested: boolean; load?: SiteContentLoad }

/**
 * Preview flags for what is on screen: while the first answer is pending, or when nothing could be loaded at all (built-in
 * content), neither is set; once an answer is there, exactly one of them is set when preview was requested.
 */
export function previewState(requested: boolean, outcome: Pick<Outcome, 'load'> | undefined): Pick<SiteContentValue, 'preview' | 'previewDenied'> {
  const source = requested ? outcome?.load?.source : undefined;
  return { preview: source === 'preview', previewDenied: source === 'published' };
}

/**
 * Loads the managed site content (GET /site-content, or the administration's preview) and offers it through
 * `useSiteContent()`. It renders the built-in content until the answer arrives and keeps it when the request fails, so
 * the header, menu and footer never disappear. It refetches when the visitor returns to the tab (window focus or tab
 * visible; the service reuses an answer for 15 seconds), so a publish shows up without a reload. Place it inside the
 * router and outside LanguageProvider (text overrides are read by `t()`).
 */
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const requested = usePreviewMode();
  const [outcome, setOutcome] = useState<Outcome>();

  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      loadSiteContent({ preview: requested, signal: current.signal }).then(
        (load) => {
          if (current.signal.aborted) return;
          // An answer equal to the one on screen keeps its identity, so a refresh does not render the site again.
          setOutcome((previous) => (previous && previous.requested === requested
            && previous.load?.signature === load.signature && previous.load.source === load.source && previous.load.previewDenied === load.previewDenied
            ? previous
            : { requested, load }));
        },
        () => {
          if (current.signal.aborted) return;
          // A failed refresh keeps what is shown; a failed first request settles on the built-in content.
          setOutcome((previous) => (previous && previous.requested === requested ? previous : { requested }));
        },
      );
    };
    refresh();
    const stop = onRefocus(refresh);
    return () => {
      controller?.abort();
      stop();
    };
  }, [requested]);

  // An answer for the other mode is never shown (unpublished content must not linger after ?preview=0).
  const current = outcome && outcome.requested === requested ? outcome : undefined;
  const value = useMemo<SiteContentValue>(() => ({
    content: contentOf(current?.load),
    status: !current ? 'loading' : current.load ? 'ready' : 'fallback',
    ...previewState(requested, current),
  }), [current, requested]);

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}
