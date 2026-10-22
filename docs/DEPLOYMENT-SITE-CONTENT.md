# TN-NHIS content-management release: deployment guide

This guide upgrades the **existing** IIS deployment described in `docs/IIS-DEPLOYMENT.md` (`J:\TN_NHIS_WEBSITE`: `Client`, `Admin`, `ApiProxy`, `Backend`, `Uploads`, `Logs`, `Service`) to the release in which the Admin edits the whole public website. Read this guide completely before starting; do the steps in this order.

**Status.** Everything in this release was built and tested on a developer machine (typecheck, automated tests, production builds, a real browser against a real API and a throw-away PostgreSQL). **Nothing has been run on the real server yet.** IIS rewrite rules, ARR, the Windows service, certificates and ACLs can only be verified there; section 7 lists every check to perform.

**Nothing in this release changes your data by itself.** No script migrates, seeds, resets or imports anything automatically. The three database migrations are applied by a person (section 3) after review. Until an administrator publishes content, the public site shows the built-in content that ships with the code, which is exactly what it showed before.

## 0. What changes

| Area | Change |
|---|---|
| Admin | New **Site content** area (Header, Navigation, Homepage, Partners, Footer, Page text, **User Manual**), picture blocks in Pages, **Excel import** (drafts only) for Hospitals, Contacts, Documents, Announcements and Partners. The old Settings page redirects to Site content. |
| Public site | Header, menu, homepage sections, partners, footer, page text and the new **User Manual** page (`/TNNHIS/user-manual`) read their content from the API. If the API cannot be reached the built-in content is shown. The **Contact** page no longer shows the project office address (it stays in the footer) and its fifth tab is named **UIIC Project Office Officials**; the **Grievances** page shows the same text and tables as the live site (section 12). |
| Database | Three **additive** migrations (section 3): table `SiteContent`, table `ContentImport`, and the value `VIDEO` added to the enum `AssetKind`. No existing table, column or row is touched. |
| API | New public route `GET /api/v1/site-content`; admin routes under `/api/v1/admin/site-content` and `/api/v1/admin/imports`; HTTP Range support for files (video seeking); `GET /api/v1/site` now follows the published header/homepage. Packages added to `package.json`: `exceljs`, `yauzl` (and a `uuid` override). `npm ci` installs them. |
| Settings (`.env`) | New optional settings (section 6). **Excel import needs `ADMIN_IMPORT_SIGNING_KEY`.** |
| Static files | `Client\user-manual\` (about 28 MB: four narrated MP4 videos and the manual PDF). `Client\web.config` registers `.mp4`. |
| Unchanged | Authentication, sessions, CSRF, cookies (`Secure`, `HttpOnly`, `Path=/TNNHISApi`), roles, audit log, the other NHIS applications and databases. |

Roles (unchanged): EDITOR saves drafts and uploads; PUBLISHER and ADMIN publish; ADMIN manages users.

## 1. Who does what and what you need

* **DBA**: backups of the database, review and application of the migrations (or approval of the operator doing it), grants.
* **Operator** (server administrator): backups of the folders, copying the release, `.env` additions, service restart, verification.
* **Developer**: builds the release package.

Needed: Node.js 22.12 or newer on the server and on the build machine, PostgreSQL client tools (`psql`, `pg_dump`) on a machine that can reach the database, WinSW service `TNNHISApi` already installed, HTTPS on Default Web Site, URL Rewrite + ARR with the proxy enabled (all as in `IIS-DEPLOYMENT.md` section 2). Plan a maintenance window of about one hour; the API is stopped for roughly ten minutes of it.

## 2. Backups (do all of them; keep them until the release is accepted)

Run on the server unless stated. Replace `<DB_HOST>`.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$bk = "J:\TN_NHIS_WEBSITE\_backup\$stamp"
New-Item -ItemType Directory -Force $bk | Out-Null

# 1. Database (custom format; schema + data). Needs the owner role password; do not store it in a script.
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h <DB_HOST> -U tn_nhis_owner -d tn_nhis_website -Fc -f "$bk\tn_nhis_website.dump"
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list "$bk\tn_nhis_website.dump" | Select-Object -First 8   # must list the tables, not an error

# 2. Uploaded files (database rows only reference them; back both up from the same moment)
robocopy J:\TN_NHIS_WEBSITE\Uploads "$bk\Uploads" /E /COPY:DAT /R:1 /W:1

# 3. Application folders as deployed (no node_modules/.next: they are rebuilt)
robocopy J:\TN_NHIS_WEBSITE\Client   "$bk\Client"   /E
robocopy J:\TN_NHIS_WEBSITE\Admin    "$bk\Admin"    /E
robocopy J:\TN_NHIS_WEBSITE\ApiProxy "$bk\ApiProxy" /E
robocopy J:\TN_NHIS_WEBSITE\Backend  "$bk\Backend"  /E /XD node_modules .next
robocopy J:\TN_NHIS_WEBSITE\Service  "$bk\Service"  /E /XF *.log

# 4. Server-only settings (contains secrets: keep the backup folder restricted to Administrators)
Copy-Item J:\TN_NHIS_WEBSITE\Backend\nhis-api\.env "$bk\nhis-api.env"

# 5. IIS configuration
& "$env:windir\system32\inetsrv\appcmd.exe" add backup "pre-cms-$stamp"
```

**Prove the database backup restores**: restore the dump into a *different, disposable* database or server (never over production), compare row counts with `deploy\db\review\00-preflight-readonly.sql`, then drop it. Record the numbers in the change record: build version of the running release, `node -v`, `npm -v`, the output of `npm run db:status -w nhis-api` (read-only), file counts and sizes of `Uploads`.

## 3. Migration review and application

### 3.1 What the three migrations do (all in `nhis-api/prisma/migrations`, copies in `deploy/db/review`)

| Migration | SQL | Effect |
|---|---|---|
| `20261015100000_site_content_cms` | `CREATE TABLE "SiteContent" (...)` | Stores the content documents (header, navigation, homepage, partners, footer, page text, user manual) with draft/publish columns. Created **empty**. |
| `20261015110000_content_import` | `CREATE TABLE "ContentImport" (...)` + one index | Stores resumable Excel import jobs. Created **empty**. |
| `20261015120000_manual_video` | `ALTER TYPE "AssetKind" ADD VALUE IF NOT EXISTS 'VIDEO'` | Allows uploaded MP4 videos. The only change to an existing object; existing values and rows are unchanged. |

They match `nhis-api/prisma/schema.prisma` exactly (checked with `prisma migrate diff`). Review the three files in `deploy/db/review/` (`01-…`, `02-…`, `03-…`; byte-identical to the Prisma migrations). Important properties: nothing is dropped or altered in existing tables; the enum value **cannot be removed again** (PostgreSQL has no `DROP VALUE`, see section 8); an application release older than this one fails when it reads an uploaded video's database row (only exists after videos are uploaded).

### 3.2 Preflight (read-only)

```powershell
cd J:\TN_NHIS_WEBSITE\_incoming\MigrationReview      # from the release ZIP; the same files are in deploy\db\review of the source
psql -h <DB_HOST> -U tn_nhis_owner -d tn_nhis_website -f 00-preflight-readonly.sql > preflight-before.txt
```

Expected: both new tables `NULL`, `AssetKind` lists only `DOCUMENT` and `IMAGE`, `_prisma_migrations` lists the migrations the production database already has (a database restored from the 13 Oct 2026 backup has only `20261012160000_init`). **If the list does not match the migration history in the repository, stop**: the DBA must reconcile it against the real schema first. Never mark an unapplied migration as applied, never use `prisma db push`, `migrate dev`, `migrate reset`, `db:seed` or `db:import` on this database.

### 3.3 Apply (maintenance window, API stopped, backups taken)

**Option A: Prisma applies them** (recommended; records them in `_prisma_migrations`). From the new `Backend` folder (section 5, step 4) with the owner connection supplied for this PowerShell session only:

```powershell
cd J:\TN_NHIS_WEBSITE\Backend
$env:DIRECT_URL = 'postgresql://tn_nhis_owner:<OWNER_PASSWORD>@<DB_HOST>:5432/tn_nhis_website?schema=public'
npm run db:status  -w nhis-api      # READ-ONLY: expect exactly the three migrations above as pending
npm run db:migrate -w nhis-api      # prisma migrate deploy: applies only pending migrations
Remove-Item Env:DIRECT_URL
npm run db:status  -w nhis-api      # expect: Database schema is up to date!
```

**Option B: the DBA applies the SQL by hand** (when the operator must not hold the owner password), then records them:

```powershell
psql -h <DB_HOST> -U tn_nhis_owner -d tn_nhis_website -v ON_ERROR_STOP=1 -f 01-20261015100000_site_content_cms.sql
psql -h <DB_HOST> -U tn_nhis_owner -d tn_nhis_website -v ON_ERROR_STOP=1 -f 02-20261015110000_content_import.sql
psql -h <DB_HOST> -U tn_nhis_owner -d tn_nhis_website -v ON_ERROR_STOP=1 -f 03-20261015120000_manual_video.sql
# then, with DIRECT_URL set as above, once per migration (otherwise `migrate deploy` later fails with "already exists"):
npx prisma migrate resolve --applied 20261015100000_site_content_cms  --schema nhis-api\prisma\schema.prisma
npx prisma migrate resolve --applied 20261015110000_content_import    --schema nhis-api\prisma\schema.prisma
npx prisma migrate resolve --applied 20261015120000_manual_video      --schema nhis-api\prisma\schema.prisma
```

**Option C: one reviewed script for the DBA** (pgAdmin or psql; same result as A and B): `MigrationReview\04-release-all-in-one.sql`. It creates the two empty tables, adds the enum value, grants the runtime role, refuses to run in the wrong database or against a different table structure, is re-runnable, and applies everything or nothing. Afterwards record the three migrations with the three `prisma migrate resolve --applied` commands of Option B (the script deliberately does not write `_prisma_migrations`: Prisma stores a checksum of the exact bytes of each migration file). The data script `05-data-project-office-officials.sql` and the exact order are in `MigrationReview\README-RELEASE-DB.md`.

Use exactly **one** of the options A, B and C. All were tested on a PostgreSQL 18 database restored from the 13 October production backup (initial migration only); after option C and the three `resolve` commands `prisma migrate status` reports up to date and `prisma migrate diff` against `schema.prisma` is empty.

### 3.4 Verify

```powershell
psql -h <DB_HOST> -U tn_nhis_owner -d tn_nhis_website -v app_role=tn_nhis_app -f 10-verify-after-readonly.sql > verify-after.txt
```

Expected: both tables exist and are empty, `AssetKind` has `DOCUMENT`, `IMAGE`, `VIDEO`, the three migrations show `finished_at` and no `rolled_back_at`, the runtime role has `t` for SELECT/INSERT/UPDATE/DELETE on both tables, and the row counts of the existing tables equal `preflight-before.txt`. If a privilege is `f`, run `20-grants-if-missing.sql` (same `-v app_role=` option); normally the default privileges already grant them. Use the real runtime role name from `DATABASE_URL`.

## 4. Build the release (developer machine)

From the extracted clean source package (or the repository):

```powershell
npm ci
npm run db:generate          # generates the Prisma client; no database access
npm run typecheck
powershell -ExecutionPolicy Bypass -File scripts\package-deployment.ps1
```

The script runs the typecheck and both production builds (base paths `/TNNHIS/`, `/TNNHISAdmin/` and API `/TNNHISApi/api/v1` come from the committed `nhis-client/.env.production` and `nhis-admin/.env.production`; the Admin's `VITE_CLIENT_URL=/TNNHIS/` is also there), refuses to continue if a build does not use its sub-path, assembles `deploy-package\TN_NHIS_WEBSITE\{Client,Admin,ApiProxy,Backend,Service,Config,MigrationReview}` and scans for secrets, `.env` files and connection strings. It writes the ZIP and its SHA-256. Compare the checksum on the server before extracting.

## 5. Deploy to the server

Extract the ZIP to `J:\TN_NHIS_WEBSITE\_incoming` and check the SHA-256.

**Order matters: the API release (with its migrations) goes live before, or together with, the new Client.** The new Client reads `GET /api/v1/site-content`. An API without that route answers 404, and the Client then shows its built-in content, which is not what the live site shows today (built-in helplines 1800-233-5666 / 1800-233-5544 and a login-support line, "Upto 5 Lakh", login links to tn-nhis.com; the live site shows helplines 1800-210-7800 / 1800-210-9800, "Upto 7.5 Lakh rupees" and the claims.tn-nhis.net portal links). The new API produces the live values from the existing Settings rows (the "legacy overlay", section 4 of `docs/site-content-management.md`; checked on 19 October 2026 by applying the live `/api/v1/site` values to the built-in content with the real overlay code: helplines, availability, coverage statement and the portal links come out as on the live site). Never publish the Client first, and keep the old Client folder until section 7 is complete.

Then:

1. **Announce** the window; confirm the backups of section 2 exist.
2. **Stop the API**: `cd J:\TN_NHIS_WEBSITE\Service; .\tnnhis-api.exe stop` (Windows service name `TNNHISApi`). The static sites keep answering but cannot load data.
3. **Migrations**: do section 3.2 (preflight), 3.3 Option B now **or** Option A after step 4, then 3.4.
4. **Backend** (never `/MIR` here, never touch `.env`). **Copy with `robocopy` only.** Next.js routes live in folders named like `[id]` (for example `admin\site-content\[id]\route.ts`); PowerShell cmdlets such as `Copy-Item` and `Test-Path` read `[id]` as a wildcard and silently copy or find nothing, which leaves exactly those routes missing in production (the Admin then reports "could not be loaded" for a document while the list works). After copying, run `scripts\Verify-Backend.ps1 -Server <Backend folder>` (shipped with the release as `Verify-Backend.ps1` and `Backend-manifest.txt`): it lists every MISSING or DIFFERENT file and must end with "The Backend source matches the release". To test from outside: an admin route that exists answers JSON 401 or 405, a missing one answers an HTML 404 page.
   ```powershell
   robocopy J:\TN_NHIS_WEBSITE\_incoming\Backend J:\TN_NHIS_WEBSITE\Backend /E /XF .env
   cd J:\TN_NHIS_WEBSITE\Backend
   npm ci -w nhis-api
   npx prisma generate --schema nhis-api\prisma\schema.prisma
   npm run build -w nhis-api
   npm run db:status -w nhis-api      # READ-ONLY; must say "up to date" once section 3 is done
   ```
5. **`.env`**: add the settings of section 6 to `J:\TN_NHIS_WEBSITE\Backend\nhis-api\.env` (see `Config\nhis-api.env.template`). Keep the file's permissions (readable by the service account and Administrators only).
6. **Static sites**: `robocopy J:\TN_NHIS_WEBSITE\_incoming\Client J:\TN_NHIS_WEBSITE\Client /MIR` and the same for `Admin` and `ApiProxy` (each folder contains its own `web.config`). `Client` now contains `user-manual\` (videos and PDF).
7. **Start the API**: `.\tnnhis-api.exe start`, then `.\tnnhis-api.exe status` and read `J:\TN_NHIS_WEBSITE\Logs\tnnhis-api.err.log`.
8. **Verify** (section 7). Keep `_backup\<stamp>` and `_incoming` until the release is accepted.

To restart the API at any time: `cd J:\TN_NHIS_WEBSITE\Service; .\tnnhis-api.exe restart` (or `Restart-Service TNNHISApi`).

## 6. Settings added to `nhis-api\.env`

| Variable | Value | Purpose |
|---|---|---|
| `ADMIN_IMPORT_SIGNING_KEY` | random secret, at least 32 characters, **required to use Excel import** | Signs import previews. Generate on the server: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Never put it in a `VITE_*` variable or in source control. Without it the API still starts; import calls answer a clear configuration error. |
| `ADMIN_IMPORT_MAX_BYTES` | optional, default 2000000, maximum 5000000 | Largest workbook. |
| `ADMIN_IMPORT_MAX_ROWS` | optional, default 500, maximum 2000 | Rows per workbook. |
| `UPLOAD_MAX_VIDEO_BYTES` | optional, default 26214400 (25 MB), cannot exceed 25 MB | Uploaded MP4 size. Larger videos should be YouTube or Google Drive links. |

Unchanged and still required: `DATABASE_URL`, `FILE_STORAGE_DIR`, `ADMIN_ALLOWED_ORIGINS` (the exact HTTPS origin of the sites), `ADMIN_COOKIE_PATH=/TNNHISApi`, `ADMIN_TRUSTED_PROXY_HOPS=1`, `PUBLIC_API_ALLOWED_ORIGINS`. `DIRECT_URL` stays **absent** from `.env` (it is supplied only for the migration step).

Upload size chain (all three must allow the largest upload): IIS `ApiProxy\web.config` `maxAllowedContentLength="31457280"` (30 MB), Next.js `proxyClientMaxBodySize: '30mb'` (in `nhis-api/next.config.ts`), and the limits above (documents 25 MB, images 5 MB, videos 25 MB). Raise them together if you ever change one.

## 7. Verification (on the server, in this order)

Public (use a private browser window so no admin session interferes). On the live domains read `https://<server>/TNNHIS/` as `https://www.tn-nhis.net/` and `https://<server>/TNNHISApi/` as `https://claims.tn-nhis.net/TNNHISApi/` (section 13):

1. `https://<server>/TNNHIS/` loads exactly as before (header, helplines, menu, homepage, partners, footer). The footer text names the service partners Vidal Health, Medi Assist and Health Insurance TPA of India (HITPA). The helpline strip still shows what it shows today (on 19 October 2026: Employee 1800-210-7800, Pensioner 1800-210-9800, 24/7), the Login menu and footer portal links still point to the claims.tn-nhis.net pages, and the hero still says "Upto 7.5 Lakh rupees". If any of these shows other values, the API is not the new release (see the order rule in section 5).
2. `https://<server>/TNNHISApi/api/v1/site-content` returns JSON with the headers `Cache-Control: no-cache` and an `ETag`; repeating the request with `If-None-Match` returns 304.
3. The menu has **User Manual**; `https://<server>/TNNHIS/user-manual` shows the manual button (the PDF opens) and four videos that play and **seek** (drag the position slider; this proves Range requests through ARR). Check English and Tamil (`தமிழ்` button), a deep link refresh (`/TNNHIS/hospitals`), and a phone-width window.
4. Hospitals search, a government order PDF download and the Gallery rule still behave as before.
5. `/TNNHIS/contacts`: the page shows the intro and the Helplines block, **no** "Project office address" block, and the tabs end with **UIIC Project Office Officials** (14 rows: No., Emp. No., Name, Designation, E-mail). `/TNNHIS/grievances`: the three beneficiary sections (HITPA, Medi Assist, VIDAL HEALTH) followed by "Nodal Officer for NHIS 2026 Implementation", "Escalation Matrix 1" and "Escalation Matrix 2", as on https://www.tn-nhis.net/grievances. Check both in Tamil too.

Admin (HTTPS only):

6. Sign in as an EDITOR: Site content → Header: change a helpline label, **Save**. The public site is unchanged. Open **Preview on website**: the banner "Preview: unpublished changes" appears and shows the change. An EDITOR has no Publish button.
7. Sign in as a PUBLISHER: **Save and publish**. Reload the public site: the change is there immediately (a tab that is already open picks it up on its next focus, at most 15 seconds after the previous refresh). Revert it the same way.
8. Upload a small PNG as a partner logo: publish, confirm it displays with its proportions, and that `https://<server>/TNNHISApi/api/v1/files/<id>` answers 404 **before** publishing and 200 after.
9. User Manual → add a video as a YouTube or Google Drive link (the Drive file must be shared "Anyone with the link"), publish, check it plays embedded; then remove it again.
10. A draft or preview URL without a session shows no draft: open `https://<server>/TNNHIS/?preview=1` in a private window: the published site plus the sign-in notice.
11. Excel import (only if `ADMIN_IMPORT_SIGNING_KEY` is set): Hospitals → Import Excel → download the template, upload it unchanged: preview must show no rows to import; nothing is written until you confirm, and confirmed rows become **drafts**.
12. Cookie check (browser developer tools): `tnnhis_admin_session`, `Path=/TNNHISApi`, `HttpOnly`, `Secure`, `SameSite=Lax`. Sign out: the next admin request answers 401.
13. Logs: `Logs\tnnhis-api.err.log` shows no errors; `npm run storage:check -w nhis-api` still passes.

## 8. Rollback

**Ordinary rollback = previous application release; the database stays.** Stop the API, restore the folders from `_backup\<stamp>` (`robocopy ... /MIR` for `Client`, `Admin`, `ApiProxy`; for `Backend` restore the files then `npm ci -w nhis-api`, `npx prisma generate`, `npm run build -w nhis-api`), keep the current `.env` (remove nothing), start the API and run section 7 for the old release. The two new tables are unknown to the old code and harmless. **Caveat**: after an uploaded MP4 exists, the old release fails when it reads that file's `MediaAsset` row (`kind = VIDEO`). If you roll back after videos were uploaded, either keep the new release or run the first query of `90-rollback.sql` to count them and delete those rows (and their files) after a backup.

**Emergency database rollback** (only if the tables must go): export them (`pg_dump -t "\"SiteContent\"" -t "\"ContentImport\"" -Fc`), make sure the old release is running, then `psql ... -v ON_ERROR_STOP=1 -v confirm=YES -f 90-rollback.sql`. It drops `ContentImport` and `SiteContent` and removes their `_prisma_migrations` rows; it **cannot** remove the `VIDEO` enum value, and it leaves uploaded files and audit history alone. It refuses to run without `-v confirm=YES`.

**Full restore** (data loss of everything since the backup): stop the API, restore `tn_nhis_website.dump` into the database with the DBA's procedure **together with** `$bk\Uploads` from the same moment (documents and images return 404 without their files), restore the folders, start the API. Never restore a snapshot over a running service. Changes made after the backup are lost.

## 9. Operating notes for administrators

* Saving creates a **private draft**; visitors see a change only after a PUBLISHER publishes it. **Preview on website** shows the draft to the signed-in browser only.
* A document that was never saved shows the built-in content. A published document is used exactly as saved: later changes of the built-in defaults never overwrite it. The editor has **Load built-in content** to start over (nothing is saved until you save).
* Headings and introductions of the Hospitals, Contacts, Government orders and other pages are under **Page text**; page bodies are under **Pages**; hospitals, documents, contacts, announcements and the gallery keep their own screens. **Site content → "Where each public page is edited"** lists every public page.
* Uploaded files are private until a published document uses them; replaced pictures stay in storage (back up `Uploads` with the database).
* Video guidance: MP4 up to 25 MB can be uploaded; for anything larger use YouTube or Google Drive links. Google Drive links must be shared as **Anyone with the link** or visitors are asked to sign in.
* Tamil: every text has an optional Tamil field; empty Tamil shows the English text. The Tamil wording of the new interface texts (for example the User Manual menu and page) are drafts and need review by a Tamil reader.

## 10. Content that is not editable from the Admin (stays in code)

Application behaviour and layout, route definitions, icons, accessibility texts (skip link, menu labels), loading/error/empty-state messages, pagination, hospital card field labels, search result counts, the "Pause/Resume" labels of the helpline strip, the preview banner text, validation messages, directory (Contacts) schemas and document category names, the legacy URL redirect table, and the static `index.html` (browser title before the page loads, meta description, the `<noscript>` message with the two helpline numbers). Related-page links at the bottom of the policy pages are fixed. The NHIS 2026 nodal-officer and escalation tables of the Grievances page are built into the Client (`nhis-client/src/config/projectOffice.ts`) until an administrator stores them in the page text (section 12). Details are in `docs/site-content-management.md`.

## 11. What was and was not verified

Verified on a developer machine: typecheck; automated tests (client, admin, API against a disposable PostgreSQL 18); production builds with the IIS sub-paths; the migration chain on a newly created disposable database (successful application and empty Prisma schema diff; existing-server migration history and rollback execution remain operator checks); a real-browser run with real API: editor/publisher roles, draft isolation, preview, publishing, image and MP4 upload, Range requests, Tamil and a 360 px layout.

**Not verified (needs the real server):** IIS URL Rewrite and ARR behaviour (including video seeking through the proxy), HTTPS and `Secure` cookies on the real host, the WinSW service, Windows permissions, database access from the server, and the real database's migration history. Dependency note: `npm audit --omit=dev` reports three high advisories in Prisma's own CLI chain (`deepmerge-ts`, build-time only); the Excel and archive libraries report none. Do not apply a forced major downgrade to "fix" it.

Final recovered-tree and clean-package evidence, including limits of repeated browser coverage, is in docs/verification-admin-content.md (delivered separately as VERIFICATION.md).


## 12. Contact page and Grievances page (project office officials, live grievance text)

**What this part of the release changes**

| Item | Change | Needs a database change? |
|---|---|---|
| Contact page | The "Project office address" block is removed from the page (the address stays in the footer; edit it under **Website content > Footer & office address**). The fifth directory tab is named **UIIC Project Office Officials** (English and Tamil); the name also appears in Admin (**Contact directories**) and in **Page text > Contacts**. | No. |
| UIIC Project Office Officials (14 people) | Contact directory `project-office-officials`: published records appear in the tab; drafts and imports use the normal workflow. | **Only if the records are not yet in the database.** On 19 October 2026 the live `GET /api/v1/contacts` already listed the directory with 14 records, so nothing is needed there; the live API's `/contacts/project-office-officials` answers 404 only because the old API release lacks that directory, which the new API release fixes. For a database without them use `MigrationReview\05-data-project-office-officials.sql` (published immediately, inserts only missing rows, aborts on conflicts) or the drafts procedure below. |
| Grievances: TPA beneficiary sections | English wording of the HITPA, Medi Assist and VIDAL HEALTH sections is the wording of the live site (seed file `nhis-api/src/data/pages.json` and the Admin form action). | **No for the live server**: it already holds that text in its database. A copy of the database made before that text was entered may show older sections: see "Reconciling older content". |
| Grievances: nodal officer and escalation tables | "Nodal Officer for NHIS 2026 Implementation", "Escalation Matrix 1" and "Escalation Matrix 2" are rendered from the Client itself, exactly as on the live site, so they appear without any database content. When an administrator adds them to the page (**Website pages > Grievances > Add supplied officer tables**) and publishes, the built-in copy is hidden and the stored copy is shown instead; they never appear twice. | No. |

Pulling source or deploying the release never seeds, overwrites or migrates database content. The page body of Grievances is database content; the release does not replace a published page.

**Two slips that are on the live page are kept as published** (the request was to match the live site exactly). Correct them in Admin when you want to: the HITPA paragraph reads "...Please mail to tnnhisgrievance" immediately followed by the link `tnnhisgrievance@hitpa.co.in` (so it reads "tnnhisgrievancetnnhisgrievance@hitpa.co.in"), and the VIDAL HEALTH paragraph has no space between its link and "and" ("...vidalhealth.comand ..."). Edit them under **Website pages > Grievances**, save, preview and publish.

**Preparing the 14 project office officials as drafts instead of SQL (only when missing).** Take a database backup first. From `nhis-api` with the intended environment configured:

```powershell
node --import tsx src/cli/prepare-upstream-content.ts
```

This is a read-only plan. With explicit operator authorization, an active ADMIN actor ID and the exact database name confirmed:

```powershell
node --import tsx src/cli/prepare-upstream-content.ts --apply --confirm-database DATABASE_NAME --actor-id ADMIN_ID
```

The transaction preserves all existing contacts and page sections, appends only absent upstream sections to the current page draft, creates only missing contact records as drafts, never publishes or deletes anything, uses the existing validation, lifecycle and audit services, and is idempotent. Review and publish the resulting drafts in Admin. Never use a full reseed to pick up source changes. The three schema migrations are unchanged by this part of the release.

**Reconciling older content (optional).** In **Website pages > Grievances**, review the saved draft. **Use current English grievance contacts** loads the HITPA, Medi Assist and VIDAL HEALTH sections into the form (it replaces only those known English sections and preserves custom sections and all Tamil text). **Add supplied officer tables** adds the three tables to the page text. Both buttons only change the form: save a draft, preview while signed in, then publish with the existing roles. Tamil wording of the beneficiary sections is the existing Tamil text; the live site has not changed it either, and a Tamil reader should review it.

**Rollback compatibility.** After a page containing the new table blocks is published, an older Client/Admin release cannot render or edit those blocks. Keep an export of the affected page, restore the compatible earlier page revision before downgrading, or keep this release. No extra schema migration exists for table blocks. This is in addition to the `VIDEO` enum caveat in section 8.

Sidebar terminology: **Website pages** are page bodies and tables; **Website content** is header, menu, homepage, footer and manual; **Staff accounts**, **Change history** and **Import Excel** have explicit names. Roles and URLs are unchanged.

## 13. Live domain layout (public site on www.tn-nhis.net, Admin and API on claims.tn-nhis.net)

Observed on 19 October 2026 with read-only requests: the public Client is served from the **root** of `https://www.tn-nhis.net/` and was built against `https://claims.tn-nhis.net/TNNHISApi/api/v1`; the Admin is `https://claims.tn-nhis.net/TNNHISAdmin/` and the API `https://claims.tn-nhis.net/TNNHISApi/`; there is **no** `/TNNHIS/` application on the claims host; and the live API still answers 404 for `/api/v1/site-content` (this release is not deployed yet). The committed `.env.production` files describe the single-host sub-path layout of `docs/IIS-DEPLOYMENT.md` (`/TNNHIS/`), so the **public Client for www.tn-nhis.net must be built with its own settings**. Vite takes the variables from the PowerShell session before the `.env` file:

```powershell
# Public Client for the root of www.tn-nhis.net (copy nhis-client\dist\* to that site's folder, keep its web.config from dist)
$env:VITE_BASE_PATH = '/'
$env:VITE_API_BASE_URL = 'https://claims.tn-nhis.net/TNNHISApi/api/v1'
npm run build -w nhis-client
Remove-Item Env:VITE_BASE_PATH, Env:VITE_API_BASE_URL

# Admin for https://claims.tn-nhis.net/TNNHISAdmin/ (committed settings are right: base /TNNHISAdmin/, API /TNNHISApi/api/v1)
npm run build -w nhis-admin
```

Run these in **PowerShell**. In Git Bash a lone `/` is rewritten to `C:/Program Files/Git/` and the build contains broken asset paths; check that `dist\index.html` references `/assets/`. `scripts\package-deployment.ps1` builds the sub-path layout and refuses a Client without the `/TNNHIS/` base, so for www use the commands above and copy the folder yourself; Backend (API), `ApiProxy`, `Service` and the migrations follow sections 3 to 6 unchanged. `.env` on the API server needs `ADMIN_ALLOWED_ORIGINS=https://claims.tn-nhis.net` and `PUBLIC_API_ALLOWED_ORIGINS=https://www.tn-nhis.net` (both should already be set for the current site; confirm after the restart: `curl -i -H "Origin: https://www.tn-nhis.net" https://claims.tn-nhis.net/TNNHISApi/api/v1/site-content` must show `Access-Control-Allow-Origin: https://www.tn-nhis.net`).

**"Preview on website" needs the Client on the same origin as the API.** The preview reads drafts through the admin API with the administrator's session cookie, and the admin API deliberately sends no CORS headers (unchanged security design). A Client on `www.tn-nhis.net` therefore cannot read drafts: it shows the published site and the "sign in" banner. To get working previews, additionally deploy the **sub-path Client** (the default build: `npm run build -w nhis-client` without the two variables) as an IIS application `TNNHIS` on the claims site, next to `TNNHISAdmin` and `TNNHISApi`. The Admin's default `VITE_CLIENT_URL=/TNNHIS/` then opens `https://claims.tn-nhis.net/TNNHIS/?preview=1`, which is same-origin with the API. This copy shows the same published content as www. If you prefer not to run it, build the Admin with `$env:VITE_CLIENT_URL='https://www.tn-nhis.net/'` (the preview button then opens the public site, where drafts stay invisible); drafts can still be checked by publishing in a quiet moment or on a staging copy. Saving, publishing, uploads and everything else in the Admin work in either case. Do not enable CORS on the admin API to work around this without a security review.
