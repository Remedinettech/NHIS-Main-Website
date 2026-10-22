import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Isolated PostgreSQL schema for admin DB tests, created and migrated with the OWNER role (DIRECT_URL) inside
 * tn_nhis_website, and dropped afterwards. The live `public` schema is never touched. Credentials are never printed.
 */
export const ADMIN_TEST_SCHEMA = 'nhis_test_admin';

export function testDatabaseUrl(): string {
  const base = process.env.DIRECT_URL;
  if (!base) throw new Error('DIRECT_URL is not set');
  if (!new URL(base).pathname.includes('disposable')) throw new Error('Integration tests require a clearly named disposable database.');
  const url = new URL(base);
  url.searchParams.set('schema', ADMIN_TEST_SCHEMA);
  return url.toString();
}

function schemaSql(): string[] {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve('prisma/build/index.js');
  const out = execFileSync(process.execPath, [prismaCli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join('prisma', 'schema.prisma'), '--script'], {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
  });
  return out.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
}

export interface AdminTestDb { client: PrismaClient; cleanup: () => Promise<void> }

export async function createAdminTestDb(): Promise<AdminTestDb> {
  testDatabaseUrl(); // Guard before any DDL.
  const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
  await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ADMIN_TEST_SCHEMA}" CASCADE`);
  await owner.$executeRawUnsafe(`CREATE SCHEMA "${ADMIN_TEST_SCHEMA}"`);
  await owner.$disconnect();

  const client = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  for (const statement of schemaSql()) await client.$executeRawUnsafe(statement);

  return {
    client,
    cleanup: async () => {
      await client.$disconnect();
      const o = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
      await o.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ADMIN_TEST_SCHEMA}" CASCADE`);
      await o.$disconnect();
    },
  };
}
