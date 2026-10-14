# Deployment

Build with npm ci, npm run db:generate and npm run build from the workspace root.

- nhis-client/dist: static public frontend.
- nhis-admin/dist: static admin preview/frontend.
- nhis-api: Node.js Next.js service, launched with npm run start -w nhis-api. Its node_modules and required workspace files must accompany the application; this starter does not configure standalone output.

Use separate public/admin hosts with `/api/` proxied to the Next.js service on each, or use an explicitly configured base path. Both frontend builds currently assume deployment at the host root. Route `/api/` before each SPA fallback. Vite's development proxy is NOT included in static production builds or `vite preview`.

Preserve legacy NHIS login/claim paths separately; never let an SPA fallback swallow `/?Pagename=...` or existing server endpoints. Add and test all legacy aliases during migration.

Use TLS, server-only database secrets, persistent object storage for files, and a production identity provider/session setup. Do not deploy this read-only admin scaffold as a finished management system. Run production database migrations using prisma migrate deploy only after development migrations have been generated, reviewed and committed.

No hosting provider, domain or live application was modified by this delivery.
