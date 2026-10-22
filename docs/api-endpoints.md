# API endpoints

All implemented endpoints are public, read-only and served from the bundled 7 October 2026 snapshot (`nhis-api/src/data/*.json`). No database is required; data access sits behind repository interfaces (`src/modules/<feature>/<feature>.repository.ts`) so a SQL Server or PostgreSQL repository can replace the snapshot one without touching services or routes. Successful GETs carry `Cache-Control: public, max-age=300`.

| Method | Path | Response |
|---|---|---|
| GET | /api/v1/health | Process status, snapshot mode, databaseConnected=false |
| GET | /api/v1/stats | Counts computed from the data (hospitals, contact rows, documents) with breakdowns |
| GET | /api/v1/hospitals | Paginated directory (q, district, page, pageSize) |
| GET | /api/v1/hospitals/:id | One snapshot record, or 404 |
| GET | /api/v1/pages/:slug | Structured source page (employee-policy, pensioner-policy, coverage, eligibility, how-to-enroll, forms, grievances, gallery) with EN/TA content, document ids and review notes |
| GET | /api/v1/documents | Document registry (23 records; `category`, `audience` filters) |
| GET | /api/v1/documents/:id | One document record |
| GET | /api/v1/contacts | The four directories (summary + flags) |
| GET | /api/v1/contacts/:directory | All source rows of one directory |
| GET | /api/v1/site | Scheme name, coverage statement, helplines, announcements |
| GET | /api/v1/gallery | Gallery items (currently none) |

Errors: 400 `INVALID_QUERY`, 404 `NOT_FOUND`, 500 `INTERNAL_ERROR` (no stack traces). Hospital parameters: q (max 200 characters, literal, whitespace-normalised, English and Tamil), district, page (positive integer, clamps to the last page), pageSize (1-100, default 12).

Not implemented: authentication, admin CRUD/publish, uploads, users, settings writes. `src/common/authorization.ts` always denies (501) and no write route exists. Specify contracts before adding any.

Local development uses the Vite `/api` proxy. For production prefer reverse-proxy routing; with separate origins, add an explicit CORS allow-list and cookie/CSRF handling before admin sessions exist.

## Admin-managed site content

Design and contract: `docs/site-content-management.md`. Public, read only, `Cache-Control: no-cache` + strong ETag (a publish is visible on the next request):

| Method | Path | Response |
|---|---|---|
| GET | /api/v1/site-content | `{ data: { header, navigation, home, partners, footer, text } }`: per document the PUBLISHED value (re-validated; an invalid stored value falls back), else the built-in content with the legacy settings overlay. Drafts are never included. While the `SiteContent` table does not exist (migration pending) it answers with the built-in content and logs one warning; it never answers 500 for that reason. |
| GET | /api/v1/files/:assetId | (existing) additionally serves an uploaded IMAGE whose id appears in the live value of a PUBLISHED `SiteContent` row or in an `image` block of a PUBLISHED page (checked with `jsonb_path_exists`; a missing table counts as "not referenced"). Drafts and unreferenced uploads stay 404. |
| GET | /api/v1/pages/:slug | (existing) page sections may now contain `{ type: 'image', assetId, alt, caption?, width, height }` blocks, returned as stored. |

Admin (session cookie, CSRF on mutations, `no-store`, never CORS-enabled):

| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/admin/site-content | The six documents in fixed order (`header, navigation, home, partners, footer, text`); a document without a row is a virtual record (`version: 0`, `customised: false`, values = built-in content plus legacy overlay). Any role. |
| GET | /api/v1/admin/site-content/preview | `SiteContentResponse` with pending drafts applied (draft, else saved value, else effective default; validated like the public endpoint). Any role. |
| GET | /api/v1/admin/site-content/:key | One record (404 for an unknown key). |
| PUT | /api/v1/admin/site-content/:key | `{ values, expectedVersion }`. Strict validation (`validateSiteContent`), 400 with field paths relative to the document; documents and images referenced must exist (images: kind IMAGE); `width`/`height` of uploaded images are read from the stored file. Version 0 creates the row. Needs `editContent`. |
| POST | /api/v1/admin/site-content/:key/{discard-draft\|publish} | `{ expectedVersion }`; publish needs `publish` and writes a `ContentRevision`. `unpublish`, `archive` and `restore` are routed but always answer 409 `INVALID_STATE`. |

There is no create or delete route for site content. Pages (`/admin/pages`) accept `image` blocks (`assetId` of an uploaded IMAGE, required `alt`, optional `caption`; `width`/`height` are accepted but ignored and filled by the server).
