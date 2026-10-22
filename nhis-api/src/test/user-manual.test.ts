import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_USER_MANUAL, MANUAL_VIDEO_FILES, manualEmbedUrl, validateSiteContent } from '@nhis/shared-types';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';
import { ctx as routeCtx } from './helpers';

let fixture: AdminTestDb; let db: PrismaClient; let directory: string;
let content: typeof import('../modules/admin-content'); let files: ReturnType<typeof import('../modules/files/files.service')['createFilesService']>;
let editor: { cookie: string; csrf: string }; let publisher: typeof editor;
async function request(handler: Function, method: string, body?: unknown, params?: Record<string, string>, session = editor): Promise<Response> {
  const headers: Record<string, string> = { Origin: 'http://127.0.0.1:5174' };
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return handler(new Request('http://localhost/api/v1/admin/site-content/manual', { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }), params ? routeCtx(params) : undefined);
}
before(async () => {
  fixture = await createAdminTestDb(); db = fixture.client; directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-manual-')); process.env.FILE_STORAGE_DIR = directory;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
  const { hashPassword } = await import('../common/admin'); const { POST } = await import('../app/api/v1/admin/auth/login/route');
  const sessions: { cookie: string; csrf: string }[] = [];
  for (const role of ['EDITOR', 'PUBLISHER'] as const) {
    await db.adminUser.create({ data: { email: `manual-${role.toLowerCase()}@test.example`, name: role, role, passwordHash: await hashPassword('Manual-Verification-Password-123') } });
    const response = await request(POST, 'POST', { email: `manual-${role.toLowerCase()}@test.example`, password: 'Manual-Verification-Password-123' }); assert.equal(response.status, 200);
    sessions.push({ cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: (await response.json()).csrfToken });
  }
  [editor, publisher] = sessions; content = await import('../modules/admin-content');
  const { createFilesService } = await import('../modules/files/files.service'); const { getStorage } = await import('../modules/storage'); files = createFilesService(db, getStorage);
});
after(async () => { await fixture?.cleanup(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('manual defaults contain exactly the four local videos in workflow order and validate without Drive links', () => {
  assert.equal(DEFAULT_USER_MANUAL.videos.length, 4); assert.ok(validateSiteContent('manual', DEFAULT_USER_MANUAL).ok);
  assert.deepEqual(DEFAULT_USER_MANUAL.videos.map(v => v.source), MANUAL_VIDEO_FILES.map(path => ({ type: 'builtIn', path })));
  assert.ok(!JSON.stringify(DEFAULT_USER_MANUAL).includes('drive.google'));
  for (const url of ['javascript:alert(1)', 'https://user:password@example.com/a', 'http://example.com']) {
    const bad = structuredClone(DEFAULT_USER_MANUAL); bad.videos[0].source = { type: 'external', url }; assert.equal(validateSiteContent('manual', bad).ok, false);
  }
  const bad = structuredClone(DEFAULT_USER_MANUAL); bad.videos[0].source = { type: 'builtIn', path: '../private.mp4' }; assert.equal(validateSiteContent('manual', bad).ok, false);
  assert.equal(manualEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(manualEmbedUrl('https://drive.google.com/file/d/abcDEF012345/view'), 'https://drive.google.com/file/d/abcDEF012345/preview');
  assert.equal(manualEmbedUrl('https://drive.google.com.evil.example/file/d/abcDEF012345/view'), null);
});
test('MP4 upload is private until manual publication; authorized preview, ranges, conflicts and reference removal', async () => {
  const bytes = fs.readFileSync(path.resolve('../nhis-client/public', MANUAL_VIDEO_FILES[3]));
  const form = new FormData(); form.set('kind', 'video'); form.set('file', new File([bytes], 'claims.mp4', { type: 'video/mp4' }));
  const upload = await request(content.uploadFile, 'POST', form); assert.equal(upload.status, 201, await upload.clone().text()); const asset = (await upload.json()).data;
  assert.equal(asset.kind, 'VIDEO'); assert.equal(asset.mimeType, 'video/mp4');
  await assert.rejects(files.serve(asset.id));
  const values = structuredClone(DEFAULT_USER_MANUAL); values.title.en = 'Private manual draft'; values.videos[0].source = { type: 'upload', assetId: asset.id };
  let saved = await request(content.siteContentRoutes.put, 'PUT', { values, expectedVersion: 0 }, { id: 'manual' }); assert.equal(saved.status, 200); let version = (await saved.json()).data.meta.version;
  await assert.rejects(files.serve(asset.id));
  const { siteContentRepository } = await import('../modules/site-content/site-content.repository'); assert.equal((await siteContentRepository.getPublished()).manual.title.en, 'User Manual');
  const preview = await request(content.previewSiteContent, 'GET'); assert.equal(preview.status, 200); assert.equal((await preview.json()).data.manual.title.en, values.title.en);
  const denied = await request(content.siteContentRoutes.action, 'POST', { expectedVersion: version }, { id: 'manual', action: 'publish' }); assert.equal(denied.status, 403);
  const published = await request(content.siteContentRoutes.action, 'POST', { expectedVersion: version }, { id: 'manual', action: 'publish' }, publisher); assert.equal(published.status, 200); version = (await published.json()).data.meta.version;
  const ranged = await files.serve(asset.id, new Request('http://localhost/file', { headers: { Range: 'bytes=10-29' } })); assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('content-range'), `bytes 10-29/${bytes.length}`); assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), bytes.subarray(10, 30));
  const suffix = await files.serve(asset.id, new Request('http://localhost/file', { headers: { Range: 'bytes=-10' } })); assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-10));
  const invalid = await files.serve(asset.id, new Request('http://localhost/file', { headers: { Range: `bytes=${bytes.length}-` } })); assert.equal(invalid.status, 416);
  const head = await files.serve(asset.id, new Request('http://localhost/file', { method: 'HEAD' })); assert.equal((await head.arrayBuffer()).byteLength, 0);
  const conflict = await request(content.siteContentRoutes.put, 'PUT', { values, expectedVersion: 0 }, { id: 'manual' }); assert.equal(conflict.status, 409);
  saved = await request(content.siteContentRoutes.put, 'PUT', { values: DEFAULT_USER_MANUAL, expectedVersion: version }, { id: 'manual' }); assert.equal(saved.status, 200); version = (await saved.json()).data.meta.version;
  await request(content.siteContentRoutes.action, 'POST', { expectedVersion: version }, { id: 'manual', action: 'publish' }, publisher);
  await assert.rejects(files.serve(asset.id));
});


