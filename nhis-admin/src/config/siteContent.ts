import { SITE_CONTENT_INFO, type SiteContentKey } from '@nhis/shared-types';
import { buildPreviewUrl, resolveClientBase } from '../utils/siteContentLinks';

/** Audit entity type of the site-content documents (used by the History link of the editors). */
export const SITE_CONTENT_ENTITY_TYPE = 'site-content';

/**
 * Address of the public site. VITE_CLIENT_URL overrides it; by default the dev server (http://127.0.0.1:5173) while
 * developing and the IIS application sub-path (/TNNHIS/) in a production build.
 */
// `import.meta.env` does not exist when the node tests import this module; the defaults then apply.
const env = import.meta.env as Record<string, unknown> | undefined;
export const CLIENT_BASE_URL = resolveClientBase({
  configured: typeof env?.VITE_CLIENT_URL === 'string' ? env.VITE_CLIENT_URL : undefined,
  production: env?.PROD === true,
});

/** Admin route of the editor of each document. */
export const SITE_EDIT_PATHS: Record<SiteContentKey, string> = {
  manual: '/site/manual',
  header: '/site/header',
  navigation: '/site/navigation',
  home: '/site/home',
  partners: '/site/partners',
  footer: '/site/footer',
  text: '/site/text',
};

/** Address that shows a document's public page in preview mode (saved drafts included, for signed-in staff). */
export const previewUrlFor = (key: SiteContentKey): string => buildPreviewUrl(CLIENT_BASE_URL, SITE_CONTENT_INFO[key].previewPath);

/* ------------------------------------------------------------------ "Where each public page is edited" */

export interface EditLocation {
  label: string;
  /** Admin route. */
  to: string;
}

export function editLocationLabel(place: EditLocation): string {
  const key = (Object.keys(SITE_EDIT_PATHS) as SiteContentKey[]).find((candidate) => SITE_EDIT_PATHS[candidate] === place.to);
  return key ? SITE_CONTENT_INFO[key].label : place.label;
}

export interface PublicPageEntry {
  /** Name of the public page or area. */
  page: string;
  /** Route of the public site, or null for areas that appear on every page. */
  route: string | null;
  /** What an administrator can change. */
  edits: string;
  where: readonly EditLocation[];
}

const PAGES = (slug: string, label = 'Website pages'): EditLocation => ({ label: `${label}: page content`, to: `/pages/${slug}` });
const TEXT: EditLocation = { label: 'Page headings & labels', to: '/site/text' };

/**
 * Every public route of the Client (SITE_ROUTES) and the areas shared by all pages, with the place in the Admin that
 * edits them. The test next to utils/siteContentLinks checks that no route of SITE_ROUTES is missing.
 */
export const PUBLIC_PAGE_MAP: readonly PublicPageEntry[] = [
  { page: 'User Manual', route: '/user-manual', edits: 'Manual PDF and video titles, descriptions, order, visibility and file sources.', where: [{ label: 'Site content: User Manual', to: '/site/manual' }] },
  {
    page: 'Home', route: '/',
    edits: 'Hero text and buttons, hospital search wording, quick access tiles, pathways, documents list, coverage panel, helpline panel, scheme highlights, partner logos and the order of the sections.',
    where: [
      { label: 'Site content: Homepage', to: '/site/home' },
      { label: 'Site content: Partners', to: '/site/partners' },
      { label: 'Documents', to: '/documents' },
      { label: 'Announcements', to: '/announcements' },
    ],
  },
  {
    page: 'Network hospitals', route: '/hospitals',
    edits: 'Page title, introduction and search labels (Page text). The hospital list itself is edited under Hospitals.',
    where: [TEXT, { label: 'Hospitals', to: '/hospitals' }],
  },
  {
    page: 'Employee policy', route: '/employee-policy',
    edits: 'Headings, text, images and document links of the page.',
    where: [PAGES('employee-policy')],
  },
  {
    page: 'Pensioner policy', route: '/pensioner-policy',
    edits: 'Headings, text, images and document links of the page.',
    where: [PAGES('pensioner-policy')],
  },
  {
    page: 'Government orders', route: '/government-orders',
    edits: 'Page title, introduction and group headings (Page text). The order files are edited under Documents.',
    where: [TEXT, { label: 'Documents', to: '/documents' }],
  },
  {
    page: 'Coverage', route: '/coverage',
    edits: 'Headings, text, images and document links of the page. The heading of the coverage panel on the homepage is edited in Homepage.',
    where: [PAGES('coverage'), { label: 'Site content: Homepage', to: '/site/home' }],
  },
  {
    page: 'Eligibility', route: '/eligibility',
    edits: 'Headings, text, images and document links of the page.',
    where: [PAGES('eligibility')],
  },
  {
    page: 'How to enroll', route: '/enrollment',
    edits: 'Headings, text, images and document links of the page.',
    where: [PAGES('how-to-enroll')],
  },
  {
    page: 'Forms and downloads', route: '/forms',
    edits: 'Page content (Pages), group headings (Page text) and the form files (Documents).',
    where: [PAGES('forms'), TEXT, { label: 'Documents', to: '/documents' }],
  },
  {
    page: 'Contact', route: '/contacts',
    edits: 'Page title, introduction and labels (Page text). The directories and helpline rows are edited under Contacts and Header.',
    where: [TEXT, { label: 'Contacts', to: '/contacts' }, { label: 'Site content: Header', to: '/site/header' }],
  },
  {
    page: 'Grievances', route: '/grievances',
    edits: 'Bilingual page text, nodal-officer and escalation tables (Website pages), and the guidance note (Page headings & labels).',
    where: [PAGES('grievances'), TEXT],
  },
  {
    page: 'Gallery', route: '/gallery',
    edits: 'Page text (Pages and Page text) and the pictures (Gallery). The menu link stays hidden while the Gallery has no published picture.',
    where: [PAGES('gallery'), TEXT, { label: 'Gallery', to: '/gallery' }],
  },
  {
    page: 'Header', route: null,
    edits: 'Government logo, portrait, website title and subtitle, helpline strip and the Login menu. Shown on every page.',
    where: [{ label: 'Site content: Header', to: '/site/header' }],
  },
  {
    page: 'Navigation', route: null,
    edits: 'Main menu entries, dropdowns, links, order and visibility. Shown on every page.',
    where: [{ label: 'Site content: Navigation', to: '/site/navigation' }],
  },
  {
    page: 'Footer', route: null,
    edits: 'Footer logos, description, link groups, helplines, contact details and copyright text. Shown on every page.',
    where: [{ label: 'Site content: Footer', to: '/site/footer' }],
  },
];
