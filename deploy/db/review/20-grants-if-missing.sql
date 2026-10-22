-- STEP 3b: run ONLY if 10-verify-after-readonly.sql showed an f for the runtime role. Normally the default privileges set by
-- database-backup/02_grants_after_restore.sql already grant these on tables that the owner creates later. Idempotent.
--   psql -h HOST -U tn_nhis_owner -d tn_nhis_website -v app_role=tn_nhis_app -f 20-grants-if-missing.sql
\if :{?app_role}
\else
  \set app_role tn_nhis_app
\endif
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "SiteContent", "ContentImport" TO :"app_role";
