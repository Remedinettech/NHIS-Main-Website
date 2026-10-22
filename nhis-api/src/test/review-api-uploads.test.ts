/**
 * Resumed security review, upload route (POST /admin/uploads) against a real PostgreSQL schema, through the real route file
 * with a real session: a malformed multipart body is the client's mistake (400, nothing stored), and an MP4 upload that
 * reaches a database without migration 20261015120000_manual_video (the enum value VIDEO is missing) is answered like every
 * other "migration pending" case (503 MIGRATION_REQUIRED) with nothing stored, instead of a bare 500.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createAdminTestDb, ADMIN_TEST_SCHEMA, type AdminTestDb } from './admin-test-db';
import { validMp4 } from './review-mp4';

const ORIGIN = 'http://127.0.0.1:5174';
const PASSWORD = 'Editor-Passphrase-Long-7';

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;
/* eslint-disable @typescript-eslint/no-explicit-any */
let uploads: { POST: (r: Request) => Promise<Response> };
let session: { cookie: string; csrf: string };

const storedFiles = () => fs.readdirSync(storageDir);
const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');

async function post(init: { body?: BodyInit; contentType?: string; form?: FormData }): Promise<{ status: number; body: any; text: string }> {
  const headers: Record<string, string> = { Origin: ORIGIN, Cookie: session.cookie, 'X-CSRF-Token': session.csrf };
  if (init.contentType) headers['Content-Type'] = init.contentType;
  const response = await uploads.POST(new Request('http://localhost/api/v1/admin/uploads', { method: 'POST', headers, body: init.form ?? init.body }));
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: response.status, body, text };
}
const upload = (kind: string, name: string, bytes: Uint8Array) => {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', new File([bytes as unknown as BlobPart], name));
  return post({ form });
};

before(async () => {
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-review-uploads-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  const { hashPassword } = await import('../common/admin');
  await client.adminUser.create({ data: { email: 'editor@uploads.example', name: 'Editor', role: 'EDITOR', passwordHash: await hashPassword(PASSWORD) } });
  const login = await import('../app/api/v1/admin/auth/login/route');
  const response = await login.POST(new Request('http://localhost/api/v1/admin/auth/login', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'editor@uploads.example', password: PASSWORD }),
  }));
  assert.equal(response.status, 200);
  session = { cookie: (response.headers.get('set-cookie') ?? '').split(';')[0], csrf: ((await response.json()) as { csrfToken: string }).csrfToken };
  uploads = await import('../app/api/v1/admin/uploads/route');
});
after(async () => {
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
});

describe('malformed multipart bodies', () => {
  test('garbage, a missing boundary and a truncated body are 400, never 500, and nothing is stored', async () => {
    const before = { files: storedFiles().length, assets: await client.mediaAsset.count(), audit: await client.auditLog.count() };
    const bodies: Array<{ label: string; contentType: string; body: string }> = [
      { label: 'garbage under a boundary', contentType: 'multipart/form-data; boundary=xyz', body: 'this is not multipart at all' },
      { label: 'no boundary parameter', contentType: 'multipart/form-data', body: '--xyz\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n--xyz--\r\n' },
      { label: 'truncated in the middle of a part', contentType: 'multipart/form-data; boundary=xyz', body: '--xyz\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n\x89PNG' },
      { label: 'empty body', contentType: 'multipart/form-data; boundary=xyz', body: '' },
    ];
    for (const { label, contentType, body } of bodies) {
      const res = await post({ contentType, body });
      assert.equal(res.status, 400, `${label}: ${res.text}`);
      assert.equal(res.body?.error?.code, 'INVALID', `${label}: ${res.text}`);
      assert.ok(!/stack|undici|TypeError/i.test(res.text), `${label}: nothing internal in the answer`);
    }
    assert.deepEqual({ files: storedFiles().length, assets: await client.mediaAsset.count(), audit: await client.auditLog.count() }, before);
  });

  test('a well-formed upload still works after the failures', async () => {
    const res = await upload('document', 'ok.pdf', pdf());
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.data.kind, 'DOCUMENT');
  });
});

describe('an MP4 upload before the migration that adds the enum value VIDEO', () => {
  before(async () => {
    // The test schema is built from schema.prisma (it has VIDEO). Rebuild the enum as the database of the previous release has it.
    const s = `"${ADMIN_TEST_SCHEMA}"`;
    await client.$executeRawUnsafe(`ALTER TABLE ${s}."MediaAsset" ALTER COLUMN "kind" TYPE text USING "kind"::text`);
    await client.$executeRawUnsafe(`DROP TYPE ${s}."AssetKind"`);
    await client.$executeRawUnsafe(`CREATE TYPE ${s}."AssetKind" AS ENUM ('DOCUMENT', 'IMAGE')`);
    await client.$executeRawUnsafe(`ALTER TABLE ${s}."MediaAsset" ALTER COLUMN "kind" TYPE ${s}."AssetKind" USING "kind"::${s}."AssetKind"`);
  });

  test('is answered 503 MIGRATION_REQUIRED without naming tables or SQL; the stored file, the row and the audit entry do not exist', async () => {
    const before = { files: storedFiles().length, assets: await client.mediaAsset.count(), audit: await client.auditLog.count() };
    const res = await upload('video', 'clip.mp4', validMp4());
    assert.equal(res.status, 503, res.text);
    assert.equal(res.body.error.code, 'MIGRATION_REQUIRED');
    assert.ok(!/AssetKind|enum|22P02|PrismaClient/i.test(res.text), `no database detail in the answer: ${res.text}`);
    assert.deepEqual({ files: storedFiles().length, assets: await client.mediaAsset.count(), audit: await client.auditLog.count() }, before);
  });

  test('documents and images are not affected by the missing value', async () => {
    assert.equal((await upload('document', 'again.pdf', pdf())).status, 201);
  });
});
