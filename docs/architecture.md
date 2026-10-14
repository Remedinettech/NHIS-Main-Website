# Architecture

The two Vite apps are independently deployed frontends. Both call `/api/v1` through a same-origin reverse proxy. The Next.js application is the API service; there is no Next.js admin UI in this version, following the user's separate client/admin/API layout.

Route handlers should validate requests, authorize operations, call domain services and map errors. Business rules live in `nhis-api/src/modules/`; server database access lives in `src/config/database.ts` and future repositories. The shared package contains only public types, never Prisma clients or secrets.

Current data path: captured JSON → hospitals.service → GET route → frontend service → hospital directory.
Target data path: PostgreSQL published revision → repository → service → GET route → frontend. Admin writes must validate authenticated roles, create drafts, audit changes, and publish atomically. Retain published versions while drafts change. The initial schema is a foundation; revision publishing and gallery records need further domain design/migrations.

Keep existing beneficiary, insurer, hospital and claims applications separate. No authentication or data migration of those systems is performed here.

References consulted: https://nextjs.org/docs/app/getting-started/route-handlers ; https://nextjs.org/docs/app/guides/authentication ; https://vite.dev/guide/ .
