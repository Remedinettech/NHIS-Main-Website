# Project office officials — production SQL

File: `insert-project-office-officials.sql`. It inserts the directory and only missing officials directly as **PUBLISHED**, as explicitly requested. This is not an Excel draft import. It never overwrites, republishes, renames or deletes existing records, and creates no users, audit impersonations or import markers.

## pgAdmin

1. Verify the intended production server/port. Right-click **tn_nhis_website → Backup** and save a full database backup in Custom format to a protected location. Check that the backup succeeded and retain its location and this SQL file. A matching database name does not prove that you selected the intended server.
2. Open **Query Tool** on `tn_nhis_website`, using an approved operator account with the required SELECT, INSERT, temporary-table and table-lock permissions. Open `insert-project-office-officials.sql` as UTF-8.
3. For preflight only, select from `BEGIN;` through the three preflight SELECT queries, stopping **before** `LOCK TABLE`. Execute that selection and inspect the existing directory and all expected IDs/source rows/employee numbers. Then execute `ROLLBACK;` to end this preflight transaction.
4. Clear the selection and run the **whole file**. It guards the database name, locks the two tables briefly, reports conflicts, validates the payload, inserts missing rows, verifies them and commits. A successful first run against empty target data reports directory **1**, officials **14**; an identical second run reports **0**, **0**. Partial prior installations report only the missing insert counts. Existing identical rows retain timestamps, versions and drafts.
5. Any ERROR means failure: execute `ROLLBACK;`, retain the Messages output, investigate the conflict, and do not edit the script to force replacement. A 5-second lock timeout also fails safely; retry later after investigating activity. No part of a failed transaction is committed.
6. Review the verification result sets: all 14 IDs, employee numbers, names, designations, emails, source/display order, PUBLISHED status and publication timestamp. Verify the public endpoint and Admin directory afterward. Existing extra records remain untouched.

## Exact IDs and conflicts

The JSON source uses `project-office-officials-r2` through `project-office-officials-r15`. These exact IDs are used. The legacy snapshot importer and the older preparation CLI instead generated `project-office-officials-row-2` through `...-row-15`. If those records already exist, the script reports a source-row/employee-number conflict and aborts rather than creating duplicates or changing their IDs. Reconcile that situation separately after review; do not reseed.

The directory uses source index **4**; official sortOrder equals sourceRow **2–15**, following the snapshot import implementation. Displayed serial numbers remain **1–14**. Missing emails remain `""` in `cells.E`, not SQL NULL. Search text follows the application's normalized cell concatenation. The two creator/updater IDs are nullable and remain NULL for new operator-loaded rows, as in the snapshot importer. New rows have version 1, SQL NULL draft/archivedAt and populated createdAt/updatedAt/publishedAt. No guessed actor is written to the application audit trail: retain the backup and execution log as the operator record.

Directory metadata differences, a conflicting ID in any directory, an alternate ID with the same source row or employee number in this directory, differing existing published fields, or an existing DRAFT/ARCHIVED record cause a complete abort. Pending drafts on otherwise identical PUBLISHED records are preserved. The script does not require an existing directory to contain exactly 14 total rows; additional existing officials are preserved.

## Deployed API compatibility — separate from SQL

Current source `nhis-api/src/modules/contacts/contacts.service.ts` includes `project-office-officials` in `CONTACT_DIRECTORY_IDS`. The public repository reads only PUBLISHED contacts. Admin lists the database directories and uses their column metadata; current Admin/Client also include the project-office display-column mapping and shared directory type.

Read-only checks on 16 October 2026 found:

- `https://claims.tn-nhis.net/TNNHISApi/api/v1/contacts` returned only the four older directories.
- `https://claims.tn-nhis.net/TNNHISApi/api/v1/contacts/project-office-officials` returned HTTP 404, `Contact directory not found`.

These results cannot distinguish missing database data from an outdated API allowlist: both produce 404. Check the deployed release. If it lacks `project-office-officials` in `CONTACT_DIRECTORY_IDS`, update/rebuild/restart the API with the current code through the normal deployment process. SQL cannot modify that allowlist. Update Client/Admin with the compatible current build when needed. After SQL and a compatible API are in place, expect this directory endpoint to return HTTP 200 with the 14 expected officials (plus any pre-existing extras). No server deployment or production SQL execution was performed for this task.

## Validation performed

Used PostgreSQL 18 in the existing **isolated** `.verification/pg` cluster on `127.0.0.1:55439`, after verifying its data-directory path. Created a fresh fixture database named `tn_nhis_website` solely to exercise the script's exact database-name guard. The fixture enum/tables/unique index/foreign key were taken verbatim from the checked-in initial migration. No application database migration or seed command ran.

Passed: first run inserts 1 directory + 14 PUBLISHED records; exact source IDs/cells/order and empty emails; second run inserts 0 and changes no fields/timestamps; unrelated sentinel directory/contact preserved; wrong database rejection; differing data rejection; ID collision rejection without partial inserts; legacy alternate-ID duplicate prevention; existing DRAFT record rejection without publishing it. Test logs are retained under `.verification/project-office-sql-*.log` and `.verification/project-office-sql-results.txt` in the development checkout. This is isolated SQL validation, not production execution or a claim of full deployed API/Admin browser verification.

Additional isolated checks passed: pending draft/version/timestamps preserved; partial installation inserted only two missing officials; a forced post-insert validation failure rolled back both the directory and all 14 officials; the actual public contact service returned all 14 exact source records, and the Admin service listed and validated every row.
