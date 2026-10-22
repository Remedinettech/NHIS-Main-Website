import { useLocation } from 'react-router-dom';
import { isPreviewMode } from '../services/siteContent.api';

/**
 * True while the Client shows unpublished administration changes: the URL had `?preview=1` (remembered for this browser
 * tab, so it survives in-app navigation) and `?preview=0` has not been used since. Needs the router.
 * Outside React components use `isPreviewMode()` from services/siteContent.api.ts.
 */
export function usePreviewMode(): boolean {
  const { search } = useLocation();
  return isPreviewMode(search);
}
