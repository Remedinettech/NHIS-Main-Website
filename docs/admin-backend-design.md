# Admin backend design (PostgreSQL, sessions, draft/publish)

This is the contract between the database, `nhis-api` and `nhis-admin`. Types: `packages/shared-types/src/admin.types.ts` and `content.types.ts`. Schema: `nhis-api/prisma/schema.prisma`.

## Database and roles

- Database `tn_nhis_website` on the local PostgreSQL 18 (separate from every other project database).
- `tn_nhis_owner`: owns the database/schema; used only for migrations (`DIRECT_URL`). Cannot create databases or roles.
- `tn_nhis_app`: runtime role (SELECT/INSERT/UPDATE/DELETE on tables, USAGE/SELECT on sequences via default privileges); `DATABASE_URL`. No DDL.
- Credentials live only in `nhis-api/.env` (git-ignored). Nothing database-related is ever exposed through `VITE_*`, browser code, logs or committed files.
- Migrations are non-destructive and applied with `prisma migrate deploy` (the owner has no CREATEDB, so `migrate dev` shadow databases are not used; generate SQL with `prisma migrate diff --from-empty|--from-migrations ... --script` and commit it under `prisma/migrations/<timestamp>_<name>/migration.sql`).
- Tests use a separate PostgreSQL *schema* (e.g. `nhis_test`) inside the same database, created and migrated by the owner role, never the live `public` schema.

## Publishing model

Every content table (Hospital, Page, Contact, Document, Announcement, GalleryItem) has `status` (DRAFT | PUBLISHED | ARCHIVED), `version`, `draft` (JSON, nullable), `publishedAt`, `archivedAt`.

- The typed columns are the LIVE values. Public endpoints read only rows with `status = PUBLISHED` and use only live columns.
- Create: new row, `status = DRAFT`, `version = 1`, values in the live columns (not public).
- Save on a PUBLISHED row: the full value set goes to `draft`; live columns are untouched; `version++`; `hasDraft = draft != null`.
- Save on a DRAFT row (never published or unpublished): update the live columns directly (still private); `version++`.
- Save on an ARCHIVED row: rejected (INVALID_STATE); restore first.
- Discard draft: `draft = null`, `version++`.
- Publish (PUBLISHED with draft): in one transaction, apply `draft` to the live columns, clear `draft`, set `publishedAt`, `version++`, write a `ContentRevision` (action PUBLISH) with the new live values. Publish on a DRAFT row: `status = PUBLISHED`, same revision rule. Publish with nothing to publish on an already-published row: INVALID_STATE.
- Unpublish: PUBLISHED -> DRAFT (live values kept, any `draft` is merged into live first so nothing is lost), `version++`, revision (action UNPUBLISH).
- Archive: any non-archived -> ARCHIVED, `archivedAt = now`, `version++`, revision (action ARCHIVE). Restore: ARCHIVED -> DRAFT, `archivedAt = null`.
- Hard delete: only rows that are DRAFT, never published (`publishedAt IS NULL`) and not referenced (a MediaAsset referenced by a document/gallery item is kept; an asset with no remaining references is removed from storage). Anything else: REFERENCED / INVALID_STATE with a message suggesting archive.
- Concurrency: every save/publish/unpublish/archive/restore/discard/delete requires `expectedVersion`; if it differs from the row's current `version` respond 409 CONFLICT (body includes the latest record so the UI can reload). Use `updateMany where {id, version}` inside a transaction. Never silently overwrite.
- Every mutation writes an `AuditLog` row in the same transaction (actor id/email, action, entity type/id, summary, JSON detail with changed field names and before/after for non-sensitive fields). Never log passwords, tokens or cookie values.
- Settings (`SiteSetting`) have no draft: an explicit Save validates and applies immediately, with `version` concurrency and an audit entry.

## Roles

| Capability | EDITOR | PUBLISHER | ADMIN |
|---|---|---|---|
| List/view all content (any status), audit view | yes | yes | yes |
| Create, save draft, discard draft, upload files | yes | yes | yes |
| Publish, unpublish, archive, restore, hard-delete eligible drafts | no | yes | yes |
| Edit settings | no | yes | yes |
| Manage users (create, change role, deactivate/reactivate, reset password) | no | no | yes |

Enforced on the server in a single wrapper for every protected route. The last active ADMIN can never be demoted or deactivated (LAST_ADMIN). Users cannot change their own role or deactivate themselves.

## Authentication, sessions, CSRF

- Password hashing with `argon2` (argon2id, maintained); fall back to `bcryptjs` only if argon2 cannot be installed. Minimum password length 12, rejected if equal to the email or in a small deny list; no composition rules theatre.
- `POST /api/v1/admin/auth/login`: constant-time-ish behaviour (hash a dummy when the user is unknown), identical error for unknown user / wrong password / inactive user, rate limited (LoginAttempt table: 5 failures per email+IP per 15 minutes and 30 per IP per 15 minutes, then 429 RATE_LIMITED with Retry-After). Clean successful attempts for that key after success.
- Session: 32+ random bytes, cookie `nhis_admin_session` (`__Host-nhis_admin_session` when Secure), HttpOnly, Path=/, SameSite=Lax (Strict allowed via env), Secure when `NODE_ENV=production` or `ADMIN_COOKIE_SECURE=true`. Only the SHA-256 hash is stored. Idle timeout 30 minutes (sliding), absolute 8 hours (configurable). Logout revokes the row and clears the cookie. Deactivating or password-resetting a user revokes their sessions.
- CSRF: login returns/sets a per-session `csrfToken`; every POST/PUT/PATCH/DELETE must send it in `X-CSRF-Token` (compared in constant time with the session's token) AND the `Origin` (or `Referer`) header, when present, must match an allowed origin (`ADMIN_ALLOWED_ORIGINS`, default the Vite dev origins). Login itself requires an allowed Origin. GET never mutates.
- Responses for authenticated endpoints are `Cache-Control: no-store`. Admin API is never CORS-enabled.
- The browser `sessionStorage` demo marker is never accepted by the API. The demo login in `nhis-admin` is used only when `VITE_ENABLE_DEMO_AUTH=true` and there is no real session; with real authentication available the admin uses the API session.
- Initial administrator: `npm run admin:bootstrap -w nhis-api` reads `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` from the environment or prompts (hidden input) and refuses to run if an ADMIN already exists. No default password anywhere.

## Public API behaviour

- Public endpoints keep their existing response shapes. They read PostgreSQL only: no fallback to JSON when the database fails (respond 503 `UNAVAILABLE`/500 with the standard error body; the client shows its error state).
- Only PUBLISHED, non-archived rows; announcements additionally respect `startsAt`/`endsAt`; never include draft data, review notes, internal ids of users, or storage keys.
- Caching: `Cache-Control: no-cache` plus a strong ETag (conditional GET -> 304) so a publish is visible on the next request without rebuilding anything.
- Files: `GET /api/v1/files/:assetId` streams an asset only if it is referenced by the LIVE assetId of a PUBLISHED document or PUBLISHED gallery item (Content-Type from the stored validated type, `X-Content-Type-Options: nosniff`, `Content-Disposition` inline for PDF/images with a safe filename). `GET /api/v1/admin/files/:assetId` (admin session) streams any asset. Draft files are therefore never public.
- Document `localPath` in public responses becomes `/api/v1/files/<assetId>` for documents that have a published asset; documents without an asset stay `availability: unavailable` with `localPath: null`.

## File storage

- Adapter interface `StorageAdapter { put, get(stream), delete, exists }` with a local-disk implementation rooted at `FILE_STORAGE_DIR` (default `nhis-api/storage`, git-ignored, outside `.next`). Other adapters (S3/Azure Blob) can implement the interface later via `FILE_STORAGE_DRIVER`.
- Uploads: multipart via the Web `Request.formData()`; limit 25 MB for documents, 5 MB for images (env-configurable); allowed documents: PDF only; allowed images: JPEG, PNG, WebP. Validate extension AND magic bytes (`%PDF-`, JPEG FFD8FF, PNG 89504E47, WebP RIFF....WEBP); reject mismatches. Storage key = random id + canonical extension (never the user's filename; originalName kept only as metadata after sanitising). Compute sha256. No path separators ever reach the filesystem layer; resolve and verify the final path stays under the root.

## Import

`npm run db:import -w nhis-api` (repeatable): reads the committed snapshot JSON in `nhis-api/src/data/*.json` and the PDFs in `nhis-client/public/documents`, and creates PUBLISHED records with stable ids (hospital `nhis-snapshot-row-N`, document ids as in the registry, contacts `<directory>-row-<n>`, announcements, pages by slug, directories, settings keys). Each source row is tracked in `ImportMarker` (key + checksum): existing rows/markers are skipped, so re-running never duplicates, never overwrites admin edits and never resurrects deleted records. Tamil text is stored verbatim (UTF-8, no normalisation beyond what the snapshot already holds). PDFs are copied into the storage root with hash verification against the registry. The import writes an AuditLog entry (actor null, action IMPORT).

## Admin API routes (`/api/v1/admin/...`)

All JSON except uploads/files. All require a session; mutating routes require CSRF; role rules above.

- `auth/login` (POST), `auth/session` (GET, returns AdminSessionInfo or `{authenticated:false}`), `auth/logout` (POST), `auth/change-password` (POST).
- Content modules `hospitals`, `pages`, `documents`, `contacts`, `announcements`, `gallery` share this shape (`pages` is addressed by slug, has no create/delete):
  - `GET /<module>` list: `q`, `status` (default ALL non-archived? -> default `ALL` including archived; UI filters), `page`, `pageSize` (<=100), module filters. Server-side search/filter/pagination. Sorted by `sortOrder`/name/updatedAt as appropriate.
  - `GET /<module>/:id`, `POST /<module>` (create), `PUT /<module>/:id` (save), `POST /<module>/:id/{discard-draft|publish|unpublish|archive|restore}`, `DELETE /<module>/:id`.
  - `contacts`: `GET /contacts/directories` plus list filtered by `directoryId`; creating requires `directoryId` in the body (`{ directoryId, values }`).
  - `pages`: also `GET /pages/:slug/preview` returning the PageContent shape with the pending draft applied (admin only).
- `uploads` (POST multipart: `file`, `kind=document|image`) -> AdminAsset. `files/:assetId` (GET).
- `settings` (GET, PUT), `users` (GET list, POST create, PUT /:id, POST /:id/reset-password), `audit` (GET, filters `entityType`, `entityId`, paging).
- Errors always use `AdminApiErrorBody`. Validation is strict (types, lengths, enums, URL schemes: map links https Google Maps only, portal links https only, `tel:` for helplines, Tamil/English strings trimmed, control characters rejected). Request bodies are size-limited.

## Admin UI rules

Same French-blue premium design. Forms group English and Tamil fields, mark required fields, validate inline, disable submit while saving (no double submit), show success only after a 2xx response, show server field errors, warn on unsaved changes (route change and tab close), refresh lists after mutations, confirm Archive/Delete/Publish with the record name, hide actions the signed-in role cannot perform. No development/preview wording. On 401 the UI returns to `/login`; on 409 it offers to reload the latest version.
