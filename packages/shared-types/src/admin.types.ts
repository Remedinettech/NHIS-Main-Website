import type {
  Announcement, ContactColumn, DocumentAudience, DocumentCategory, InlineNode, LocalizedPageContent, PublicationStatus,
} from './content.types';

/* Admin API contract (cookie-authenticated, /api/v1/admin/*). Browser-safe: types only. */

export type AdminRole = 'ADMIN' | 'EDITOR' | 'PUBLISHER';

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

/** Returned by login and GET /admin/auth/session. `csrfToken` must be sent as the X-CSRF-Token header on every POST/PUT/PATCH/DELETE. */
export interface AdminSessionInfo {
  authenticated: true;
  user: AdminUserSummary;
  csrfToken: string;
  /** ISO time when the session expires if not used again. */
  idleExpiresAt: string;
  /** ISO time of the absolute session limit. */
  expiresAt: string;
}
export interface AdminSessionAbsent { authenticated: false }

export interface AdminLoginRequest { email: string; password: string }
export interface AdminChangePasswordRequest { currentPassword: string; newPassword: string }

/* ------------------------------------------------------------------ generic record envelope */

export interface AdminRecordMeta {
  status: PublicationStatus;
  /** Optimistic-concurrency token: send it back as `expectedVersion` when saving or acting on the record. */
  version: number;
  /** True while a published record has unpublished edits. */
  hasDraft: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  updatedByEmail: string | null;
}

/** `values` are the effective values (pending draft over live); `published` are the live values (null if never published). */
export interface AdminRecord<F> {
  id: string;
  meta: AdminRecordMeta;
  values: F;
  published: F | null;
}

export interface AdminListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminItemResponse<T> { data: T }

/** Body for save: the full set of values plus the version the editor started from. */
export interface AdminSaveRequest<F> { values: F; expectedVersion: number }
export interface AdminCreateRequest<F> { values: F }
export interface AdminActionRequest { expectedVersion: number }

export interface AdminListQuery {
  q?: string;
  status?: PublicationStatus | 'ALL';
  page?: number;
  pageSize?: number;
}

/* ------------------------------------------------------------------ hospitals */

export interface AdminHospitalValues {
  nameEn: string; nameTa: string;
  addressEn: string; addressTa: string;
  districtEn: string; districtTa: string;
  stateEn: string; stateTa: string;
  postcode: string; category: string; type: string;
  specialty: string; contact: string; mapUrl: string;
}
export type AdminHospital = AdminRecord<AdminHospitalValues> & { sourceRow: number | null };
export interface AdminHospitalListQuery extends AdminListQuery { district?: string }

/* ------------------------------------------------------------------ pages */

export interface AdminPageValues {
  en: LocalizedPageContent | null;
  ta: LocalizedPageContent | null;
}
export interface AdminPage extends AdminRecord<AdminPageValues> {
  slug: string;
  legacyPaths: string[];
  documentIds: string[];
}

/* ------------------------------------------------------------------ documents and files */

export type AssetKindName = 'DOCUMENT' | 'IMAGE';

export interface AdminAsset {
  id: string;
  kind: AssetKindName;
  originalName: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  createdAt: string;
  /** Protected admin download URL (requires the admin session). */
  adminUrl: string;
}

export interface AdminDocumentValues {
  category: DocumentCategory;
  audience: DocumentAudience;
  sortOrder: number;
  labelEn: string; labelTa: string;
  titleEn: string; titleTa: string;
  dateLabelEn: string | null; dateLabelTa: string | null;
  assetId: string | null;
  language: 'en' | 'ta' | null;
  availabilityNote: string | null;
}
export type AdminDocument = AdminRecord<AdminDocumentValues> & {
  sourceUrl: string | null;
  asset: AdminAsset | null;
  /** Asset attached to the pending draft (a replacement file not yet published). */
  draftAsset: AdminAsset | null;
};
export interface AdminDocumentListQuery extends AdminListQuery { category?: DocumentCategory; audience?: DocumentAudience }

/* ------------------------------------------------------------------ contacts */

export interface AdminContactDirectory {
  id: string;
  labelEn: string;
  labelTa: string;
  columns: ContactColumn[];
  total: number;
}
export interface AdminContactValues { cells: Record<string, string>; sortOrder: number }
export type AdminContact = AdminRecord<AdminContactValues> & { directoryId: string; sourceRow: number | null };
export interface AdminContactListQuery extends AdminListQuery { directoryId: string }

/* ------------------------------------------------------------------ announcements */

export interface AdminAnnouncementValues {
  kind: Announcement['kind'] | 'general';
  severity: Announcement['severity'];
  messageEn: InlineNode[];
  messageTa: InlineNode[];
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
}
export type AdminAnnouncement = AdminRecord<AdminAnnouncementValues>;

/* ------------------------------------------------------------------ gallery */

export interface AdminGalleryValues {
  titleEn: string;
  titleTa: string;
  assetId: string;
  sortOrder: number;
}
export type AdminGalleryItem = AdminRecord<AdminGalleryValues> & { asset: AdminAsset };

/* ------------------------------------------------------------------ settings (explicit save, no draft) */

export interface PortalSetting { id: string; label: string; labelTa: string; href: string }
export interface HelplineSetting { id: string; labelEn: string; labelTa: string; number: string; telHref: string }

export interface AdminSettings {
  schemeNameEn: string;
  schemeNameTa: string;
  coverageStatementEn: string;
  coverageStatementTa: string;
  availability: string;
  helplines: HelplineSetting[];
  portals: PortalSetting[];
}
export interface AdminSettingsResponse { data: AdminSettings; version: number; updatedAt: string | null }
export interface AdminSaveSettingsRequest { values: AdminSettings; expectedVersion: number }

/* ------------------------------------------------------------------ users */

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
export interface AdminCreateUserRequest { email: string; name: string; role: AdminRole; password: string }
export interface AdminUpdateUserRequest { name?: string; role?: AdminRole; active?: boolean }
export interface AdminResetPasswordRequest { newPassword: string }

/* ------------------------------------------------------------------ audit */

export interface AdminAuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

/* ------------------------------------------------------------------ errors */

export interface AdminFieldError { field: string; message: string }
/** Standard error body; `details` lists field errors for 400/422, `current` carries the latest record for 409. */
export interface AdminApiErrorBody {
  error: {
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'CSRF' | 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED'
      | 'UNSUPPORTED_FILE' | 'FILE_TOO_LARGE' | 'REFERENCED' | 'LAST_ADMIN' | 'INVALID_STATE' | 'INTERNAL_ERROR';
    message: string;
    details?: AdminFieldError[];
    retryAfterSeconds?: number;
    /** Latest record, present on 409 CONFLICT so the UI can offer to reload. */
    current?: unknown;
  };
}
