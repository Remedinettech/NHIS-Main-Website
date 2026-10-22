# TN-NHIS release: database scripts (for the DBA)

Nothing here runs automatically. Every script is applied by a person, after a backup, against the intended server. No script drops, deletes, updates or seeds existing content.

| Order | File | Purpose | Changes data? |
|---|---|---|---|
| 0 | `00-preflight-readonly.sql` | Read-only: connection, applied migrations, row counts. Save the output. | no |
| 1 | `04-release-all-in-one.sql` | **The schema change.** Creates the tables `SiteContent` and `ContentImport` (empty), adds the value `VIDEO` to the enum `AssetKind`, grants the runtime role. Guarded, re-runnable, all-or-nothing. | adds 2 empty tables |
| 2 | `05-data-project-office-officials.sql` | **Data, only if missing:** the directory "Project office officials" and its 14 officials, published. Re-runnable (second run inserts 0). Aborts on any conflict. | inserts only missing rows |
| 3 | `10-verify-after-readonly.sql` | Read-only verification; compare with step 0. | no |
| – | `20-grants-if-missing.sql` | Only if step 3 shows an `f` for the runtime role. | grants |
| – | `90-rollback.sql` | Emergency only. | drops the two new tables |
| – | `01-…`, `02-…`, `03-…` | The same change as step 1, as three Prisma migrations (for `npm run db:migrate`). Use **either** these (through Prisma) **or** step 1, never both. | |

## Run order

1. **Backup** the database (`pg_dump -Fc`) and the `Uploads` folder. Stop the API (or run in a quiet period).
2. Connect as the **role that owns the website tables** to the website database (`tn_nhis_website`). Find it with `SELECT tableowner FROM pg_tables WHERE tablename = 'Hospital';` — on the live server (backup of 19 October 2026) that role is `chandan`, on a copy restored from the 13 October backup it is `tn_nhis_owner`. Run `00-preflight-readonly.sql` and keep the output.
3. Run `04-release-all-in-one.sql` completely (pgAdmin Query Tool: load as UTF-8, run the whole file; psql: `-v ON_ERROR_STOP=1 -f`). The last result set lists six checks; all must read `OK`. Check 5 lists the login roles that can use the new tables: **the user in the API's `DATABASE_URL` must be in that list** (the owner role always is). If it is not, run `20-grants-if-missing.sql` with `-v app_role=<that user>`. After an error run `ROLLBACK;` in pgAdmin and read the message: nothing was changed.
4. **Tell Prisma the three migrations are applied** (once, from the Backend folder, `DIRECT_URL` set for that PowerShell session only):

   ```
   npx prisma migrate resolve --applied 20261015100000_site_content_cms --schema nhis-api\prisma\schema.prisma
   npx prisma migrate resolve --applied 20261015110000_content_import   --schema nhis-api\prisma\schema.prisma
   npx prisma migrate resolve --applied 20261015120000_manual_video     --schema nhis-api\prisma\schema.prisma
   npm run db:status -w nhis-api
   ```

   `db:status` must say "Database schema is up to date!". Do not run `db:migrate` after step 3. The script does not write `_prisma_migrations` itself, because Prisma stores a checksum of the exact bytes of each migration file.
5. Data: check **Contact directories** in the Admin (or `SELECT id FROM "ContactDirectory"`). If "project-office-officials" with its 14 officials is already there, **skip `05`**. On the live server (backup of 19 October 2026) they are there, stored with the ids `project-office-officials-row-2` to `-row-15`; `05` uses the ids `-r2` to `-r15` and therefore stops with "Conflicting existing data" and changes nothing, by design. Run `05-data-project-office-officials.sql` only on a database that lacks them (read its header; the preflight selects can be run first).
6. Run `10-verify-after-readonly.sql` (add `-v app_role=<the DATABASE_URL user>`) and compare with step 0: the row counts of the existing tables must be unchanged (except the officials added by step 5).
7. Start the new API release.

## What is not a database change

Renaming the Contact tab to "UIIC Project Office Officials", removing the address block from the Contact page, and the Grievances text and tables are application changes (Client/Admin/API). They need no SQL. Do not edit the directory label in the database: step 5 compares the stored directory with the expected values and stops if they differ.

The live API answers 404 for `/api/v1/contacts/project-office-officials` while `/api/v1/contacts` already lists the directory with 14 records: the old API release has no entry for it. The new API release fixes this; no SQL is involved.

## Tested

Disposable PostgreSQL 18, restored from the 13 October 2026 production backup (only the initial migration applied): first run, second run (no-op), run on a database that Prisma had already migrated, wrong database name, existing table with a different structure (full rollback, nothing added), unfinished migration recorded, run as the runtime role, run without a restore of the init migration. After the script and the three `resolve` commands, `prisma migrate status` reports up to date and `prisma migrate diff` against `schema.prisma` is empty; the tables are identical to those Prisma creates. Row counts of all existing tables were unchanged. Not tested: your real server and its history (the preflight and step-1 guards check that).
