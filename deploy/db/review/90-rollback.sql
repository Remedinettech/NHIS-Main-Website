-- EMERGENCY ROLLBACK of the three migrations. Not part of an ordinary rollback: in an ordinary rollback you restore the
-- previous application release (Client, Admin, API); the new tables are ignored by the old code and may stay.
--
-- READ FIRST
--  * It deletes every site-content document saved by administrators (drafts and published values) and every Excel import
--    job. Export them first:
--      pg_dump -h HOST -U tn_nhis_owner -d tn_nhis_website -t "\"SiteContent\"" -t "\"ContentImport\"" -Fc -f cms-tables.dump
--  * Stop the new API first and make sure the previous release is the one running.
--  * Uploaded files (MediaAsset rows and the files in the Uploads folder) are NOT touched. MediaAsset rows of kind VIDEO stay;
--    the value VIDEO of the enum "AssetKind" CANNOT be removed (PostgreSQL has no DROP VALUE). An older release that lists or
--    reads such a row fails on it: the script prints how many exist; delete those rows (and files) only after backing up.
--  * "ContentRevision" and "AuditLog" rows with entityType 'site-content' are kept as history.
--  * The script refuses to run unless you pass  -v confirm=YES :
--      psql -h HOST -U tn_nhis_owner -d tn_nhis_website -v ON_ERROR_STOP=1 -v confirm=YES -f 90-rollback.sql
\set ON_ERROR_STOP on
\if :{?confirm}
\else
  \echo 'Refusing to run: pass -v confirm=YES after reading the header of this script.'
  \quit
\endif
SELECT (:'confirm' = 'YES') AS confirmed \gset
\if :confirmed
\else
  \echo 'Refusing to run: confirm must be exactly YES.'
  \quit
\endif

\echo === VIDEO assets that an older release cannot read (informational):
SELECT count(*) AS video_assets FROM "MediaAsset" WHERE kind::text = 'VIDEO';

BEGIN;
DROP TABLE IF EXISTS "ContentImport";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261015110000_content_import';
DROP TABLE IF EXISTS "SiteContent";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261015100000_site_content_cms';
-- 20261015120000_manual_video only added an enum value, which cannot be dropped. Its history row is removed so that a later
-- `prisma migrate deploy` runs it again; the statement is "ADD VALUE IF NOT EXISTS", so that is harmless.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261015120000_manual_video';
COMMIT;

\echo === after (expect both NULL):
SELECT to_regclass('public."SiteContent"') AS site_content_table, to_regclass('public."ContentImport"') AS content_import_table;
