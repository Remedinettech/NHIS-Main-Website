import type { HomeSectionId, SiteContentKey, SiteIconName } from './site-content.types';

/** Browser-safe runtime constants shared by the API, the Admin and the Client. No secrets, no environment access. */

export const SITE_CONTENT_KEYS = ['header', 'navigation', 'home', 'partners', 'footer', 'text', 'manual'] as const satisfies readonly SiteContentKey[];

export const SITE_CONTENT_INFO: Record<SiteContentKey, { label: string; description: string; /** Public route that shows the content (used by "Preview"). */ previewPath: string }> = {
  manual: { label: 'User manual & videos', description: 'Manual PDF and ordered videos: uploads, YouTube, Google Drive or web links.', previewPath: '/user-manual' },
  header: { label: 'Header & helplines', description: 'Government logo, portrait, website title, subtitle, helplines and the Login menu.', previewPath: '/' },
  navigation: { label: 'Main website menu', description: 'Menu labels, links, dropdown groups, order and visibility.', previewPath: '/' },
  home: { label: 'Homepage sections', description: 'Main banner, quick links, employee and pensioner links, documents, scheme highlights and section order.', previewPath: '/' },
  partners: { label: 'Insurance & TPA partners', description: 'Partner logos, names, groups, links, order and visibility.', previewPath: '/' },
  footer: { label: 'Footer & office address', description: 'Footer logos, description, link groups, project-office address, contacts and copyright text.', previewPath: '/' },
  text: { label: 'Page headings & labels', description: 'Headings and introductions of the Hospitals, Contacts, Government orders and other pages.', previewPath: '/' },
};

export function isSiteContentKey(value: unknown): value is SiteContentKey {
  return typeof value === 'string' && (SITE_CONTENT_KEYS as readonly string[]).includes(value);
}

/** Routes of the public site that a link may lead to (the Client's router; see nhis-client/src/config/routes.ts). */
export const SITE_ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: '/', label: 'Home' },
  { path: '/user-manual', label: 'User Manual' },
  { path: '/hospitals', label: 'Network hospitals' },
  { path: '/employee-policy', label: 'Employee policy' },
  { path: '/pensioner-policy', label: 'Pensioner policy' },
  { path: '/government-orders', label: 'Government orders' },
  { path: '/coverage', label: 'Coverage' },
  { path: '/eligibility', label: 'Eligibility' },
  { path: '/enrollment', label: 'How to enroll' },
  { path: '/forms', label: 'Forms and downloads' },
  { path: '/contacts', label: 'Contact' },
  { path: '/grievances', label: 'Grievances' },
  { path: '/gallery', label: 'Gallery' },
];

/** Anchors that exist on public pages, offered by the Admin link picker (any `#anchor` of 1-64 safe characters is accepted). */
export const SITE_ROUTE_ANCHORS: ReadonlyArray<{ path: string; label: string }> = [
  { path: '/government-orders#employee-orders', label: 'Government orders: employee orders' },
  { path: '/government-orders#pensioner-orders', label: 'Government orders: pensioner orders' },
  { path: '/forms#enrolment-forms', label: 'Forms: enrolment forms' },
  { path: '/forms#enrolment-guides', label: 'Forms: enrolment guides' },
  { path: '/forms#policy-lists', label: 'Forms: policy lists' },
];

export const SITE_ICON_NAMES: readonly SiteIconName[] = [
  'hospital', 'shield', 'users', 'clipboard', 'file', 'search', 'scale', 'login', 'phone',
  'mail', 'image', 'home', 'list', 'user', 'info', 'download', 'pin',
];

/** Default order of the homepage sections. */
export const HOME_SECTION_IDS: readonly HomeSectionId[] = [
  'hero', 'quickAccess', 'pathways', 'documents', 'coverage', 'helplines', 'highlights', 'partners',
];

export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  hero: 'Main banner and hospital search',
  quickAccess: 'Quick access tiles',
  pathways: 'Employee and pensioner pathways',
  documents: 'Documents and forms',
  coverage: 'Coverage panel',
  helplines: 'Help and support panel',
  highlights: 'Scheme highlights',
  partners: 'Partners',
};

/** Field limits shared by the validator (server and Admin) and by the Admin form inputs. */
export const SITE_CONTENT_LIMITS = {
  /** Short labels: menu entries, buttons, captions. */
  label: 120,
  /** Headings and titles. */
  heading: 200,
  /** One sentence or a short paragraph. */
  text: 600,
  /** Long text: about text, coverage statement. */
  longText: 2000,
  alt: 250,
  url: 500,
  email: 254,
  number: 30,
  id: 40,
  helplines: 12,
  navItems: 12,
  navChildren: 24,
  quickTiles: 12,
  pathwayGroups: 4,
  pathwayLinks: 8,
  homeActions: 3,
  highlights: 12,
  documentIds: 24,
  loginItems: 10,
  partnerCategories: 8,
  partners: 40,
  footerLogos: 6,
  footerGroups: 4,
  footerLinks: 16,
} as const;

/** Maximum size of the JSON of one document (bytes), checked by the API before validation. */
export const SITE_CONTENT_MAX_BYTES = 200_000;

/** Pattern for ids of list items (stable keys). */
export const SITE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;

/** Built-in assets shipped with the Client build that the shipped defaults refer to. */
export const BUILT_IN_ASSET_PATTERN = /^assets\/[A-Za-z0-9._-]{1,100}\.(png|jpe?g|webp)$/;
