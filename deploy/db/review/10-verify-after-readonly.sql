-- STEP 3 of 4: READ-ONLY verification after the migrations were applied (by `npm run db:migrate -w nhis-api`, or by hand
-- followed by `prisma migrate resolve`). Changes nothing. Run as the owner role:
--   psql -h HOST -U tn_nhis_owner -d tn_nhis_website -v app_role=tn_nhis_app -f 10-verify-after-readonly.sql > verify-after.txt
-- app_role is the user named in the API's DATABASE_URL (default tn_nhis_app; on the live server possibly the owner role itself).
-- If that role does not exist on the server, check 6 simply lists nothing.
\if :{?app_role}
\else
  \set app_role tn_nhis_app
\endif

\echo === 1. both new tables exist (expect "SiteContent" and "ContentImport")
SELECT to_regclass('public."SiteContent"') AS site_content_table, to_regclass('public."ContentImport"') AS content_import_table;

\echo === 2. AssetKind now also has VIDEO (the only change to an existing object; the old values are unchanged)
SELECT e.enumlabel AS asset_kind_value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AssetKind' ORDER BY e.enumsortorder;

\echo === 3. columns of the new tables
SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('SiteContent', 'ContentImport') ORDER BY table_name, ordinal_position;

\echo === 4. the new tables are empty (nothing is seeded; documents are created when an administrator first saves them)
SELECT (SELECT count(*) FROM "SiteContent") AS site_content_rows, (SELECT count(*) FROM "ContentImport") AS content_import_rows;

\echo === 5. the three migrations are recorded as applied (finished_at set, rolled_back_at empty)
SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at;

\echo === 6. the runtime role can use both tables (every value must be t). If not, run 20-grants-if-missing.sql
SELECT t.tbl,
       has_table_privilege(:'app_role', 'public."' || t.tbl || '"', 'SELECT') AS can_select,
       has_table_privilege(:'app_role', 'public."' || t.tbl || '"', 'INSERT') AS can_insert,
       has_table_privilege(:'app_role', 'public."' || t.tbl || '"', 'UPDATE') AS can_update,
       has_table_privilege(:'app_role', 'public."' || t.tbl || '"', 'DELETE') AS can_delete
FROM (VALUES ('SiteContent'), ('ContentImport')) AS t(tbl)
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role');

\echo === 7. existing content is untouched: compare with preflight-before.txt (identical numbers expected)
SELECT 'AdminUser' AS tbl, count(*) FROM "AdminUser"
UNION ALL SELECT 'Announcement', count(*) FROM "Announcement"
UNION ALL SELECT 'AuditLog', count(*) FROM "AuditLog"
UNION ALL SELECT 'Contact', count(*) FROM "Contact"
UNION ALL SELECT 'Document', count(*) FROM "Document"
UNION ALL SELECT 'GalleryItem', count(*) FROM "GalleryItem"
UNION ALL SELECT 'Hospital', count(*) FROM "Hospital"
UNION ALL SELECT 'MediaAsset', count(*) FROM "MediaAsset"
UNION ALL SELECT 'Page', count(*) FROM "Page"
UNION ALL SELECT 'PageTranslation', count(*) FROM "PageTranslation"
UNION ALL SELECT 'SiteSetting', count(*) FROM "SiteSetting"
ORDER BY tbl;
