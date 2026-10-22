import { useAsyncData } from '../../hooks/useAsyncData';
import { loadSiteDocumentOptions, type SiteDocumentOption } from '../../services/siteContent.api';
import type { AsyncState } from '../../types/async';

/**
 * Documents a link may point to (all except archived), for the document picker of the link editor. Loaded when the
 * component that calls it mounts, so only editors that show a document picker ask for them; the request is shared and
 * cached briefly (see loadSiteDocumentOptions).
 */
export function useSiteDocuments(): AsyncState<SiteDocumentOption[]> {
  return useAsyncData(() => loadSiteDocumentOptions(), []);
}
