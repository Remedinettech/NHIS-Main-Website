/**
 * Resumed security review, migrations (no database needed). The release adds three migrations to a database that already
 * holds the website's data, so each statement of these three migrations must only ADD something: a table, an
 * index or an enum value. A destructive or rewriting statement (DROP, ALTER TABLE, UPDATE, DELETE, TRUNCATE, GRANT ...) fails this
 * test, whoever adds it later. The operator copies of the scripts must stay byte-identical to the migrations Prisma records
 * checksums of.
 *
 * Proved separately against PostgreSQL 18 on a throw-away database (not repeatable here without a superuser): the three
 * migrations apply with `prisma migrate deploy` after `migrate resolve --applied 20261012160000_init`, `prisma migrate diff`
 * from the migrations folder to schema.prisma and from the migrated database to schema.prisma are both empty, and
 * `ALTER TYPE "AssetKind" ADD VALUE` runs inside one transaction (`psql -1`).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './helpers';

const migrationsDir = path.join(repoRoot(), 'nhis-api', 'prisma', 'migrations');
const INIT = '20261012160000_init';
const migrations = fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const RELEASE = ['20261015100000_site_content_cms', '20261015110000_content_import', '20261015120000_manual_video'];
const additions = migrations.filter((name) => RELEASE.includes(name));

/** The statements of an SQL file without comments, trimmed and without the closing semicolon. */
const statementsOf = (sql: string): string[] => sql.replace(/--[^\n]*/g, '').split(';').map((statement) => statement.replace(/\s+/g, ' ').trim()).filter(Boolean);

const ADDITIVE = [
  /^CREATE TABLE "[A-Za-z]+" \(/,
  /^CREATE (UNIQUE )?INDEX "[A-Za-z_]+" ON "[A-Za-z]+"\(/,
  /^ALTER TYPE "[A-Za-z]+" ADD VALUE IF NOT EXISTS '[A-Z_]+'$/,
];

describe('the migrations of this release', () => {
  test('the three migrations of this release exist, after the initial one and in this order', () => {
    assert.deepEqual(additions, RELEASE);
    assert.equal(migrations[0], INIT);
    assert.ok(RELEASE.every((name) => name > INIT));
  });

  test('every statement only adds a table, an index or an enum value', () => {
    for (const name of additions) {
      const statements = statementsOf(fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8'));
      assert.ok(statements.length > 0, name);
      for (const statement of statements) assert.ok(ADDITIVE.some((pattern) => pattern.test(statement)), `${name}: not an additive statement: ${statement.slice(0, 80)}`);
    }
  });

  test('a new table never changes an existing one: no foreign key and no reference to an existing table', () => {
    const existing = ['AdminSession', 'AdminUser', 'Announcement', 'AuditLog', 'Contact', 'ContactDirectory', 'ContentRevision', 'Document', 'GalleryItem', 'Hospital', 'ImportMarker', 'LoginAttempt', 'MediaAsset', 'Page', 'PageTranslation', 'SiteSetting'];
    for (const name of additions) {
      const sql = statementsOf(fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8')).join(';\n');
      assert.ok(!/REFERENCES|FOREIGN KEY/i.test(sql), `${name}: no foreign keys`);
      for (const table of existing) assert.ok(!new RegExp(`"${table}"`).test(sql), `${name} must not mention the existing table ${table}`);
    }
  });

  test('migration_lock.toml names PostgreSQL', () => {
    assert.match(fs.readFileSync(path.join(migrationsDir, 'migration_lock.toml'), 'utf8'), /^provider = "postgresql"$/m);
  });

  test('the files of the initial migration were not edited by this release: it still creates the two-value enum', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, INIT, 'migration.sql'), 'utf8');
    assert.match(sql, /CREATE TYPE "AssetKind" AS ENUM \('DOCUMENT', 'IMAGE'\);/);
  });
});

describe('operator copies', () => {
  const reviewDir = path.join(repoRoot(), 'deploy', 'db', 'review');
  const copies: Array<[string, string]> = [
    ['01-20261015100000_site_content_cms.sql', '20261015100000_site_content_cms'],
    ['02-20261015110000_content_import.sql', '20261015110000_content_import'],
    ['03-20261015120000_manual_video.sql', '20261015120000_manual_video'],
  ];
  test('the review pack holds byte-identical copies of the migrations (a changed comment changes the checksum Prisma records)', { skip: !fs.existsSync(reviewDir) }, () => {
    for (const [file, migration] of copies) {
      assert.ok(fs.readFileSync(path.join(reviewDir, file)).equals(fs.readFileSync(path.join(migrationsDir, migration, 'migration.sql'))), `${file} differs from ${migration}`);
    }
  });
});
