# Admin-managed site content (design and contract)

This is the contract between `packages/shared-types`, `nhis-api`, `nhis-admin` and `nhis-client` for editing the public website from the Admin. Types: `packages/shared-types/src/site-content.types.ts`. Operator instructions: `docs/DEPLOYMENT-SITE-CONTENT.md`.

## 1. What is managed where

| Public area | Edited in Admin | Stored as |
|---|---|---|
| Header: emblem, portrait, title, subtitle, helplines, availability, Login menu | **Site content > Header** | `SiteContent` document `header` |
| Main menu, dropdowns, links, order, visibility | **Navigation** | `navigation` |
| Homepage: hero, search, quick tiles, pathways, documents, highlights, section order | **Homepage** | `home` |
| Partner logos and groups | **Partners** | `partners` |
| Footer: logos, about text, link groups, project office address, contact, copyright | **Footer** | `footer` |
| User Manual page: title, introduction, manual PDF, videos (uploaded MP4, YouTube or Google Drive link), order | **User Manual** | `manual` |
| Headings and introductions of Hospitals, Contacts, Government orders, Forms, Gallery, ... | **Page text** | `text` (overrides of Client message keys listed in `EDITABLE_TEXT_CATALOG`) |
| Policy, coverage, eligibility, enrolment, forms, grievances, gallery page bodies (headings, text, images, document links) | existing **Pages** module (now also with image blocks) | `Page` / `PageTranslation` |
| Hospitals, Documents (PDF files), Contacts, Announcements, Gallery | existing modules (unchanged) | existing tables |

The old **Settings** page (scheme name, coverage statement, helplines, portal links; applied immediately) is retired: its values now live in the header / homepage / navigation documents with draft, preview and publish. `SiteSetting` rows stay in the database untouched and are used only as the *initial* values of those documents (section 4). `GET /api/v1/site` and `GET/PUT /api/v1/admin/settings` still exist for compatibility but the public Client no longer reads helplines, portals or the scheme name from them (it still reads announcements from `/site`).

## 2. Lifecycle (reuses the existing engine: `nhis-api/src/modules/admin-content/engine.ts`)

- Table `SiteContent` (one row per key; migration `20261015100000_site_content_cms`, additive: one new table).
- No row = "built-in content". The public site shows the built-in content (section 4) until the document is **published**. The admin editor starts from the same effective values, so nothing visible changes until someone publishes.
- First save creates the row (status DRAFT, `value` = saved values). Publish makes it PUBLISHED (`value` is the live document, public). After that, saves go to `draft` and stay private until Publish. Discard draft, optimistic concurrency (`expectedVersion`; a missing row has version 0), `ContentRevision` on publish and an `AuditLog` row on every mutation come from the engine.
- These documents can never be unpublished, archived or deleted (`allowUnpublish/allowArchive/allowDelete = false`), like pages.
- Roles (unchanged, `common/admin/roles.ts`): read = any role; save / discard draft / upload = `editContent` (EDITOR, PUBLISHER, ADMIN); publish = `publish` (PUBLISHER, ADMIN). Mutations need the session cookie, `X-CSRF-Token` and an allowed Origin (`withAdmin`).

## 3. API

Public (read only, no session, `Cache-Control: no-cache` + strong ETag via `okJson`, so a publish is visible on the next request; there is no server-side content cache to invalidate):

- `GET /api/v1/site-content` -> `SiteContentResponse` = `{ data: { header, navigation, home, partners, footer, text, manual } }`. Every document is the **published** value (validated; an invalid stored value falls back to the built-in content), or the built-in content (with legacy settings overlay) while never published. Drafts are never included. If the `SiteContent` table does not exist yet (migration not applied) the endpoint still answers with the built-in content; it must never answer 500 for that reason.
- `GET /api/v1/files/:assetId` (existing) additionally serves an uploaded image when its id appears in the live value of a PUBLISHED `SiteContent` row, or in an image block of a PUBLISHED page (checked with `jsonb_path_exists`; a missing `SiteContent` table is treated as "not referenced"). Drafts and unreferenced uploads stay 404.
- `GET /api/v1/pages/:slug` (existing) may now contain `image` blocks (`ImageBlock`).

Admin (`/api/v1/admin/...`, session cookie, never CORS-enabled, `no-store`):

- `GET site-content` list of the seven documents (fixed order, virtual rows included); `GET site-content/:key`; `PUT site-content/:key` `{ values, expectedVersion }`; `POST site-content/:key/{discard-draft|publish}` `{ expectedVersion }`. Same envelope as other modules (`AdminSiteContent`).
- `GET site-content/preview` -> `SiteContentResponse` with the pending drafts applied (draft ?? live ?? built-in). Session required.
- `GET pages/:slug/preview` (existing) returns the page with its pending draft.
- Uploads: existing `POST /admin/uploads` (`kind=image`: JPEG, PNG, WebP, 5 MB). Uploaded files are private until referenced by published content.

Server-side image size: whenever a document (or page) is saved, every uploaded image it references is looked up (must exist, `kind = IMAGE`), its pixel size is read from the stored file (JPEG/PNG/WebP header) and written into `width`/`height` (any size sent by the browser is ignored).

## 4. Built-in content and legacy overlay

`DEFAULT_SITE_CONTENT` (`packages/shared-types/src/site-content.defaults.ts`) is the exact content the Client had hard-coded before this feature (English and Tamil text, links, partner list, section order, built-in images under `nhis-client/public/assets`). It is used by the API (public fallback, admin initial values) and by the Client (when the API cannot be reached) so the site never renders empty chrome.

For a document that has no row, the API applies the legacy `SiteSetting` rows on top of the built-in content so that values edited in the old Settings page are preserved: scheme name -> `header.subtitle` and `home.hero.title`; coverage statement -> `home.hero.coverageStatement`; availability and helplines -> `header.availability` / `header.helplines`; portal links (`employee`, `pensioner`, `administrator`, `insurer`, `trackClaim`, `forgotPassword`, `hospitalMediAssist`, `hospitalMdIndia`) -> the external target and label of the matching link ids in header / navigation / home / footer. Stored documents are never overlaid.

## 5. Validation and sanitising (`validateSiteContent`, shared by API and Admin)

- One strict validator: `validateSiteContent(key, input)` returns `{ ok, value }` (normalised copy) or `{ ok: false, issues: [{ field, message }] }`; `field` is a path inside the document such as `partners[2].logo.alt.en`. The API calls it (authoritative); the Admin calls it for inline errors. Unknown properties are rejected at every level. JSON size <= `SITE_CONTENT_MAX_BYTES`; lists bounded by `SITE_CONTENT_LIMITS`.
- Text is plain text only: trimmed, NFC, no control characters (line breaks only in long-text fields) and no HTML-like markup (`<` followed by a letter, `/`, `!` or `?` is rejected). The Client renders every string as text, never as HTML.
- Links are structured (`LinkTarget`): `route` paths must be a known `SITE_ROUTES` path with an optional `#anchor`; `external` must be an `https:` URL without credentials (<= 500 chars); `document` ids must exist in the Documents module (checked by the API); `email`/`phone` are validated. No `javascript:`, `data:` or arbitrary scheme can be stored.
- Images: `assetId` (an uploaded IMAGE) or `builtIn` (path matching `BUILT_IN_ASSET_PATTERN`), alt text required in English, optional in Tamil. SVG is not accepted anywhere.
- Ids are unique within the document; `home.sections` lists every section exactly once, `hero` first and visible; every `partners[].categoryId` exists; interface-text keys must be in the catalog and keep the same `{placeholders}` as the built-in text.
- Referential checks done by the API (not the pure validator): referenced documents exist, referenced assets exist and are images.

## 6. Client behaviour (`nhis-client`)

- `SiteContentProvider` loads `GET /site-content` once (short cache, refreshed on window focus), falls back to `DEFAULT_SITE_CONTENT` per document if the request fails or a document is missing, and exposes `useSiteContent()`.
- Header, support strip, login menu, primary navigation, footer, homepage sections, partners and the text overrides all read from it; the Client's existing locale files remain the built-in text for everything else. `t(key)` consults `text.overrides` first.
- Language: every bilingual value is shown with `pickBilingual` (empty Tamil falls back to English with `lang="en"`).
- Images: `assetId` -> `<API base>/files/<id>` (`resolveApiUrl`), `builtIn` -> `assetUrl(path)` so IIS sub-paths work. Logos keep their natural proportions (`width`/`height` attributes, CSS `height:auto`, `object-fit: contain`, never `cover`); no cropping.
- Gallery rule is kept: a navigation link to `/gallery` is hidden while the Gallery has no published item.
- Preview: opening the Client with `?preview=1` (remembered in `sessionStorage` for the tab) makes it read `GET /admin/site-content/preview` and `GET /admin/pages/:slug/preview` with the browser's admin session cookie and show uploaded images from `/admin/files/:assetId`; a banner says "Preview: unpublished changes, not visible to the public". Without a valid admin session it shows the published site plus a banner explaining that. The preview is the same Client code, so both languages, navigation, responsive layout and IIS base paths behave identically.

## 7. Admin behaviour (`nhis-admin`)

- Sidebar entry **Site content** (hub with one card per document and a map of every public route -> where it is edited) and one editor per document using the existing `RecordEditor` (save draft, save and publish, discard draft, history, conflict banner, unsaved-changes guard, role-aware buttons). Settings route redirects to the hub.
- Forms, not JSON: bilingual text fields with length counters, image upload with preview / replace / remove and required alt text, link picker (route list, document picker, https URL, email, phone), reorder with up/down buttons, show/hide toggles, add/remove rows, inline validation with the shared validator, server field errors mapped to the same paths.
- "Preview on website" opens the Client with `?preview=1` (`VITE_CLIENT_URL`, default `http://127.0.0.1:5173` in development, `/TNNHIS/` in production builds).

## 8. Remaining hard-coded content (kept in code on purpose)

Documented in `docs/DEPLOYMENT-SITE-CONTENT.md` ("Not editable from the Admin").

## 9. Contact page and Grievances page

- Contact page (`nhis-client/src/pages/ContactsPage.tsx`): intro, Helplines block and the directory tabs (TPA coordinators, UIIC Nodal Officers, Hospital nodal officers, District Treasury Offices, UIIC Project Office Officials). It no longer shows the project office address; the address is part of the `footer` document. Tab names come from the `contacts.directories.*` texts (editable under **Page text**); the Admin lists the same names (`nhis-admin/src/config/contactColumns.ts`, `directoryTitle`).
- Grievances page (`nhis-client/src/pages/GrievancesPage.tsx`): the page body (TPA beneficiary sections) is database content (`Page` slug `grievances`, edited under **Website pages**). Its English seed text and the Admin action "Use current English grievance contacts" carry the wording of the live site (`packages/shared-types/src/grievance-defaults.ts`, `nhis-api/src/data/pages.json`). The NHIS 2026 nodal officer and the two escalation matrices are rendered from `nhis-client/src/config/projectOffice.ts` unless the stored page already contains sections with the ids `nodal-2026`, `escalation-1`, `escalation-2` (`hasPageSection`); then the stored copy is shown and the built-in copy is hidden.


