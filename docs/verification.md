# Verification

Checked 12 October 2026, Node 22.23 / npm 10.9 on Windows. CI workflows exist but were not run here.

## Automated (all passing)

- `npm run typecheck`: strict TypeScript in client, admin, API and shared types.
- `npm test`: client 37 (contrast of every token pair actually used, locale resource integrity and placeholder parity, search/pagination/link helpers), admin 8, API 65 (counts, fidelity, routes, authorization-denies-by-default, document file hashes).
- `npm run build`: Vite builds for client and admin, Next.js build for the API.

## Browser checks (client, Browser pane at 360px and desktop)

- No horizontal page overflow on all 15 routes in English and Tamil at 360px (one Tamil badge overflow found and fixed; the contact-tab strip scrolls inside its own container).
- Hospital search: Tamil text, double-space normalised phrase (`arun   medical`), `[` literal, empty result state, district filter, pagination, language switch keeping URL/filter/results, language persisted in `nhis.locale`, document `lang` set.
- Government orders 7 + 8 with the one unavailable entry shown; four contact tabs with 44/39/50/39 rows; grievances `mailto:` links; gallery empty state; PDFs served as `application/pdf`.
- Login menu and Scheme submenu: `aria-expanded`, Escape closes and returns focus.
- Admin: 14 routes at 360/768/1280 without overflow (agent-run DOM measurement).

## Second pass (premium design, demo login, wordmark)

- typecheck, builds clean; tests: client 39, admin 15, API 65 passing.
- Client at 360/768/1280px, English and Tamil: no page overflow on all routes; computed fonts confirmed (Manrope wordmark, Noto Sans Tamil for Tamil headings/body, Inter body); only the weights used are loaded.
- Copy sweep of every public route in both languages (visible text, titles, aria-labels, alt text): no development/source/snapshot/review wording; Gallery nav hidden and /gallery redirects home while empty.
- Admin (agent-run, spot-checked): signed-out redirect to /login, invalid credentials error, valid login, refresh keeps session (only `nhis-admin.demo-session=1` in sessionStorage), sign-out, protected-route redirect, demo-disabled page without form or sidebar, no overflow at 360/768/1280.

## Third pass (PostgreSQL, real authentication, working admin)

Isolated database objects: schema `nhis_test_admin` for the automated suite and `nhis_e2e` for browser checks, both inside tn_nhis_website, created and dropped by the owner role. The live `public` schema only received the migration, the import and the initial administrator.

- API (39 tests, real PostgreSQL): wrong password, missing/invalid CSRF, bad Origin, rate limiting, logout invalidating the session, the old browser demo marker rejected; hospitals create/edit/publish/archive/restore/delete rules, 409 on stale versions, field-level validation; draft edits invisible publicly until Publish; pages draft/preview/publish with Tamil intact; documents with upload validation (type, magic bytes, size, path traversal), private draft files, file replacement, protected admin download; contacts, announcements, gallery, settings (conflicts, role limits), users (last administrator, deactivation ends sessions), audit entries; import repeatability keeping admin edits; DB-down error path with no JSON fallback.
- Live import into the real database: 1,221 hospitals, 172 contacts, 23 documents (22 files), 8 pages, 2 announcements, 3 settings; verified equal to the snapshot byte for byte (Tamil included); second run duplicates nothing.
- Real sign-in against the real API with the bootstrap administrator (HTTP 200), wrong password 401, mutation without CSRF 403, logout then session unauthenticated.
- Browser (admin on a throw-away API instance): invalid and valid sign-in; session survives reload; sign-out then protected route redirects to /login; Editor/Publisher/Administrator navigation differences; create hospital draft -> publish -> edit as draft -> publish, each checked against the public API; PDF upload (bad file rejected, valid accepted) -> publish -> public download 200; announcement and settings publish reflected in /site; page edit -> save -> publish reflected publicly; unsaved-changes dialog; user creation with password policy errors; all admin routes render without error or horizontal overflow.
- Records and Tamil text persisted across an API restart.

## Not verified

Screen-reader and real touch-device testing; screenshots of the new admin screens (the browser pane could not draw while minimized, checks were DOM based); a production deployment with HTTPS (Secure cookies, proxy headers); a second editor editing the same record in two browsers at once (covered by API tests only); S3/Azure storage adapters (interface only); Tamil rendering on a physical phone; API-down error states in the browser (messages and retry exist and are typed, not exercised end to end); production hosting rewrites for deep links (`vite preview` handles them; the real host needs an SPA fallback that does not swallow `/api` or `/documents`); CI runs.

## npm audit

`npm audit` reports 3 high findings, all one chain: `deepmerge-ts` 7.1.5 (stack exhaustion on recursive objects) <- `@prisma/config` <- `prisma` CLI 6.19.3. Investigation: it is only reachable through the Prisma CLI config loader (a dev tool, not the API runtime, no untrusted input), the offered `--force` fix is a downgrade to prisma 6.12.0, and the fixed Prisma line (8.x) is release-candidate only. No change was made. Revisit when the database engine is chosen; if Prisma is dropped (SQL Server option) the finding disappears. `parse5` was added as a root devDependency for the snapshot script only.
