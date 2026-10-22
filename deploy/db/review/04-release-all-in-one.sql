-- =====================================================================================================================
-- TN-NHIS content-management release: ALL database changes in ONE reviewed, re-runnable script.
--
-- What it does (and nothing else):
--   1. CREATE TABLE "SiteContent"      (admin-managed site content, draft/publish)          -- created EMPTY
--   2. CREATE TABLE "ContentImport"    (resumable Excel import jobs) + one index            -- created EMPTY
--   3. ALTER TYPE  "AssetKind" ADD VALUE 'VIDEO'  (uploaded MP4 videos; the value can never be removed again)
--   4. GRANT SELECT/INSERT/UPDATE/DELETE on the two new tables to the runtime role (default tn_nhis_app)
-- It is the same SQL as prisma/migrations 20261015100000_site_content_cms, 20261015110000_content_import and
-- 20261015120000_manual_video, made idempotent and guarded. It does NOT drop, delete, update, truncate or seed anything,
-- touches no existing table, column, index or row, and does not write to _prisma_migrations (see "AFTER" below).
--
-- Safety built in (the script stops and changes nothing when any check fails):
--   * must run in the database named below (default tn_nhis_website)           * PostgreSQL 12 or newer
--   * the initial migration 20261012160000_init must be recorded as finished    * no failed/unfinished migration recorded
--   * the tables Page, Contact, MediaAsset and the enums PublicationStatus, AssetKind must exist as expected
--   * if one of the new tables already exists (an earlier attempt, or `prisma migrate deploy` already ran), its columns are
--     compared with the expected ones: identical = nothing to do, different = the script stops
--   * the whole change is one transaction: all of it is applied, or none of it
--
-- BEFORE: take a full backup (pg_dump -Fc) and a copy of the Uploads folder. Run as the role that OWNS the website tables
--         (SELECT tableowner FROM pg_tables WHERE tablename = 'Hospital'; "tn_nhis_owner" on a restored copy of the 13 Oct
--         backup, "chandan" on the live server), with the API stopped or idle. It takes ACCESS EXCLUSIVE locks only for milliseconds (lock_timeout 10 s: it fails safely).
--
-- HOW (pgAdmin): open Query Tool on the database, load this file as UTF-8, run the WHOLE file (F5). The last result set lists
--         the checks; every line must read OK. After any ERROR run ROLLBACK; before trying again.
-- HOW (psql):    psql -h HOST -U <owner role> -d tn_nhis_website -v ON_ERROR_STOP=1 -f 04-release-all-in-one.sql
--
-- AFTER (required, once, from the Backend folder with DIRECT_URL set for this PowerShell session only): tell Prisma that the
--         three migrations are already applied. Never run `prisma migrate deploy` after this script for these three (it would
--         fail with "already exists"), and never record them for a database where this script did not finish.
--             npx prisma migrate resolve --applied 20261015100000_site_content_cms --schema nhis-api\prisma\schema.prisma
--             npx prisma migrate resolve --applied 20261015110000_content_import   --schema nhis-api\prisma\schema.prisma
--             npx prisma migrate resolve --applied 20261015120000_manual_video     --schema nhis-api\prisma\schema.prisma
--         Then `npm run db:status -w nhis-api` must say "Database schema is up to date!".
--         (Alternative without this script: `npm run db:migrate -w nhis-api` applies and records the same three migrations.)
--
-- Rollback: 90-rollback.sql (emergency only). An ordinary rollback is the previous application release; the tables stay.
-- To use another database name or runtime role, change the literals marked CHANGE HERE (and nothing else). The runtime
-- role is the user named in the API's DATABASE_URL; when it is the owner role itself, or has default privileges, the grant
-- below is not needed (the report at the end lists every role that can use the new tables).
-- =====================================================================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Guards (read-only)
-- ---------------------------------------------------------------------------------------------------------------------
DO $guard$
DECLARE
  expected_database constant text := 'tn_nhis_website';   -- CHANGE HERE if the production database has another name
  missing text;
BEGIN
  IF current_database() <> expected_database THEN
    RAISE EXCEPTION 'Wrong database: %. Required: %. No changes made.', current_database(), expected_database;
  END IF;
  IF current_setting('server_version_num')::int < 120000 THEN
    RAISE EXCEPTION 'PostgreSQL 12 or newer is required (found %). No changes made.', current_setting('server_version');
  END IF;
  IF NOT has_schema_privilege(current_user, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Role % cannot create objects in schema public. Connect as the role that owns the website tables. No changes made.', current_user;
  END IF;

  SELECT string_agg(t.name, ', ') INTO missing
  FROM (VALUES ('Page'), ('Contact'), ('MediaAsset'), ('_prisma_migrations')) AS t(name)
  WHERE to_regclass(format('public.%I', t.name)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'This does not look like the TN-NHIS website database: table(s) missing: %. No changes made.', missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."_prisma_migrations" WHERE migration_name = '20261012160000_init' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Migration 20261012160000_init is not recorded as finished. Reconcile the migration history first. No changes made.';
  END IF;
  IF EXISTS (SELECT 1 FROM public."_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'A failed or unfinished migration is recorded in _prisma_migrations. Resolve it first. No changes made.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'PublicationStatus' AND t.typtype = 'e') THEN
    RAISE EXCEPTION 'Enum "PublicationStatus" is missing. No changes made.';
  END IF;
  SELECT string_agg(v.label, ', ') INTO missing
  FROM (VALUES ('DOCUMENT'), ('IMAGE')) AS v(label)
  WHERE NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE n.nspname = 'public' AND t.typname = 'AssetKind' AND e.enumlabel = v.label);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Enum "AssetKind" does not have the expected values (missing: %). No changes made.', missing;
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The changes (all additive; IF NOT EXISTS makes a second run a no-op)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."SiteContent" (
    "id" TEXT NOT NULL,
    "status" public."PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ContentImport" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RUNNING',
    "rows" JSONB NOT NULL,
    "results" JSONB NOT NULL DEFAULT '[]',
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentImport_actorId_createdAt_idx" ON public."ContentImport"("actorId", "createdAt");

-- Allows uploaded MP4 videos. The only change to an existing object: the old values and all rows are unchanged.
ALTER TYPE public."AssetKind" ADD VALUE IF NOT EXISTS 'VIDEO';

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The new tables must have exactly the structure the application expects (also when they already existed)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE TEMP TABLE nhis_expected_columns (tbl text, col text, typ text, not_null boolean, prec integer) ON COMMIT DROP;
INSERT INTO nhis_expected_columns VALUES
  ('SiteContent', 'id', 'text', true, NULL),
  ('SiteContent', 'status', 'PublicationStatus', true, NULL),
  ('SiteContent', 'value', 'jsonb', true, NULL),
  ('SiteContent', 'version', 'int4', true, NULL),
  ('SiteContent', 'draft', 'jsonb', false, NULL),
  ('SiteContent', 'publishedAt', 'timestamp', false, 3),
  ('SiteContent', 'archivedAt', 'timestamp', false, 3),
  ('SiteContent', 'updatedById', 'text', false, NULL),
  ('SiteContent', 'createdAt', 'timestamp', true, 3),
  ('SiteContent', 'updatedAt', 'timestamp', true, 3),
  ('ContentImport', 'id', 'text', true, NULL),
  ('ContentImport', 'actorId', 'text', true, NULL),
  ('ContentImport', 'module', 'text', true, NULL),
  ('ContentImport', 'mode', 'text', true, NULL),
  ('ContentImport', 'state', 'text', true, NULL),
  ('ContentImport', 'rows', 'jsonb', true, NULL),
  ('ContentImport', 'results', 'jsonb', true, NULL),
  ('ContentImport', 'cursor', 'int4', true, NULL),
  ('ContentImport', 'total', 'int4', true, NULL),
  ('ContentImport', 'createdAt', 'timestamp', true, 3),
  ('ContentImport', 'updatedAt', 'timestamp', true, 3);

DO $structure$
DECLARE problems text;
BEGIN
  SELECT string_agg(p.problem, E'\n' ORDER BY p.problem) INTO problems FROM (
    SELECT format('%s.%s: expected %s%s, found %s', e.tbl, e.col, e.typ, CASE WHEN e.not_null THEN ' NOT NULL' ELSE '' END,
                  coalesce(a.udt_name || CASE WHEN a.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END || coalesce('(' || a.datetime_precision || ')', ''), 'nothing')) AS problem
    FROM nhis_expected_columns e
    LEFT JOIN information_schema.columns a ON a.table_schema = 'public' AND a.table_name = e.tbl AND a.column_name = e.col
    WHERE a.column_name IS NULL OR a.udt_name <> e.typ OR (a.is_nullable = 'NO') <> e.not_null
       OR a.datetime_precision IS DISTINCT FROM e.prec
    UNION ALL
    SELECT format('%s.%s: unexpected extra column', a.table_name, a.column_name)
    FROM information_schema.columns a
    WHERE a.table_schema = 'public' AND a.table_name IN ('SiteContent', 'ContentImport')
      AND NOT EXISTS (SELECT 1 FROM nhis_expected_columns e WHERE e.tbl = a.table_name AND e.col = a.column_name)
  ) p;
  IF problems IS NOT NULL THEN
    RAISE EXCEPTION E'A new table does not have the expected structure; nothing was changed:\n%', problems;
  END IF;
  IF to_regclass('public."SiteContent_pkey"') IS NULL OR to_regclass('public."ContentImport_pkey"') IS NULL
     OR to_regclass('public."ContentImport_actorId_createdAt_idx"') IS NULL THEN
    RAISE EXCEPTION 'A primary key or index of the new tables is missing; nothing was changed.';
  END IF;
END
$structure$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Runtime role may use the new tables (the default privileges normally do this already; the GRANT is idempotent)
-- ---------------------------------------------------------------------------------------------------------------------
DO $grants$
DECLARE app_role constant text := 'tn_nhis_app';   -- CHANGE HERE if the runtime role (DATABASE_URL user) has another name
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."SiteContent", public."ContentImport" TO %I', app_role);
  ELSE
    RAISE NOTICE 'Role % does not exist on this server: nothing granted. If the API connects as another role than the owner, grant SELECT, INSERT, UPDATE, DELETE on "SiteContent" and "ContentImport" to it.', app_role;
  END IF;
END
$grants$;

COMMIT;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Read-only report (run after COMMIT). Every line must read OK.
-- ---------------------------------------------------------------------------------------------------------------------
SELECT c.step, c.result, CASE WHEN c.ok THEN 'OK' ELSE 'CHECK THIS' END AS status
FROM (
  SELECT 1 AS n, 'table "SiteContent" exists' AS step, coalesce(to_regclass('public."SiteContent"')::text, 'missing') AS result, to_regclass('public."SiteContent"') IS NOT NULL AS ok
  UNION ALL SELECT 2, 'table "ContentImport" exists', coalesce(to_regclass('public."ContentImport"')::text, 'missing'), to_regclass('public."ContentImport"') IS NOT NULL
  UNION ALL SELECT 3, 'AssetKind values (DOCUMENT, IMAGE, VIDEO expected)',
         (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AssetKind'),
         (SELECT count(*) = 3 AND bool_and(e.enumlabel IN ('DOCUMENT', 'IMAGE', 'VIDEO')) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AssetKind')
  UNION ALL SELECT 4, 'rows in the new tables (SiteContent / ContentImport; 0 / 0 on first release)',
         (SELECT count(*) FROM public."SiteContent") || ' / ' || (SELECT count(*) FROM public."ContentImport"), true
  UNION ALL SELECT 5, 'login roles (not superusers) that can SELECT/INSERT/UPDATE/DELETE both new tables: the user in the API DATABASE_URL must be one of them',
         (SELECT coalesce(string_agg(r.rolname, ', ' ORDER BY r.rolname), 'none') FROM pg_roles r
           WHERE r.rolcanlogin AND NOT r.rolsuper
             AND has_table_privilege(r.oid, 'public."SiteContent"', 'SELECT,INSERT,UPDATE,DELETE')
             AND has_table_privilege(r.oid, 'public."ContentImport"', 'SELECT,INSERT,UPDATE,DELETE')),
         EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolcanlogin AND NOT r.rolsuper
                    AND has_table_privilege(r.oid, 'public."SiteContent"', 'SELECT,INSERT,UPDATE,DELETE')
                    AND has_table_privilege(r.oid, 'public."ContentImport"', 'SELECT,INSERT,UPDATE,DELETE'))
  UNION ALL SELECT 6, 'migrations recorded by Prisma so far (0 to 3; run the three `migrate resolve --applied` commands from the header)',
         (SELECT count(*) FROM public."_prisma_migrations" WHERE migration_name IN ('20261015100000_site_content_cms', '20261015110000_content_import', '20261015120000_manual_video') AND finished_at IS NOT NULL)::text, true
) c
ORDER BY c.n;
