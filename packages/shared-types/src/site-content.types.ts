import type { AdminRecord } from './admin.types';
import type { Bilingual, DocumentCategory } from './content.types';

/* ---------------------------------------------------------------------------
 * Admin-managed site content ("CMS documents").
 *
 * Six documents describe everything around the editorial pages: header, navigation, homepage, partners, footer
 * and interface text. Each document is stored as one JSON value in the `SiteContent` table with the same
 * draft / preview / publish lifecycle as the other content modules. Nothing in these documents is HTML: every
 * string is plain text that React renders as text, and every link is a structured target that is validated on
 * the server (see site-content.validate.ts).
 *
 * `Bilingual.ta` may be '' (the public site then shows the English text, marked lang="en").
 * ------------------------------------------------------------------------- */

/** An image. Either an upload (`assetId`) or a file shipped with the Client build (`builtIn`). */
export interface SiteImage {
  /** Uploaded image (MediaAsset id). Wins over `builtIn`. Public only once a published document uses it. */
  assetId: string | null;
  /** Path of a file in the Client's public folder, e.g. "assets/tn-government-emblem.png". Used for the shipped defaults. */
  builtIn: string | null;
  alt: Bilingual;
  /** Intrinsic pixel size. The API fills these from the stored file when the document is saved; the browser value is ignored. */
  width: number | null;
  height: number | null;
}

/** Where a link leads. Only these five kinds exist; there is no free-form `href` and no `javascript:`. */
export type LinkTarget =
  /** A route of the public site: one of SITE_ROUTES, optionally followed by `#anchor`. */
  | { type: 'route'; path: string }
  /** An https:// address on another site (opens in a new tab). */
  | { type: 'external'; url: string }
  /** A file from the Documents module (resolved to its public file URL; hidden when the document is not published). */
  | { type: 'document'; documentId: string }
  | { type: 'email'; address: string }
  | { type: 'phone'; number: string };

/** A link with a bilingual label. For `document` targets the label may contain `{title}` (the document's own title). */
export interface LinkItem {
  id: string;
  label: Bilingual;
  target: LinkTarget;
  visible: boolean;
}

/** Icon names the Client can draw (subset of its Icon set). */
export type SiteIconName =
  | 'hospital' | 'shield' | 'users' | 'clipboard' | 'file' | 'search' | 'scale' | 'login' | 'phone'
  | 'mail' | 'image' | 'home' | 'list' | 'user' | 'info' | 'download' | 'pin';

/* ------------------------------------------------------------------ header */

export interface HelplineEntry {
  id: string;
  label: Bilingual;
  /** As displayed, e.g. "1800-233-5666". The tel: link is derived from it. */
  number: string;
  visible: boolean;
}

export interface HeaderContent {
  /** Government emblem shown at the left of the header. */
  emblem: SiteImage;
  portrait: SiteImage;
  showPortrait: boolean;
  /** Website title (the wordmark), e.g. "TN-NHIS". A hyphen splits it into a dark and a blue part. Also the browser-title suffix. */
  title: Bilingual;
  /** Line under the title, normally the scheme name. */
  subtitle: Bilingual;
  /** Heading of the scrolling helpline strip above the header. */
  helplineHeading: Bilingual;
  helplines: HelplineEntry[];
  /** Language-neutral availability, e.g. "24/7". Empty hides it. */
  availability: string;
  loginMenu: {
    /** Label of the Login button. */
    label: Bilingual;
    /** Heading inside the opened menu. */
    heading: Bilingual;
    items: LinkItem[];
    forgotPassword: LinkItem;
  };
}

/* ------------------------------------------------------------------ navigation */

export interface NavLink extends LinkItem { type: 'link' }
/** A non-clickable group heading inside a dropdown. */
export interface NavHeading { type: 'heading'; id: string; label: Bilingual; visible: boolean }
export interface NavMenu {
  type: 'menu';
  id: string;
  label: Bilingual;
  visible: boolean;
  children: Array<NavLink | NavHeading>;
}
export interface NavigationContent {
  /** Top-level entries in display order. The Gallery route is always hidden while the Gallery has no published item. */
  items: Array<NavLink | NavMenu>;
}

/* ------------------------------------------------------------------ home */

export type HomeSectionId =
  | 'hero' | 'quickAccess' | 'pathways' | 'documents' | 'coverage' | 'helplines' | 'highlights' | 'partners';

export interface HomeSectionSetting { id: HomeSectionId; visible: boolean }

export interface HomeActionLink extends LinkItem { variant: 'primary' | 'secondary' | 'ghost' }

export interface QuickTile {
  id: string;
  icon: SiteIconName;
  label: Bilingual;
  /** Small second line, e.g. "NHIS portal" for tiles that leave the site. */
  hint: Bilingual;
  target: LinkTarget;
  visible: boolean;
}

export interface PathwayLink extends LinkItem { icon: SiteIconName }

export interface PathwayGroup {
  id: string;
  heading: Bilingual;
  links: PathwayLink[];
  /** Id of a helpline (HeaderContent.helplines) shown under the links, or null. */
  helplineId: string | null;
  visible: boolean;
}

export interface HighlightItem {
  id: string;
  /** The figure or period, e.g. "₹5,00,000" or "1 year". */
  value: Bilingual;
  label: Bilingual;
  note: Bilingual;
  visible: boolean;
}

export interface HomeContent {
  /** Order and visibility of the homepage sections. Every section id appears exactly once. */
  sections: HomeSectionSetting[];
  hero: {
    eyebrow: Bilingual;
    title: Bilingual;
    /** Optional short paragraph under the title. */
    description: Bilingual;
    coverageHeading: Bilingual;
    coverageStatement: Bilingual;
    actions: HomeActionLink[];
    /** Optional banner picture next to the hero text. */
    banner: SiteImage | null;
    search: {
      heading: Bilingual;
      hint: Bilingual;
      placeholder: Bilingual;
      button: Bilingual;
      browseAll: Bilingual;
      /** Shows "Search across N listed hospitals". */
      showCount: boolean;
    };
  };
  quickAccess: { heading: Bilingual; tiles: QuickTile[] };
  pathways: { heading: Bilingual; groups: PathwayGroup[] };
  documents: {
    heading: Bilingual;
    intro: Bilingual;
    /** Explicit documents (Documents module ids) in order. Empty = every published document of `categories`. */
    documentIds: string[];
    categories: DocumentCategory[];
    links: LinkItem[];
  };
  /** Heading and link of the coverage panel; its text is the "coverage" page of the Pages module. */
  coverage: { heading: Bilingual; linkLabel: Bilingual };
  helplines: { heading: Bilingual; intro: Bilingual };
  /** Coverage amounts, durations and other scheme details. Nothing is shown while the list is empty. */
  highlights: { heading: Bilingual; intro: Bilingual; items: HighlightItem[] };
}

/* ------------------------------------------------------------------ partners */

export interface PartnerCategory { id: string; caption: Bilingual; visible: boolean }

export interface PartnerEntry {
  id: string;
  categoryId: string;
  name: Bilingual;
  /** Logo with its alt text. Rendered at its natural proportions (never stretched or cropped). */
  logo: SiteImage;
  /** https:// address of the partner, or null for no link. */
  url: string | null;
  visible: boolean;
}

export interface PartnersContent {
  heading: Bilingual;
  /** Groups, in display order. */
  categories: PartnerCategory[];
  /** Partners in display order within their category. */
  partners: PartnerEntry[];
}

/* ------------------------------------------------------------------ footer */

export interface FooterLinkGroup { id: string; heading: Bilingual; links: LinkItem[]; visible: boolean }
export interface FooterLogo { id: string; image: SiteImage; url: string | null; visible: boolean }

export interface FooterContent {
  /** Shows the TN-NHIS wordmark (title and subtitle from the header). */
  showWordmark: boolean;
  logos: FooterLogo[];
  about: { heading: Bilingual; text: Bilingual };
  linkGroups: FooterLinkGroup[];
  /** Lists the header helplines. */
  helplines: { visible: boolean; heading: Bilingual };
  contact: { visible: boolean; heading: Bilingual; address: Bilingual; email: string; phone: string };
  /** May contain `{year}`, replaced by the current year. */
  copyright: Bilingual;
}

/* ------------------------------------------------------------------ interface text */

/**
 * Overrides for interface text that is not part of the documents above (page titles, introductions, buttons...).
 * Keys come from EDITABLE_TEXT_CATALOG; `''` for a language means "keep the built-in text".
 */
export interface TextContent { overrides: Record<string, Bilingual> }

export type ManualMediaSource = { type: 'builtIn'; path: string } | { type: 'upload'; assetId: string } | { type: 'external'; url: string };
export interface ManualVideo { id: string; title: Bilingual; description: Bilingual; visible: boolean; source: ManualMediaSource }
export interface UserManualContent {
  title: Bilingual;
  intro: Bilingual;
  manual: { title: Bilingual; buttonLabel: Bilingual; visible: boolean; source: ManualMediaSource };
  videos: ManualVideo[];
}

/* ------------------------------------------------------------------ aggregate */

export interface SiteContentMap {
  header: HeaderContent;
  navigation: NavigationContent;
  home: HomeContent;
  partners: PartnersContent;
  footer: FooterContent;
  text: TextContent;
  manual: UserManualContent;
}
export type SiteContentKey = keyof SiteContentMap;

/** GET /api/v1/site-content (published values; built-in content for a document that was never published). */
export interface SiteContentResponse { data: SiteContentMap }

/** One editable interface-text entry (see EDITABLE_TEXT_CATALOG). */
export interface EditableTextEntry {
  /** Dotted message key of the Client locale files, e.g. "hospitals.intro". */
  key: string;
  /** Page or area in the admin form. */
  group: string;
  label: string;
  multiline: boolean;
  maxLength: number;
  /** Built-in text, exactly as the Client shows it today (placeholders such as `{count}` included). */
  defaults: Bilingual;
}

/* ------------------------------------------------------------------ admin */

export type AdminSiteContent<K extends SiteContentKey = SiteContentKey> = AdminRecord<SiteContentMap[K]> & {
  key: K;
  /** False while no row exists in the database and the built-in content is shown. */
  customised: boolean;
};

export interface SiteContentIssue { field: string; message: string }
