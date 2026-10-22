/**
 * Resumed security review, deployment state "migrations applied, privileges not granted yet": the runtime database role
 * (DATABASE_URL) can use the old tables but has no rights on the two new ones (SiteContent, ContentImport). That is the state
 * the operator pack's step 3 checks for ("every value must be t") and step 3b repairs, so it must not take the public site down:
 * the public endpoints answer from the built-in content exactly as they do before the migration, files keep being served, and the
 * Admin answers 503 MIGRATION_REQUIRED instead of a bare 500. Real PostgreSQL schema; the rights are taken away from the
 * owner role the test connects as (an owner may revoke its own rights), which makes PostgreSQL answer "permission denied".
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_SITE_CONTENT } from '@nhis/shared-types';
import { createAdminTestDb, ADMIN_TEST_SCHEMA, type AdminTestDb } from './admin-test-db';
import { ctx } from './helpers';

const ORIGIN = 'http://127.0.0.1:5174';
const PASSWORD = 'Editor-Passphrase-Long-8';

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;
/* eslint-disable @typescript-eslint/no-explicit-any */
const h: Record<string, any> = {};
let session: { cookie: string; csrf: string };

async function call(handler: (r: Request, c?: any) => Promise<Response>, url: string, init: { method?: string; params?: Record<string, string>; json?: unknown; form?: FormData; admin?: boolean } = {}): Promise<{ status: number; body: any; text: string }> {
  const headers: Record<string, string> = {};
  if (init.admin) Object.assign(headers, { Origin: ORIGIN, Cookie: session.cookie, 'X-CSRF-Token': session.csrf });
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  const response = await handler(new Request(`http://localhost${url}`, { method: init.method ?? 'GET', headers, body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined) }), init.params ? ctx(init.params) : undefined);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: response.status, body, text };
}

before(async () => {
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-review-privileges-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  process.env.ADMIN_IMPORT_SIGNING_KEY = 'review-privileges-key-0123456789abcdef-0123456789';
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  const { hashPassword } = await import('../common/admin');
  await client.adminUser.create({ data: { email: 'editor@privileges.example', name: 'Editor', role: 'EDITOR', passwordHash: await hashPassword(PASSWORD) } });
  await client.announcement.create({ data: { id: 'notice-1', kind: 'general', severity: 'notice', messageEn: [{ type: 'text', text: 'Hello' }], messageTa: [], status: 'PUBLISHED' } });
  await client.mediaAsset.create({ data: { id: 'asset-unreferenced-1', kind: 'IMAGE', storageKey: `${'c'.repeat(32)}.png`, originalName: 'logo.png', mimeType: 'image/png', bytes: 10, sha256: '0'.repeat(64) } });
  Object.assign(h, {
    login: await import('../app/api/v1/admin/auth/login/route'), site: await import('../app/api/v1/site/route'), siteContent: await import('../app/api/v1/site-content/route'),
    files: await import('../app/api/v1/files/[assetId]/route'), scItem: await import('../app/api/v1/admin/site-content/[id]/route'),
    scPreview: await import('../app/api/v1/admin/site-content/preview/route'), confirm: await import('../app/api/v1/admin/imports/confirm/route'),
    history: await import('../app/api/v1/admin/imports/route'), docDelete: await import('../app/api/v1/admin/documents/[id]/route'),
  });
  const login = await h.login.POST(new Request('http://localhost/api/v1/admin/auth/login', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'editor@privileges.example', password: PASSWORD }) }));
  assert.equal(login.status, 200);
  session = { cookie: (login.headers.get('set-cookie') ?? '').split(';')[0], csrf: ((await login.json()) as { csrfToken: string }).csrfToken };
  // The state under test: no rights on the two new tables.
  for (const table of ['SiteContent', 'ContentImport']) await client.$executeRawUnsafe(`REVOKE ALL ON TABLE "${ADMIN_TEST_SCHEMA}"."${table}" FROM CURRENT_USER`);
});
after(async () => {
  for (const table of ['SiteContent', 'ContentImport']) await client.$executeRawUnsafe(`GRANT ALL ON TABLE "${ADMIN_TEST_SCHEMA}"."${table}" TO CURRENT_USER`).catch(() => undefined);
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
  delete process.env.ADMIN_IMPORT_SIGNING_KEY;
});

test('the premise: the database really refuses the new tables to this role and keeps the old ones', async () => {
  await assert.rejects(client.siteContent.findMany(), /permission denied/i);
  await assert.rejects(client.contentImport.findMany(), /permission denied/i);
  assert.equal(await client.announcement.count(), 1);
});

describe('public endpoints', () => {
  test('GET /site-content answers 200 with the built-in content', async () => {
    const res = await call(h.siteContent.GET, '/api/v1/site-content');
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.header.helplines[0].id, DEFAULT_SITE_CONTENT.header.helplines[0].id);
  });

  test('GET /site answers 200 with the announcements and the built-in facts, never 500', async () => {
    const res = await call(h.site.GET, '/api/v1/site');
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.data.announcements.map((a: { id: string }) => a.id), ['notice-1']);
    assert.ok(res.body.data.helplines.length > 0);
  });

  test('a file that no published record uses is 404, not 500', async () => {
    const res = await call(h.files.GET, '/api/v1/files/asset-unreferenced-1', { params: { assetId: 'asset-unreferenced-1' } });
    assert.equal(res.status, 404, res.text);
  });
});

describe('admin endpoints', () => {
  test('saving a site-content document, the preview, confirming an import and the import history are 503 MIGRATION_REQUIRED without database detail', async () => {
    const save = await call(h.scItem.PUT, '/api/v1/admin/site-content/footer', { method: 'PUT', admin: true, params: { id: 'footer' }, json: { values: DEFAULT_SITE_CONTENT.footer, expectedVersion: 0 } });
    const history = await call(h.history.GET, '/api/v1/admin/imports', { admin: true });
    for (const [name, res] of [['save', save], ['history', history]] as const) {
      assert.equal(res.status, 503, `${name}: ${res.text}`);
      assert.equal(res.body.error.code, 'MIGRATION_REQUIRED', name);
      assert.ok(!/permission denied|SiteContent|ContentImport|42501|PrismaClient/i.test(res.text), `${name}: no database detail: ${res.text}`);
    }
    const preview = await call(h.scPreview.GET, '/api/v1/admin/site-content/preview', { admin: true });
    assert.equal(preview.status, 200, preview.text);
    assert.equal(preview.body.data.header.helplines[0].id, DEFAULT_SITE_CONTENT.header.helplines[0].id, 'the preview shows the built-in content');
  });
});
