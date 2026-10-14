# TN NHIS starter workspace

Three separate applications following the supplied Usha folder organization:

| Folder | Stack | Local URL |
|---|---|---|
| nhis-client | React + Vite + TypeScript | http://127.0.0.1:5173 |
| nhis-admin | React + Vite + TypeScript | http://127.0.0.1:5174 |
| nhis-api | Next.js Route Handlers + TypeScript | http://127.0.0.1:3001 |
| packages/shared-types | Browser-safe API contracts | Shared package |

Next.js is used for the API as requested. The Usha example uses NestJS; therefore this project uses `src/app/api/**/route.ts` instead of Nest controllers, `app.module.ts`, `main.ts`, or `nest-cli.json`. Domain services remain organized in `src/modules/`.

## Start here

Install Node.js 22.12+ (Node 22 LTS recommended), then open a terminal in this TN-NHIS folder:

```sh
npm ci
npm run dev
```

No database or environment file is needed to preview the captured public hospital directory. Both Vite development servers proxy `/api` to Next.js. If changing a port, update the frontend `API_PROXY_TARGET` in its `.env.local`.

## Implemented now

- Three separate workspace applications, root scripts and shared TypeScript contracts.
- Public homepage starter with source English/Tamil title and benefit wording.
- Hospital directory on client and admin preview, backed by the Next.js API.
- Literal text search, Tamil search, whitespace normalization, district filter and pagination over all 1,221 source records.
- API health, snapshot counts and hospital detail endpoints.
- Admin dashboard and navigation; all other modules have explicit scaffold status.
- PostgreSQL Prisma schema, non-destructive hospital draft seed, source reference package and CI workflows.

## Deliberately unfinished

This is a project starter, not the completed NHIS website or a production CMS. Admin login, roles enforcement, content editing/publishing, document uploads, contact CRUD, and most public content routes still need implementation. The admin preview only reads the public snapshot API. It has no login bypass, privileged data or functional write controls. No admin account or default password has been created.

APIs currently read `nhis-api/src/data/hospitals.json`; they do not automatically switch to PostgreSQL after seeding. Implement the repository layer and published-content filtering as described in docs/implementation-plan.md. The snapshot includes legacy source data issues and must be reviewed before launch.

## Database setup (second milestone)

Create an isolated PostgreSQL database named `nhis_website`. Copy `nhis-api/.env.example` to `nhis-api/.env` and set your own connection details. Do not use the operational claims database.

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
```

The migrate command creates a development migration for review; it does not ship an already-applied migration. The seed inserts hospitals as DRAFT, skips duplicate records, and never overwrites existing edits. Prisma 6.19.3 is pinned with its matching client; upgrading to Prisma 7 requires a deliberate config/adapter migration.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

Read docs/verification.md for checks actually performed in the delivered package. Build output and dependencies are excluded from the ZIP.

## Reference files

The complete provided content handoff is under `reference/nhis-handoff`. It contains the source audit, English/Tamil content, five source workbooks, 22 PDF downloads and original image files. Downloaded HTML/JavaScript is reference evidence only, not executable application code. Four scanned PDFs have no extracted text. Existing patient/claims records and authenticated workflows are outside this starter.

Start your implementation with docs/implementation-plan.md. Folder paths are listed in docs/folder-structure.md.

## Current state

- **nhis-client**: public information site (home, hospitals, policies, coverage, eligibility, enrollment, forms, government orders, contacts, grievances; gallery appears once an image is published), English/Tamil. All content comes from nhis-api, which reads PostgreSQL.
- **nhis-api**: Next.js route handlers. Public read API (`/api/v1/*`, published content only, `no-cache` + ETag so a publish shows immediately) and a cookie-authenticated admin API (`/api/v1/admin/*`). Details: docs/admin-backend-design.md and docs/api-endpoints.md.
- **nhis-admin**: real sign-in (HttpOnly server session, CSRF), role-based screens (Administrator, Publisher, Editor) to create, edit, publish, unpublish, archive and restore hospitals, pages, documents, contacts, announcements and gallery images, edit settings, manage users and view activity.
- Draft edits to published content stay private until Publish. Uploaded files are private until a published record uses them.
- Technical notes, source discrepancies and outstanding work: docs/CONTENT_REVIEW.md, docs/verification.md.

## Run it locally

1. PostgreSQL with a database and two roles (owner for migrations, app for runtime; see docs/admin-backend-design.md). Copy `nhis-api/.env.example` to `nhis-api/.env` and fill `DATABASE_URL` (app role) and `DIRECT_URL` (owner role). Never commit it; never put these in `VITE_*`.
2. `npm ci`
3. `npm run db:migrate -w nhis-api` (applies migrations non-destructively)
4. `npm run db:import -w nhis-api` (repeatable; never duplicates and never overwrites admin edits)
5. First administrator: `npm run admin:bootstrap -w nhis-api` (prompts for email and password with hidden input, or reads ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD; refuses if an administrator already exists). Forgotten password: `npm run admin:reset-password -w nhis-api`.
6. `npm run dev` (API :3001, client :5173, admin :5174)

Tests: `npm test` (API tests use their own PostgreSQL schema and need DIRECT_URL). Build: `npm run build`.
