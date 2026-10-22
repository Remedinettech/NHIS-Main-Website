/** Languages supported by the public site. */
export type Locale = 'en' | 'ta';
export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** A value that exists in both languages. `ta` may be an empty string when the source has no Tamil text. */
export interface Bilingual<T = string> { en: T; ta: T }

export type DataMode = 'snapshot';

export interface DirectoryStats {
  hospitals: number;
  contacts: number;
  documents: number;
  /** Date of the source capture (YYYY-MM-DD). The counts describe that snapshot, not live data. */
  capturedAt: string;
  mode: DataMode;
  /** Optional breakdowns (additive; older consumers may ignore them). */
  contactDirectories?: Array<{ id: ContactDirectoryId; rows: number }>;
  documentsByCategory?: Array<{ category: DocumentCategory; total: number; unavailable: number }>;
  announcements?: number;
  galleryItems?: number;
}

/* ---------------------------------------------------------------------------
 * Rich page content. Rendered by React as elements, never as raw HTML.
 * ------------------------------------------------------------------------- */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  /** A source-document link. `documentId` resolves against the document registry. */
  | { type: 'document'; documentId: string; text: string }
  /** `address` is displayed exactly as in the source; the UI builds the mailto: link. */
  | { type: 'mail'; address: string }
  | { type: 'phone'; number: string; text: string }
  | { type: 'link'; href: string; text: string };

export interface ListItem { content: InlineNode[]; children?: ListBlock }
export interface ListBlock { type: 'list'; ordered: boolean; items: ListItem[] }
export interface ParagraphBlock { type: 'paragraph'; content: InlineNode[] }
export interface DocumentLinkBlock { type: 'documentLink'; documentId: string; text: string }
/** Editable page table; cells use the same safe inline content as paragraphs. */
export interface TableBlock { type: 'table'; headers: string[]; rows: InlineNode[][][] }
/** A picture inside a page. `assetId` is an uploaded image; `alt` is required text for assistive technology. */
export interface ImageBlock {
  type: 'image';
  assetId: string;
  alt: string;
  caption?: string;
  /** Filled in by the API from the stored file when the page is saved. */
  width?: number | null;
  height?: number | null;
}
export type ContentBlock = ParagraphBlock | ListBlock | DocumentLinkBlock | ImageBlock | TableBlock;

export interface PageSection {
  /** Anchor id, unique within the localized page. */
  id: string;
  /** Stable cross-language key. Present only when both languages have a corresponding section. */
  key?: string;
  heading?: string;
  blocks: ContentBlock[];
}

export interface LocalizedPageContent { title: string; sections: PageSection[] }

export type PageSlug =
  | 'employee-policy' | 'pensioner-policy' | 'coverage' | 'eligibility'
  | 'how-to-enroll' | 'forms' | 'grievances' | 'gallery';

export interface ReviewNote {
  id: string;
  severity: 'info' | 'warning';
  /** Short, factual description for reviewers. */
  text: string;
}

export interface PageContent {
  slug: PageSlug;
  /** Legacy paths of the same page on tn-nhis.com. */
  legacyPaths: string[];
  sourceUrl: string;
  capturedAt: string;
  /** `null` when the source page has no text in that language. */
  en: LocalizedPageContent | null;
  ta: LocalizedPageContent | null;
  /** Documents referenced by the page, in source order. */
  documentIds: string[];
  reviewNotes: ReviewNote[];
}

export interface PageResponse { data: PageContent; source: DataMode; capturedAt: string }

/* ---------------------------------------------------------------------------
 * Documents
 * ------------------------------------------------------------------------- */

export type DocumentCategory =
  | 'govt-order-employee' | 'govt-order-pensioner'
  | 'policy-non-payable' | 'enrolment-guide' | 'enrolment-form' | 'hospital-suspension';

export type DocumentAudience = 'employee' | 'pensioner' | 'all';
export type DocumentAvailability = 'available' | 'unavailable';

export interface DocumentRecord {
  id: string;
  category: DocumentCategory;
  audience: DocumentAudience;
  /** Order in which the source menu / page lists the entry within its category. */
  order: number;
  /** Source label, exactly as published (includes the date where the source does). `ta` is '' if absent. */
  label: Bilingual;
  /** Title part of the label (e.g. "G.O.Ms.No.71") when the label can be split without rewriting. */
  title: Bilingual;
  /** Date part of the source label (e.g. "21 March 2022"), or null when the source label has no date. */
  dateLabel: Bilingual<string | null>;
  /** Original source URL (as linked by the source page; absolute). */
  sourceUrl: string;
  /** Public path of the unchanged local copy, or null when no file could be retrieved. */
  localPath: string | null;
  availability: DocumentAvailability;
  /** Why the file is unavailable (e.g. the failure recorded at capture). */
  availabilityNote?: string;
  pages?: number;
  bytes?: number;
  sha256?: string;
  /** False for scanned PDFs without a text layer. */
  hasTextIndex?: boolean;
  /** Date token found in the file name, shown only for comparison with the label. */
  fileNameDate?: string;
  /** Source observations worth showing to reviewers (e.g. label/file-name date mismatch). */
  notes: string[];
  /** Language of the source page link, for entries that exist as separate per-language versions. */
  language?: Locale;
  /** Entries sharing a group are distinct versions of the same notice. */
  versionGroup?: string;
}

export interface DocumentListResponse {
  data: DocumentRecord[];
  total: number;
  source: DataMode;
  capturedAt: string;
}

/* ---------------------------------------------------------------------------
 * Contact directories
 * ------------------------------------------------------------------------- */

export type ContactDirectoryId =
  | 'coordinators' | 'uiic-nodal-officers' | 'hospital-nodal-officers' | 'treasury-offices' | 'project-office-officials';

export interface ContactColumn {
  /** Excel column letter in the source workbook; also the key in `ContactRow.cells`. */
  key: string;
  /** Header exactly as written in the workbook. */
  header: string;
  kind: 'text' | 'phone' | 'email';
}

export interface ContactRow {
  id: string;
  /** Row number in the workbook. */
  sourceRow: number;
  cells: Record<string, string>;
}

export interface DirectoryFlag { id: string; severity: 'info' | 'warning'; text: string }

export interface ContactDirectory {
  id: ContactDirectoryId;
  label: Bilingual;
  sourceFile: string;
  columns: ContactColumn[];
  rows: ContactRow[];
  total: number;
  flags: DirectoryFlag[];
}

export interface ContactDirectorySummary {
  id: ContactDirectoryId;
  label: Bilingual;
  total: number;
  flags: DirectoryFlag[];
}

export interface ContactDirectoryIndexResponse {
  data: ContactDirectorySummary[];
  source: DataMode;
  capturedAt: string;
}

export interface ContactDirectoryResponse {
  data: ContactDirectory;
  source: DataMode;
  capturedAt: string;
}

/* ---------------------------------------------------------------------------
 * Site settings, announcements, gallery
 * ------------------------------------------------------------------------- */

export interface Helpline { id: string; label: Bilingual; number: string; telHref: string }

export interface Announcement {
  id: string;
  kind: 'suspension' | 'login-support';
  severity: 'notice' | 'warning';
  /** Per-language message; `document` nodes reference separate per-language PDFs when the source does. */
  message: Bilingual<InlineNode[]>;
}

/** Portal destination editable in the admin (login roles, claim tracking). */
export interface PortalLink { id: string; label: Bilingual; href: string }

export interface SiteSettings {
  schemeName: Bilingual;
  coverageStatement: Bilingual;
  helplines: Helpline[];
  /** Source-published availability, e.g. "24/7". Not independently verified. */
  availability: string;
  announcements: Announcement[];
  /** Present when portal links are managed in the database; clients fall back to built-in defaults if empty. */
  portals?: PortalLink[];
  capturedAt: string;
  mode: DataMode;
}

export interface SiteSettingsResponse { data: SiteSettings }

export interface GalleryItem { id: string; title: Bilingual; imageUrl: string; sourceUrl: string }

export interface GalleryResponse {
  data: GalleryItem[];
  total: number;
  source: DataMode;
  capturedAt: string;
  /** Explains why the list is empty (source page had a heading only). */
  note?: string;
}
