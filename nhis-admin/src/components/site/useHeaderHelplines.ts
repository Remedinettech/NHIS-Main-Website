import type { HelplineEntry } from '@nhis/shared-types';
import { useAsyncData } from '../../hooks/useAsyncData';
import { loadHeaderHelplines } from '../../services/siteContent.api';
import type { AsyncState } from '../../types/async';

/** The helplines of the header (for the helpline each homepage pathway shows). Loaded when the component that calls it mounts. */
export function useHeaderHelplines(): AsyncState<HelplineEntry[]> {
  return useAsyncData(() => loadHeaderHelplines(), []);
}
