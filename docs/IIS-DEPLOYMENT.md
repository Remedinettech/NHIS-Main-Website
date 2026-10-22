# TN-NHIS – IIS deployment (Windows Server 3.109.241.251)

Status of this guide: the package, configuration files and builds were prepared and tested on a developer machine
(see "What was and was not verified"). **Nothing has been run on the real IIS server yet.** Follow "Verification" after
each step on the server.

## 1. Target layout

```
J:\TN_NHIS_WEBSITE\
  Client\      IIS app  /TNNHIS       (static site + web.config)
  Admin\       IIS app  /TNNHISAdmin  (static site + web.config)
  ApiProxy\    IIS app  /TNNHISApi    (web.config only; reverse proxy to Next.js)
  Backend\     backend workspace (source, node_modules, .next build, .env)  – NOT an IIS application
  Uploads\     persistent uploaded documents/images – NOT an IIS application, never inside a release folder
  Logs\        service logs
  Service\     WinSW wrapper + XML
```

All three applications live under **Default Web Site**. Do not touch other applications on the server (NHIS,
NHIS_POSTGRE, TNUI, …). Next.js listens only on `127.0.0.1:3001`; do not open that port in the firewall.

| Browser URL | Served by |
|---|---|
| `https://3.109.241.251/TNNHIS/` | Client |
| `https://3.109.241.251/TNNHISAdmin/` | Admin |
| `https://3.109.241.251/TNNHISApi/api/v1/...` | ApiProxy → `http://127.0.0.1:3001/api/v1/...` (only `/TNNHISApi` is removed) |

## 2. Prerequisites (verify on the server)

1. **IIS** with Static Content, Default Document, Request Filtering.
2. **URL Rewrite** module 2.1 and **Application Request Routing (ARR) 3.0**. In IIS Manager → server node →
   *Application Request Routing Cache* → *Server Proxy Settings* → tick **Enable proxy** → Apply. (This is a
   server-wide setting; check with the server owner that it does not affect other applications. Leaving *Reverse rewrite
   host in response headers* ticked is fine.)
3. **Node.js ≥ 22.12 (x64 LTS)** installed for all users (`node -v`; path usually `C:\Program Files\nodejs\node.exe`).
4. **HTTPS binding + certificate on Default Web Site** (port 443). **Admin sign-in will not work over plain HTTP**: the
   session cookie is `Secure`, so the browser discards it on HTTP. Do not weaken this. Bind a certificate valid for the
   address users type (for an IP address a certificate with that IP as SAN, or an internal CA trusted by the users'
   browsers; a self-signed certificate must be trusted on each client). If the public URL will later be a host name, update
   `ADMIN_ALLOWED_ORIGINS` (below).
5. **WebDAV Publishing** may be installed; the ApiProxy web.config removes the module for that application only. No server
   change needed.
6. Network: the server must reach the hosted PostgreSQL (`<DB_HOST>:5432`); the DBA must allow the server's address.
7. **Database**: restored by the DBA from the supplied SQL (this package never creates/resets/migrates the database).
   Needed role: the application role with data access to `tn_nhis_website`.
8. Service wrapper: **WinSW v2.12.0 `WinSW-x64.exe`** from
   `https://github.com/winsw/winsw/releases/tag/v2.12.0` (download it on a machine where downloads are permitted; it is
   not bundled in this package). Record its SHA256 when you download it.

## 3. Build the package (developer machine)

```powershell
cd D:\Chandaan\PROJECTS_NEW\TN_PROJECTS\TN-NHIS_WEBSITE
powershell -ExecutionPolicy Bypass -File scripts\package-deployment.ps1
```

Output: `deploy-package\TN_NHIS_WEBSITE\` and `deploy-package\TN_NHIS_WEBSITE_<date>.zip` (+ `.sha256`). The script runs
typecheck and both production builds (base paths `/TNNHIS/`, `/TNNHISAdmin/`, API `/TNNHISApi/api/v1` come from the
committed `nhis-*/.env.production`), refuses to continue if a build does not use its sub-path, and scans the package
for `.env*`, `.local-*`, `.sql`/dumps, keys and connection strings containing passwords. The ZIP contains no
passwords, no database dump, no uploads and no local admin credentials.

## 4. Copy to the server

Create the folders once: `J:\TN_NHIS_WEBSITE\{Client,Admin,ApiProxy,Backend,Uploads,Logs,Service}`. Extract the ZIP to a
temporary folder (e.g. `J:\TN_NHIS_WEBSITE\_incoming`), compare the SHA256 with the `.sha256` file, then copy:

| ZIP folder | Destination |
|---|---|
| `Client\*` | `J:\TN_NHIS_WEBSITE\Client\` |
| `Admin\*` | `J:\TN_NHIS_WEBSITE\Admin\` |
| `ApiProxy\web.config` | `J:\TN_NHIS_WEBSITE\ApiProxy\web.config` |
| `Backend\*` | `J:\TN_NHIS_WEBSITE\Backend\` |
| `Service\tnnhis-api.xml` | `J:\TN_NHIS_WEBSITE\Service\tnnhis-api.xml` |
| `Config\nhis-api.env.template` | read it, create `J:\TN_NHIS_WEBSITE\Backend\nhis-api\.env` (section 6) |
| `MigrationReview\*` | reviewed SQL for the DBA (preflight, verification, grants, emergency rollback); keep it outside the web folders, never run it automatically |

For Client and Admin (static folders) use `robocopy <src> <dest> /MIR` so removed files disappear; **never** `/MIR`
into `Backend`, `Uploads` or `Logs`.

## 5. IIS applications

IIS Manager → Sites → Default Web Site → *Add Application* (three times). Use an application pool per application
(*No Managed Code*, Integrated pipeline) or an existing dedicated pool; do not reuse pools of other applications.

| Alias | Physical path |
|---|---|
| `TNNHIS` | `J:\TN_NHIS_WEBSITE\Client` |
| `TNNHISAdmin` | `J:\TN_NHIS_WEBSITE\Admin` |
| `TNNHISApi` | `J:\TN_NHIS_WEBSITE\ApiProxy` |

Or from an elevated PowerShell (`Import-Module WebAdministration`):

```powershell
foreach ($a in @(@('TNNHIS','Client'),@('TNNHISAdmin','Admin'),@('TNNHISApi','ApiProxy'))) {
  New-WebAppPool -Name $a[0]; Set-ItemProperty "IIS:\AppPools\$($a[0])" managedRuntimeVersion ''
  New-WebApplication -Site 'Default Web Site' -Name $a[0] -PhysicalPath "J:\TN_NHIS_WEBSITE\$($a[1])" -ApplicationPool $a[0]
}
```

Check beforehand (`Get-WebApplication`) that none of these aliases already exists.

## 6. Backend: configuration, install, build

Create `J:\TN_NHIS_WEBSITE\Backend\nhis-api\.env` from `Config\nhis-api.env.template`, replacing the `<…>`
placeholders (DB host and the application-role password supplied by the DBA through a secure channel). Variables:

| Variable | Value / purpose |
|---|---|
| `DATABASE_URL` | application-role connection string (runtime). Percent-encode special characters in the password. |
| `DIRECT_URL` | owner role; **leave out** unless the DBA-approved migration is run |
| `FILE_STORAGE_DRIVER` / `FILE_STORAGE_DIR` | `local` / `J:\TN_NHIS_WEBSITE\Uploads` |
| `UPLOAD_MAX_DOCUMENT_BYTES`, `UPLOAD_MAX_IMAGE_BYTES` | 26214400 / 5242880 |
| `ADMIN_ALLOWED_ORIGINS` | `https://3.109.241.251` (exact browser origin(s), comma-separated, HTTPS, no path) |
| `ADMIN_COOKIE_NAME` | `tnnhis_admin_session` |
| `ADMIN_COOKIE_PATH` | `/TNNHISApi` (must cover the external API path; the cookie is `HttpOnly; Secure; SameSite=Lax`) |
| `ADMIN_COOKIE_SAMESITE` | `lax` |
| `ADMIN_TRUSTED_PROXY_HOPS` | `1` (IIS ARR). Client IP for rate limiting is taken from the right-hand end of `X-Forwarded-For`. |
| `ADMIN_SESSION_IDLE_MINUTES`, `ADMIN_SESSION_ABSOLUTE_HOURS`, `ADMIN_LOGIN_*`, `ADMIN_MAX_BODY_BYTES` | optional, defaults apply |
| `ADMIN_IMPORT_SIGNING_KEY` | random secret of at least 32 characters; **required for Excel import** (no default key exists). Optional limits: `ADMIN_IMPORT_MAX_BYTES` (default 2000000), `ADMIN_IMPORT_MAX_ROWS` (default 500). |
| `UPLOAD_MAX_VIDEO_BYTES` | optional, default 26214400 (25 MB, the maximum): uploaded MP4 videos of the User Manual page |
| `PUBLIC_API_ALLOWED_ORIGINS` | CORS allowlist for the public read API, e.g. `https://www.tn-nhis.net` (comma-separated exact origins, no wildcard). Added by Next.js only; never add `Access-Control-*` headers in IIS. Restart the service after changing it. |

`NODE_ENV=production` is set by the service definition (and `next build/start` set it themselves); this makes the
cookie `Secure` – do not override. The `.env` file is server-only: it is not in the ZIP and must never be copied into
Client/Admin/ApiProxy or to a `VITE_*` variable.

**Why the standard `next start` and not the standalone output:** the backend uses native modules (argon2, Prisma
engine) and Prisma migrations/maintenance commands from the same folder; a regular `npm ci` + `next build` +
`next start` on the target keeps the Windows binaries consistent and keeps `db:status`, `storage:check`,
`admin:reset-password` available. Standalone output would need extra tracing configuration and has not been tested here.

Install and build (PowerShell on the server, in `J:\TN_NHIS_WEBSITE\Backend`):

```powershell
cd J:\TN_NHIS_WEBSITE\Backend
npm ci -w nhis-api                       # installs exactly the locked versions for the backend workspace
npx prisma generate --schema nhis-api\prisma\schema.prisma
npm run build -w nhis-api
npm run db:status -w nhis-api            # READ-ONLY: reports whether the restored database matches the migrations
```

`db:status` only reports. If it reports pending or mismatching migrations, **stop and report it to the DBA/developer**.
For the content-management release exactly three pending migrations are expected (`20261015100000_site_content_cms`,
`20261015110000_content_import`, `20261015120000_manual_video`): follow `docs/DEPLOYMENT-SITE-CONTENT.md` section 3 (review, backup,
apply, verify). Anything else pending or mismatching is still a stop.
Do not run `db:migrate`, `db:import`, `db:seed` or any reset on this server unless a DBA-approved change says so.

## 7. Uploads (persistent files)

The SQL restore recreates database rows only; **uploaded files are separate** and the database stores their random
storage keys (file names). Copy the files unchanged, keeping every file name:

1. On the source machine the files are in `nhis-api\storage\` (24 files, about 19.5 MB at hand-over). Zip that folder
   (outside the deployment ZIP) and transfer it with the database dump so both come from the same moment.
2. On the server:

```powershell
robocopy <extracted>\storage J:\TN_NHIS_WEBSITE\Uploads /E /COPY:DAT /R:1 /W:1
cd J:\TN_NHIS_WEBSITE\Backend
npm run storage:check -w nhis-api       # read-only: every media row has its file with the same size/SHA-256; lists extras
```

Never `/MIR` or `/PURGE` into Uploads. Back up `Uploads` together with the database; it is part of every backup. Updates
of the application never touch this folder.

## 8. Permissions

| Folder | Grant |
|---|---|
| `Client`, `Admin`, `ApiProxy` | Read & execute to `IIS AppPool\<its pool>` (and `IIS_IUSRS`) |
| `Backend` | Read & execute to the service account; Modify on `Backend\nhis-api\.next` is not needed at run time |
| `Backend\nhis-api\.env` | Read for the service account and Administrators only; remove inheritance and `Users`/`IIS_IUSRS` |
| `Uploads` | **Modify** to the service account only (IIS pools do not read it; the API does) |
| `Logs` | Modify to the service account |

Use a dedicated low-privilege local account (e.g. `svc_tnnhis_api`, “Log on as a service”) or *Local Service*; avoid
LocalSystem. Example:

```powershell
icacls J:\TN_NHIS_WEBSITE\Uploads /grant "svc_tnnhis_api:(OI)(CI)M"
icacls J:\TN_NHIS_WEBSITE\Logs    /grant "svc_tnnhis_api:(OI)(CI)M"
icacls J:\TN_NHIS_WEBSITE\Backend /grant "svc_tnnhis_api:(OI)(CI)RX"
icacls J:\TN_NHIS_WEBSITE\Backend\nhis-api\.env /inheritance:r /grant "svc_tnnhis_api:R" /grant "Administrators:F"
```

## 9. Windows service (WinSW 2.12.0)

Node.js cannot be registered with `sc.exe` directly (it does not speak the service protocol); WinSW runs `node.exe`
as a child and handles start/stop/restart/logging.

```powershell
copy <downloaded>\WinSW-x64.exe J:\TN_NHIS_WEBSITE\Service\tnnhis-api.exe
# tnnhis-api.xml is already in Service\ (edit <executable> if where.exe node says another path)
cd J:\TN_NHIS_WEBSITE\Service
.\tnnhis-api.exe install  /username .\svc_tnnhis_api /password <service-account-password>   # or omit for the default account
.\tnnhis-api.exe start
.\tnnhis-api.exe status
```

Manage: `.\tnnhis-api.exe stop | restart | status | uninstall`. Logs: `J:\TN_NHIS_WEBSITE\Logs\tnnhis-api.out.log`,
`.err.log`, `.wrapper.log` (rolled at 10 MB, 10 kept):

```powershell
Get-Content J:\TN_NHIS_WEBSITE\Logs\tnnhis-api.err.log -Tail 50 -Wait
```

Service definition: `Service\tnnhis-api.xml` – runs `node ...\next start -H 127.0.0.1 -p 3001` in
`Backend\nhis-api`, `NODE_ENV=production`, automatic delayed start, restart on failure. Database and admin settings come
from `.env`; no secret is in the XML.

## 10. Verification (on the server, in this order)

For the content-management release also run the checks of `docs/DEPLOYMENT-SITE-CONTENT.md` section 7 (menu, User Manual page and video seeking, draft/preview/publish, uploads, cookie, import).

1. Service: `.\tnnhis-api.exe status` = Started; `netstat -ano | findstr 3001` shows only `127.0.0.1:3001`.
2. Direct API: `Invoke-RestMethod http://127.0.0.1:3001/api/v1/health` (or `/api/v1/hospitals?limit=1`) returns JSON.
   (A health route returns database status; a 5xx here means `.env`/database access.)
3. Through IIS: `https://3.109.241.251/TNNHISApi/api/v1/hospitals?limit=1` returns the same JSON. 404 with an IIS error
   page = ApiProxy application/web.config not active; 502/500.50 = ARR proxy not enabled or service not running.
4. `https://3.109.241.251/TNNHIS/` loads; open a deep link (e.g. `/TNNHIS/hospitals`) directly and refresh – it must
   render, not 404; logo, fonts, images load from `/TNNHIS/assets/...`; a document download from the Forms page opens
   the PDF via `/TNNHISApi/api/v1/files/...`.
5. `https://3.109.241.251/TNNHISAdmin/` loads; deep-link refresh works.
6. Admin sign-in over **HTTPS**: browser dev tools → Application → Cookies shows `tnnhis_admin_session`, `Path=/TNNHISApi`,
   `HttpOnly`, `Secure`, `SameSite=Lax`. Create a draft, upload a small file, publish, check it on the public site, sign out
   (cookie removed, next admin request returns 401). `storage:check` should still pass afterwards plus the new file.
7. Wrong password 5+ times from one address returns 429 (confirms the proxy-forwarded client IP is used).
   Over plain HTTP the admin login is expected to fail to keep a session – that is intended.

## 11. Updating a release

1. Build a new ZIP (section 3). 2. Copy `Client`/`Admin` with `robocopy /MIR` (keep `web.config`, it is in the folder).
3. Stop the service: `.\tnnhis-api.exe stop`. 4. Replace `Backend` **except** `nhis-api\.env` (e.g.
`robocopy ...\Backend J:\TN_NHIS_WEBSITE\Backend /E /XF .env`), then `npm ci -w nhis-api`, `npx prisma generate …`,
`npm run build -w nhis-api`, `npm run db:status -w nhis-api`. 5. `.\tnnhis-api.exe start`, run section 10. Schema changes
are delivered as separate DBA-approved migrations; nothing here applies them automatically.

## 12. Rollback

Before each update keep the previous folders: `robocopy J:\TN_NHIS_WEBSITE\Client J:\TN_NHIS_WEBSITE\_rollback\<date>\Client /E`
(same for Admin and `Backend` without `node_modules` if space is tight). To roll back: stop the service, restore the
folders from `_rollback\<date>` (`robocopy … /MIR` for Client/Admin; for Backend restore the files and `npm ci -w nhis-api`
again), start the service, run section 10. Uploads and the database are not rolled back by this; a database rollback
is a DBA restore and must be matched with the Uploads copy from the same time.

## 13. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Direct refresh of `/TNNHIS/x` gives 404 | URL Rewrite not installed, or web.config missing in `Client` |
| `/TNNHISApi/...` 404 (IIS page) | wrong alias/physical path; ApiProxy web.config missing |
| `/TNNHISApi/...` 502.3 / 500.50 | ARR proxy disabled, or service stopped |
| Admin: PUT/DELETE answered 405 | WebDAV handler active in that application (ApiProxy web.config removes it) |
| Admin login returns 200 but next call 401 | page served over HTTP, or `ADMIN_COOKIE_PATH` not `/TNNHISApi` |
| Admin write returns 403 “origin” | `ADMIN_ALLOWED_ORIGINS` does not exactly match the browser URL (scheme/host/port) |
| Upload returns 413 | request above 30 MB (IIS limit) or 25 MB document limit |
| Browser: "No Access-Control-Allow-Origin" on public GETs | origin not in `PUBLIC_API_ALLOWED_ORIGINS` (exact scheme/host/port) or service not restarted; duplicate headers = CORS also configured in IIS (remove it) |
| Files 404 / empty downloads | `Uploads` not copied, wrong `FILE_STORAGE_DIR`; run `storage:check` |

## What was and was not verified (developer machine)

Verified locally: typecheck, unit/integration tests (including admin cookie configuration), production builds of Client and
Admin with the sub-path bases, behaviour of both sites under `/TNNHIS/` and `/TNNHISAdmin/` (deep links, assets, document
downloads, admin sign-in/upload/sign-out with cookie `Path=/TNNHISApi`) using a local stand-in server
(`deploy/tools/simulate-iis.mjs`, development repository only) in front of a production-mode API, and `storage:check` against the local uploads.

**Not verified (needs the real server):** IIS web.config processing, URL Rewrite/ARR proxying, the WebDAV removal,
HTTPS binding/certificate and Secure cookies on the real host, the WinSW service, Windows ACLs, access to the hosted
database from the server, and the hosted database schema (`db:status`).
