# TN-NHIS website

Public information site for the Tamil Nadu New Health Insurance Scheme, its administration site and the API behind both.

| Folder | Stack | Local URL | IIS application |
|---|---|---|---|
| nhis-client | React + Vite + TypeScript | http://127.0.0.1:5173 | `/TNNHIS/` |
| nhis-admin | React + Vite + TypeScript | http://127.0.0.1:5174 | `/TNNHISAdmin/` |
| nhis-api | Next.js route handlers + Prisma + PostgreSQL | http://127.0.0.1:3001 | `/TNNHISApi/` (reverse proxy) |
| packages/shared-types | Types, built-in content, shared validator | (library) | |

The API is Next.js (`src/app/api/**/route.ts`); domain services live in `nhis-api/src/modules/`. Both Vite apps proxy `/api` to the API in development.

## What the Admin manages

All editorial content of the public site is edited in the Admin with draft, preview and publish (editors save drafts; publishers publish):

- **Site content**: header (logos, portrait, titles, helplines, login menu), main menu, homepage, partners, footer, page text and the **User Manual** page (manual PDF and videos: built-in files, uploaded MP4 or YouTube / Google Drive / web links).
- **Pages** (policy, coverage, eligibility, enrolment, forms, grievances, gallery) with text, pictures and document links; **Hospitals, Documents, Contacts, Announcements, Gallery**; **Excel import** of hospitals, contacts, documents, announcements and partners (drafts only).
- Users, activity (audit log).

Design and contract: `docs/site-content-management.md`. Until a document is published the public site shows the built-in content shipped with the code, so a fresh deployment looks exactly as before.

## Run it locally

Node.js 22.12 or newer. A PostgreSQL database with two roles is needed for the API: an owner role for migrations (`DIRECT_URL`) and a data-only runtime role (`DATABASE_URL`). Copy `nhis-api/.env.example` to `nhis-api/.env` and fill it in; never commit it and never put these values in `VITE_*` variables.

```sh
npm ci
npm run db:generate                    # Prisma client (no database access)
npm run db:migrate -w nhis-api         # applies pending migrations to the database named in the env (never run automatically)
npm run admin:bootstrap -w nhis-api    # first administrator (hidden password prompt); refuses if one exists
npm run dev                            # API :3001, client :5173, admin :5174
```

Do NOT run `db:import` / `db:seed` against a database that already has content; they exist only to fill a brand-new empty database from the shipped snapshot.

## Checks

```sh
npm run typecheck
npm test                               # API tests need a disposable database (its name must contain "disposable")
npm run build
```

## Deployment

IIS layout, service, backups, migrations and rollback are described in `docs/IIS-DEPLOYMENT.md` (base layout) and `docs/DEPLOYMENT-SITE-CONTENT.md` (this content-management release: migrations, new settings, verification). The migration review pack is in `deploy/db/review/`. The clean source package is built by `node scripts/package-source-handoff.mjs`; the IIS release folders by `scripts/package-deployment.ps1`.
