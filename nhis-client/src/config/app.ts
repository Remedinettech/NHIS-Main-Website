/** Application-level configuration. Nothing secret belongs here (VITE_* values are public). */

export const APP_CONFIG = {
  /** Existing operational NHIS portal; all login and claim destinations live there. */
  legacyPortalBaseUrl: (import.meta.env.VITE_LEGACY_PORTAL_BASE_URL || 'https://tn-nhis.com').replace(/\/$/, ''),
  /** Public NHIS portal site. */
  sourceSiteUrl: 'https://tn-nhis.com/',
  hospitalPageSize: 12,
  searchDebounceMs: 300,
} as const;
