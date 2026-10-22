-- STEP 0 of 4: READ-ONLY preflight. Changes nothing. Run as the schema owner role against the website database, e.g.
--   psql -h HOST -U tn_nhis_owner -d tn_nhis_website -f 00-preflight-readonly.sql > preflight-before.txt
-- Keep preflight-before.txt: STEP 3 compares against it.
\echo === connection
SELECT current_database() AS database, current_user AS connected_as, current_schema() AS schema, version();

\echo === the new objects must not exist yet (both NULL) and the AssetKind list must not contain VIDEO
SELECT to_regclass('public."SiteContent"') AS site_content_table,
       to_regclass('public."ContentImport"') AS content_import_table;
SELECT e.enumlabel AS asset_kind_value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AssetKind' ORDER BY e.enumsortorder;

\echo === applied migrations (a database restored from the 13 Oct 2026 backup has only 20261012160000_init)
SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at;

\echo === row counts of the existing tables (STEP 3 must show identical numbers)
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
