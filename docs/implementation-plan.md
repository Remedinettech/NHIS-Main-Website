# Implementation order

1. Run all three starter applications and inspect the hospital directory in both interfaces. Review reference/nhis-handoff/02-AUDIT-AND-ROUTES.md.
2. Create an isolated database, generate Prisma client, migrate and seed hospital drafts. Inspect imported fields and source issues.
3. Choose an authentication provider/library. Implement admin session validation, disabled-user checks, role authorization, logout, expiration, rate limits and CSRF protection. No public self-registration for admin roles.
4. Implement hospital repository, draft editing, preview and atomic publication with audit history. Public endpoints must read only approved published revisions. Test unauthorized writes, draft leakage and rollback before enabling forms.
5. Connect the admin hospital edit form and verify edit → preview → publish → public display. Replace snapshot mode explicitly; never fall back to stale JSON silently after a database error.
6. Implement pages and approved English/Tamil resources. Store fixed UI translations in locale files and editable content in the database. The starter interface is not fully localized yet.
7. Import contacts and documents after reviewing source inconsistencies. Implement file upload validation, persistent storage, metadata and publishing. Preserve document variants and original labels.
8. Complete public routes, legacy aliases, announcements, settings and gallery. Avoid inventing missing source content.
9. Add authentication/integration tests, mobile and keyboard review, production routing, backups and deployment checks.

The old reference Claude prompt recommends a combined Next admin/API. This workspace follows the newer explicit requirement: TWO Vite apps and a separate Next.js API. Follow this document for architecture, and the reference package for source content only.
