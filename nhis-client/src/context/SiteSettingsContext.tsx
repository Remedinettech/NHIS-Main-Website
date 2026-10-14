import { createContext, useContext, type ReactNode } from 'react';
import type { SiteSettingsResponse } from '@nhis/shared-types';
import { useSiteSettingsData } from '../hooks/useContent';
import type { AsyncState } from '../types/async';

const SiteSettingsContext = createContext<AsyncState<SiteSettingsResponse> | undefined>(undefined);

/** Loads site-wide settings (helplines, notices) once for the shell and the home page. */
export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const state = useSiteSettingsData();
  return <SiteSettingsContext.Provider value={state}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): AsyncState<SiteSettingsResponse> {
  const value = useContext(SiteSettingsContext);
  if (!value) throw new Error('useSiteSettings must be used inside <SiteSettingsProvider>');
  return value;
}
