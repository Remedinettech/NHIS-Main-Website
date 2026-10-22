/**
 * Throw-away environment for browser end-to-end checks: its own PostgreSQL schema (nhis_e2e) inside tn_nhis_website,
 * the imported content, three staff accounts and a private file store. The live `public` schema is never touched.
 *
 *   node --import tsx src/test/e2e-env.ts setup      create schema, import, create users, write .local-e2e-credentials
 *   node --import tsx src/test/e2e-env.ts teardown   drop the schema and remove the file store and credentials
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SCHEMA = 'nhis_e2e';
const STORAGE = path.resolve(process.cwd(), '.e2e-storage');
const CREDENTIALS = path.resolve(process.cwd(), '.local-e2e-credentials');

const urlFor = (base: string) => {
  const url = new URL(base);
  url.searchParams.set('schema', SCHEMA);
  return url.toString();
};

function schemaSql(): string[] {
  const require = createRequire(import.meta.url);
  const out = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join('prisma', 'schema.prisma'), '--script'], {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
  });
  return out.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
}

async function setup(): Promise<void> {
  const direct = process.env.DIRECT_URL;
  if (!direct || !new URL(direct).pathname.includes('disposable')) throw new Error('Use only an isolated disposable database.');
  const owner = new PrismaClient({ datasourceUrl: direct });
  await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await owner.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
  await owner.$disconnect();

  const client = new PrismaClient({ datasourceUrl: urlFor(direct) });
  for (const statement of schemaSql()) await client.$executeRawUnsafe(statement);

  fs.rmSync(STORAGE, { recursive: true, force: true });
  process.env.FILE_STORAGE_DIR = STORAGE;
  const { hashPassword } = await import('../common/admin');
  const lines: string[] = [`E2E staff accounts (schema ${SCHEMA}); not the real administrator.`];
  for (const role of ['ADMIN', 'PUBLISHER', 'EDITOR'] as const) {
    const password = `E2e-${crypto.randomBytes(9).toString('hex')}-${role.toLowerCase()}`;
    await client.adminUser.create({ data: { email: `e2e.${role.toLowerCase()}@test.example`, name: `E2E ${role.toLowerCase()}`, role, passwordHash: await hashPassword(password) } });
    lines.push(`${role}: e2e.${role.toLowerCase()}@test.example / ${password}`);
  }
  fs.writeFileSync(CREDENTIALS, `${lines.join('\n')}\n`);

  const { runImport, defaultSources } = await import('../../prisma/import/import');
  const { createStorageAdapter } = await import('../modules/storage');
  const report = await runImport(client, { ...defaultSources(), storage: createStorageAdapter(), log: () => undefined });
  console.log('E2E schema ready. Imported:', JSON.stringify(report.created));
  await client.$disconnect();
}

async function teardown(): Promise<void> {
  if (!process.env.DIRECT_URL || !new URL(process.env.DIRECT_URL).pathname.includes('disposable')) throw new Error('Use only a disposable database.');
  const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
  await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await owner.$disconnect();
  fs.rmSync(STORAGE, { recursive: true, force: true });
  fs.rmSync(CREDENTIALS, { force: true });
  console.log('E2E schema and files removed.');
}

const command = process.argv[2];
(command === 'setup' ? setup() : command === 'teardown' ? teardown() : Promise.reject(new Error('Use setup or teardown'))).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message.split('\n').slice(-2).join(' ') : String(error));
  process.exitCode = 1;
});
