import { createContext, useContext } from 'react';
import type { FieldErrors } from './siteForm';

/**
 * What the form components of a site-content editor share: the field errors (client validation and server, keyed by
 * path such as `helplines.2.label.en`) and whether the editor is read-only. SiteContentEditor provides it; the components
 * read it so that no editor has to pass `errors` and `disabled` to every control. Props of a component override it.
 */
export interface SiteFormState {
  errors: FieldErrors;
  readOnly: boolean;
}

const EMPTY: SiteFormState = { errors: {}, readOnly: false };

export const SiteFormContext = createContext<SiteFormState>(EMPTY);

export function useSiteForm(): SiteFormState {
  return useContext(SiteFormContext);
}
