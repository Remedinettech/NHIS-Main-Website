-- TN-NHIS: add only the Project office officials directory and missing officials.
-- Generated 2026-10-16 from nhis-api/src/data/contacts.json (not a screenshot).
-- contacts.json SHA-256: 389e61984663839c300d2c08d440976f6c6dfd41485eefe52cac9ad7ce104e52
-- Schema: public."ContactDirectory", public."Contact", public."PublicationStatus".
-- Exact JSON source IDs (-r2 ... -r15) are intentional. The older snapshot
-- importer instead generated -row-2 ... -row-15; those are conflicts, NOT aliases.
-- Contact sortOrder = sourceRow, matching prisma/import/import.ts; directory
-- sortOrder = source array index (4). Empty email cells remain JSON strings "".
-- This is an operator-reviewed INSERT of immediately PUBLISHED content.
-- Excel imports normally create drafts; this script intentionally supplies the
-- publication fields needed by the public API. It does not edit existing drafts.
-- No users are impersonated: nullable createdById/updatedById are NULL, as in
-- the snapshot importer. No application audit rows/import markers are fabricated.
-- Retain the backup, this file and pgAdmin Messages output as the operator record.
-- BACK UP FIRST. Review the read-only preflight results before running the whole file.
-- In pgAdmin, errors leave the transaction aborted: run ROLLBACK; before retrying.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $guard$
BEGIN
  IF current_database() <> 'tn_nhis_website' THEN
    RAISE EXCEPTION 'Wrong database: %. Required: tn_nhis_website. No changes made.', current_database();
  END IF;
END
$guard$;

-- Session-only expected data. No application data has been changed here.
CREATE TEMP TABLE nhis_expected_directory (
  id text PRIMARY KEY, "labelEn" text, "labelTa" text, "sourceFile" text,
  columns jsonb, flags jsonb, "sortOrder" integer
) ON COMMIT DROP;
INSERT INTO nhis_expected_directory VALUES
  ('project-office-officials', 'Project office officials', '', 'DC and PO Details To Vidal For portal.docx', '[{"key":"A","header":"Sl.No.","kind":"text"},{"key":"B","header":"Emp.No.","kind":"text"},{"key":"C","header":"Name","kind":"text"},{"key":"D","header":"Designation","kind":"text"},{"key":"E","header":"Email address","kind":"email"}]'::jsonb, '[]'::jsonb, 4);

CREATE TEMP TABLE nhis_expected_officials (
  id text PRIMARY KEY, "sourceRow" integer UNIQUE, "sortOrder" integer,
  cells jsonb, "searchText" text
) ON COMMIT DROP;
INSERT INTO nhis_expected_officials VALUES
  ('project-office-officials-r2', 2, 2, '{"A":"1","B":"44182","C":"V.S. Rajasubramaniam","D":"Chief Business Manager","E":"rajasubramanianvs@uiic.co.in"}'::jsonb, '1 44182 v.s. rajasubramaniam chief business manager rajasubramanianvs@uiic.co.in'),
  ('project-office-officials-r3', 3, 3, '{"A":"2","B":"27902","C":"Ravikiran G","D":"Manager","E":"ravikirang@uiic.co.in"}'::jsonb, '2 27902 ravikiran g manager ravikirang@uiic.co.in'),
  ('project-office-officials-r4', 4, 4, '{"A":"3","B":"28411","C":"Dr Shilpika Sodagudi","D":"Deputy Manager","E":"sshilpika@uiic.co.in"}'::jsonb, '3 28411 dr shilpika sodagudi deputy manager sshilpika@uiic.co.in'),
  ('project-office-officials-r5', 5, 5, '{"A":"4","B":"44390","C":"Anandhi E","D":"Deputy Manager","E":"anandhie@uiic.co.in"}'::jsonb, '4 44390 anandhi e deputy manager anandhie@uiic.co.in'),
  ('project-office-officials-r6', 6, 6, '{"A":"5","B":"58022","C":"Prasanth Kumar P","D":"Asst. Manager","E":"prasanthkp@uiic.co.in"}'::jsonb, '5 58022 prasanth kumar p asst. manager prasanthkp@uiic.co.in'),
  ('project-office-officials-r7', 7, 7, '{"A":"6","B":"45382","C":"Anand K","D":"Asst. Manager","E":"kanand@uiic.co.in"}'::jsonb, '6 45382 anand k asst. manager kanand@uiic.co.in'),
  ('project-office-officials-r8', 8, 8, '{"A":"7","B":"39367","C":"G. Manikandan","D":"Asst. Manager","E":"manikandang@uiic.co.in"}'::jsonb, '7 39367 g. manikandan asst. manager manikandang@uiic.co.in'),
  ('project-office-officials-r9', 9, 9, '{"A":"8","B":"44398","C":"N Bindhu","D":"Admn. Officer","E":"bindhun@uiic.co.in"}'::jsonb, '8 44398 n bindhu admn. officer bindhun@uiic.co.in'),
  ('project-office-officials-r10', 10, 10, '{"A":"9","B":"38248","C":"S. Harish","D":"Admn. Officer","E":"harishs@uiic.co.in"}'::jsonb, '9 38248 s. harish admn. officer harishs@uiic.co.in'),
  ('project-office-officials-r11', 11, 11, '{"A":"10","B":"44378","C":"Aarthi V G","D":"Admn. Officer","E":"aarthivg@uiic.co.in"}'::jsonb, '10 44378 aarthi v g admn. officer aarthivg@uiic.co.in'),
  ('project-office-officials-r12', 12, 12, '{"A":"11","B":"44015","C":"Vidya Sundar","D":"Admn. Officer","E":"vidyas@uiic.co.in"}'::jsonb, '11 44015 vidya sundar admn. officer vidyas@uiic.co.in'),
  ('project-office-officials-r13', 13, 13, '{"A":"12","B":"60610","C":"Saksham Gupta","D":"Admn. Officer","E":"sakshamgupta@uiic.co.in"}'::jsonb, '12 60610 saksham gupta admn. officer sakshamgupta@uiic.co.in'),
  ('project-office-officials-r14', 14, 14, '{"A":"13","B":"44170","C":"A Thavamaniraj","D":"Senior Assistant","E":""}'::jsonb, '13 44170 a thavamaniraj senior assistant'),
  ('project-office-officials-r15', 15, 15, '{"A":"14","B":"44538","C":"B Seemati","D":"Sub Staff","E":""}'::jsonb, '14 44538 b seemati sub staff');

-- READ-ONLY PREFLIGHT: select the file through this next query to inspect first.
-- Finish a preflight-only run with ROLLBACK; then execute the WHOLE file to apply.
SELECT current_database() AS database, current_user AS operator,
       inet_server_addr() AS server_address, inet_server_port() AS server_port;
SELECT e.id AS expected_directory, d.id IS NOT NULL AS already_exists,
       to_jsonb(d) AS existing_directory
FROM nhis_expected_directory e LEFT JOIN public."ContactDirectory" d ON d.id = e.id;
SELECT e.id AS expected_id, e."sourceRow", e.cells->>'B' AS employee_number,
       e.cells->>'C' AS expected_name, c.id AS existing_id, c.status,
       c.draft IS NOT NULL AS has_pending_draft, c.cells AS existing_cells
FROM nhis_expected_officials e
LEFT JOIN public."Contact" c ON c.id = e.id
  OR (c."directoryId" = 'project-office-officials'
      AND (c."sourceRow" = e."sourceRow" OR c.cells->>'B' = e.cells->>'B'))
ORDER BY e."sortOrder", c.id;

-- Serialize validation/insertion against concurrent writers. Locks change no rows.
LOCK TABLE public."ContactDirectory", public."Contact" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE nhis_official_conflicts ON COMMIT DROP AS
SELECT d.id, 'Existing directory metadata differs from source'::text AS reason,
       to_jsonb(d) AS existing
FROM public."ContactDirectory" d JOIN nhis_expected_directory e ON d.id = e.id
WHERE (d."labelEn", d."labelTa", d."sourceFile", d.columns, d.flags, d."sortOrder")
 IS DISTINCT FROM (e."labelEn", e."labelTa", e."sourceFile", e.columns, e.flags, e."sortOrder")
UNION ALL
SELECT c.id, 'Expected ID exists with different data, directory or publication state', to_jsonb(c)
FROM public."Contact" c JOIN nhis_expected_officials e ON c.id = e.id
WHERE c."directoryId" <> 'project-office-officials'
   OR c."sourceRow" IS DISTINCT FROM e."sourceRow"
   OR c."sortOrder" IS DISTINCT FROM e."sortOrder"
   OR c.cells IS DISTINCT FROM e.cells OR c."searchText" IS DISTINCT FROM e."searchText"
   OR c.status::text <> 'PUBLISHED' OR c."publishedAt" IS NULL
   OR c."archivedAt" IS NOT NULL OR c.version < 1
UNION ALL
SELECT c.id, 'Source row or employee number already exists under another ID', to_jsonb(c)
FROM public."Contact" c JOIN nhis_expected_officials e
 ON c."directoryId" = 'project-office-officials' AND c.id <> e.id
 AND (c."sourceRow" = e."sourceRow" OR c.cells->>'B' = e.cells->>'B');

-- This result set reports conflicts without overwriting or renaming anything.
SELECT * FROM nhis_official_conflicts ORDER BY id, reason;
DO $validate$
DECLARE conflicts text;
BEGIN
  IF (SELECT count(*) FROM nhis_expected_officials) <> 14
     OR (SELECT count(DISTINCT cells->>'B') FROM nhis_expected_officials) <> 14
     OR EXISTS (SELECT 1 FROM nhis_expected_officials
                WHERE cells->>'A' <> ("sortOrder" - 1)::text
                   OR coalesce(cells->>'B', '') = '' OR coalesce(cells->>'C', '') = ''
                   OR coalesce(cells->>'D', '') = '' OR jsonb_typeof(cells->'E') <> 'string') THEN
    RAISE EXCEPTION 'Expected source payload failed validation. Transaction must roll back.';
  END IF;
  SELECT string_agg(id || ': ' || reason, E'\n' ORDER BY id, reason)
    INTO conflicts FROM nhis_official_conflicts;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Conflicting existing data. Nothing will be inserted. %', conflicts;
  END IF;
END
$validate$;

CREATE TEMP TABLE nhis_insert_results (entity text, inserted integer) ON COMMIT DROP;
WITH added AS (
  INSERT INTO public."ContactDirectory"
    (id, "labelEn", "labelTa", "sourceFile", columns, flags, "sortOrder", "updatedAt")
  SELECT id, "labelEn", "labelTa", "sourceFile", columns, flags, "sortOrder", CURRENT_TIMESTAMP
  FROM nhis_expected_directory e
  WHERE NOT EXISTS (SELECT 1 FROM public."ContactDirectory" d WHERE d.id = e.id)
  RETURNING id
) INSERT INTO nhis_insert_results SELECT 'directory', count(*) FROM added;

WITH added AS (
  INSERT INTO public."Contact"
    (id, "directoryId", "sourceRow", "sortOrder", cells, "searchText", status,
     version, draft, "publishedAt", "archivedAt", "createdById", "updatedById", "createdAt", "updatedAt")
  SELECT e.id, 'project-office-officials', e."sourceRow", e."sortOrder", e.cells, e."searchText",
         'PUBLISHED'::public."PublicationStatus", 1, NULL, CURRENT_TIMESTAMP, NULL,
         NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM nhis_expected_officials e
  WHERE NOT EXISTS (SELECT 1 FROM public."Contact" c WHERE c.id = e.id)
  ORDER BY e."sortOrder"
  RETURNING id
) INSERT INTO nhis_insert_results SELECT 'officials', count(*) FROM added;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public."Contact" c JOIN nhis_expected_officials e ON c.id = e.id
      WHERE c."directoryId" = 'project-office-officials' AND c.cells = e.cells
        AND c."sourceRow" = e."sourceRow" AND c."sortOrder" = e."sortOrder"
        AND c."searchText" = e."searchText" AND c.status::text = 'PUBLISHED'
        AND c."publishedAt" IS NOT NULL AND c."archivedAt" IS NULL
        AND c."createdAt" IS NOT NULL AND c."updatedAt" IS NOT NULL AND c.version >= 1) <> 14 THEN
    RAISE EXCEPTION 'Post-insert validation failed. All changes must roll back.';
  END IF;
END
$verify$;

-- VERIFICATION: 14 expected officials; an identical second run inserts 0 + 0.
SELECT * FROM nhis_insert_results ORDER BY entity;
SELECT c.id, c."sourceRow", c."sortOrder", c.cells->>'A' AS serial_number,
       c.cells->>'B' AS employee_number, c.cells->>'C' AS name,
       c.cells->>'D' AS designation, c.cells->>'E' AS email,
       c.status, c."publishedAt", c.version, c.draft IS NOT NULL AS has_pending_draft
FROM nhis_expected_officials e JOIN public."Contact" c ON c.id = e.id
ORDER BY c."sortOrder", c."sourceRow", c.id;
SELECT d.id, d."labelEn", d."labelTa", d."sortOrder",
       count(c.id) FILTER (WHERE c.status::text = 'PUBLISHED') AS total_public_officials
FROM public."ContactDirectory" d LEFT JOIN public."Contact" c ON c."directoryId" = d.id
WHERE d.id = 'project-office-officials'
GROUP BY d.id, d."labelEn", d."labelTa", d."sortOrder";
-- Extra pre-existing officials, if any, are retained; the expected 14 are verified above.
COMMIT;
