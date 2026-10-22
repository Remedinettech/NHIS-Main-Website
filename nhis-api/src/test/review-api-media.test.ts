/**
 * Independent review of the media pipeline of the User Manual (VIDEO and PDF assets) against a real PostgreSQL schema,
 * through the real route files with real sessions: uploads, the public and the Admin file routes, Range handling, the rule
 * "public only while the live, visible, PUBLISHED manual references the file", the asset kind rules of every module that
 * takes an asset id, and the clean-up of orphaned files.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_SITE_CONTENT, DEFAULT_USER_MANUAL, type UserManualContent } from '@nhis/shared-types';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';
import { ctx } from './helpers';
import { validMp4 } from './review-mp4';

const ORIGIN = 'http://127.0.0.1:5174';
const PASSWORDS = { EDITOR: 'Editor-Passphrase-Long-2', PUBLISHER: 'Publisher-Passphrase-Long-3' } as const;

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;
/* eslint-disable @typescript-eslint/no-explicit-any */
const h: Record<string, any> = {};
interface Session { cookie: string; csrf: string }
interface Res { status: number; body: any; headers: Headers; text: string; bytes: Buffer }
const sessions = {} as Record<keyof typeof PASSWORDS, Session>;

async function send(handler: (r: Request, c?: any) => Promise<Response>, method: string, url: string, opts: { session?: Session; body?: unknown; form?: FormData; params?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { Origin: ORIGIN, ...opts.headers };
  if (opts.session) { headers.Cookie = opts.session.cookie; headers['X-CSRF-Token'] = opts.session.csrf; }
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const response = await handler(new Request(`http://localhost${url}`, { method, headers, body }), opts.params ? ctx(opts.params) : undefined);
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  return { status: response.status, body: parsed, headers: response.headers, text, bytes };
}
const route = async (p: string) => import(`../app/api/v1/${p}/route`);
async function login(role: keyof typeof PASSWORDS): Promise<Session> {
  const res = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: `${role.toLowerCase()}@media.example`, password: PASSWORDS[role] } });
  assert.equal(res.status, 200, res.text);
  return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], csrf: res.body.csrfToken };
}

before(async () => {
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-review-media-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  const { hashPassword } = await import('../common/admin');
  for (const role of ['EDITOR', 'PUBLISHER'] as const) {
    await client.adminUser.create({ data: { email: `${role.toLowerCase()}@media.example`, name: role, role, passwordHash: await hashPassword(PASSWORDS[role]) } });
  }
  Object.assign(h, {
    login: await route('admin/auth/login'), uploads: await route('admin/uploads'),
    adminFile: await route('admin/files/[assetId]'), pubFile: await route('files/[assetId]'),
    scItem: await route('admin/site-content/[id]'), scAction: await route('admin/site-content/[id]/[action]'),
    docs: await route('admin/documents'), doc: await route('admin/documents/[id]'), docAction: await route('admin/documents/[id]/[action]'),
    gallery: await route('admin/gallery'), galleryItem: await route('admin/gallery/[id]'), galleryAction: await route('admin/gallery/[id]/[action]'),
    page: await route('admin/pages/[id]'),
    preview: await route('admin/imports/preview'),
    siteContent: await route('site-content'),
    workbook: await import('../modules/imports/workbook'),
  });
  for (const role of ['EDITOR', 'PUBLISHER'] as const) sessions[role] = await login(role);
});
after(async () => {
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ fixtures */

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const png = (w = 40, hh = 20): Buffer => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(hh), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
const pdf = (extra = ''): Buffer => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n${extra}%%EOF`);
async function upload(who: keyof typeof PASSWORDS, kind: 'image' | 'document' | 'video', name: string, bytes: Uint8Array): Promise<Res> {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', new File([bytes as unknown as BlobPart], name));
  return send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: sessions[who], form });
}
const asset = async (kind: 'image' | 'document' | 'video', name: string, bytes: Uint8Array): Promise<{ id: string; bytes: Uint8Array; storageKey: string }> => {
  const res = await upload('EDITOR', kind, name, bytes);
  assert.equal(res.status, 201, res.text);
  const row = await client.mediaAsset.findUniqueOrThrow({ where: { id: res.body.data.id } });
  return { id: row.id, bytes, storageKey: row.storageKey };
};
const manualWith = (patch: (doc: UserManualContent) => void): UserManualContent => { const doc = structuredClone(DEFAULT_USER_MANUAL); patch(doc); return doc; };
const saveManual = (who: keyof typeof PASSWORDS, values: unknown, expectedVersion: number) =>
  send(h.scItem.PUT, 'PUT', '/api/v1/admin/site-content/manual', { session: sessions[who], params: { id: 'manual' }, body: { values, expectedVersion } });
const publishManual = (expectedVersion: number) =>
  send(h.scAction.POST, 'POST', '/api/v1/admin/site-content/manual/publish', { session: sessions.PUBLISHER, params: { id: 'manual', action: 'publish' }, body: { expectedVersion } });
const manualVersion = async () => (await client.siteContent.findUnique({ where: { id: 'manual' } }))?.version ?? 0;
/** Saves and publishes the manual in one go (the editor saves, the publisher publishes). */
async function putManualLive(values: UserManualContent): Promise<void> {
  const saved = await saveManual('EDITOR', values, await manualVersion());
  assert.equal(saved.status, 200, saved.text);
  const published = await publishManual(saved.body.data.meta.version);
  assert.equal(published.status, 200, published.text);
}
const pubFile = (id: string, headers: Record<string, string> = {}, method = 'GET') => send(h.pubFile.GET, method, `/api/v1/files/${id}`, { params: { assetId: id }, headers });
const adminFile = (id: string, headers: Record<string, string> = {}, session: Session | null = sessions.EDITOR, method = 'GET') => send(h.adminFile.GET, method, `/api/v1/admin/files/${id}`, { params: { assetId: id }, headers, session: session ?? undefined });

/* ------------------------------------------------------------------ range requests on both routes */

describe('Range requests on /files/:id and /admin/files/:id', () => {
  let video: { id: string; bytes: Uint8Array };
  before(async () => {
    video = await asset('video', 'Manual video.mp4', validMp4(3000));
    await putManualLive(manualWith((doc) => { doc.videos[0].source = { type: 'upload', assetId: video.id }; }));
  });
  const full = () => Buffer.from(video.bytes);

  for (const [name, get] of [['public', (headers: Record<string, string>, method = 'GET') => pubFile(video.id, headers, method)], ['admin', (headers: Record<string, string>, method = 'GET') => adminFile(video.id, headers, sessions.EDITOR, method)]] as const) {
    test(`${name}: several ranges are answered with the whole file (200), whatever their spelling`, async () => {
      for (const range of ['bytes=0-1,5-6', 'bytes=0-1, 5-6', 'bytes=0-0,-1', 'BYTES=0-1,5-6', 'bytes=0-,5-']) {
        const res = await get({ Range: range });
        assert.equal(res.status, 200, `${range}: ${res.status}`);
        assert.equal(res.headers.get('content-range'), null);
        assert.equal(res.headers.get('content-length'), String(full().length));
        assert.deepEqual(res.bytes, full());
      }
    });

    test(`${name}: single ranges give 206 with the right bytes; unsatisfiable and malformed ranges give 416 with the size`, async () => {
      const part = await get({ Range: 'bytes=10-29' });
      assert.equal(part.status, 206);
      assert.equal(part.headers.get('content-range'), `bytes 10-29/${full().length}`);
      assert.deepEqual(part.bytes, full().subarray(10, 30));
      assert.deepEqual((await get({ Range: 'bytes=-10' })).bytes, full().subarray(-10));
      assert.deepEqual((await get({ Range: `bytes=${full().length - 3}-99999999999` })).bytes, full().subarray(-3));
      for (const range of [`bytes=${full().length}-`, 'bytes=5-2', 'bytes=-0', 'bytes=a-b', 'bytes=-1-5', 'garbage']) {
        const res = await get({ Range: range });
        assert.equal(res.status, 416, range);
        assert.equal(res.headers.get('content-range'), `bytes */${full().length}`);
        assert.equal(res.bytes.length, 0);
      }
    });

    test(`${name}: If-Range only with the exact strong validator; HEAD and conditional requests`, async () => {
      const etag = (await get({})).headers.get('etag') as string;
      assert.match(etag, /^"[0-9a-f]{64}"$/);
      assert.equal((await get({ Range: 'bytes=0-3', 'If-Range': etag })).status, 206);
      assert.equal((await get({ Range: 'bytes=0-3', 'If-Range': `W/${etag}` })).status, 200);
      assert.equal((await get({ Range: 'bytes=0-3', 'If-Range': '"stale"' })).status, 200);
      const head = await get({ Range: 'bytes=0-3' }, 'HEAD');
      assert.equal(head.status, 206);
      assert.equal(head.headers.get('content-length'), '4');
      assert.equal(head.bytes.length, 0);
      const headAll = await get({ Range: 'bytes=0-1,5-6' }, 'HEAD');
      assert.equal(headAll.status, 200);
      assert.equal(headAll.headers.get('content-length'), String(full().length));
    });

    test(`${name}: type from the stored record, nosniff, an inline encoded name, no cookies, never cached without revalidation`, async () => {
      const res = await get({});
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'video/mp4');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('accept-ranges'), 'bytes');
      assert.equal(res.headers.get('set-cookie'), null);
      assert.match(res.headers.get('cache-control') ?? '', name === 'public' ? /no-cache/ : /no-store/);
      assert.match(res.headers.get('content-disposition') ?? '', /^inline; filename="Manual video\.mp4"; filename\*=UTF-8''Manual%20video\.mp4$/);
    });
  }

  test('the Admin route needs a session; a public route request carries no cookie requirement', async () => {
    assert.equal((await adminFile(video.id, {}, null)).status, 401);
    const stale = await send(h.adminFile.GET, 'GET', `/api/v1/admin/files/${video.id}`, { params: { assetId: video.id }, headers: { Cookie: 'nhis_admin_session=bogus' } });
    assert.equal(stale.status, 401);
    assert.equal((await adminFile('does-not-exist-0000')).status, 404);
    assert.equal((await adminFile('../../etc/passwd')).status, 400);
    const open = await pubFile(video.id);
    assert.equal(open.status, 200);
    assert.equal(open.headers.get('set-cookie'), null);
  });

  test('an If-None-Match that matches answers 304 without a body (public)', async () => {
    const etag = (await pubFile(video.id)).headers.get('etag') as string;
    const res = await pubFile(video.id, { 'If-None-Match': etag, Range: 'bytes=0-1' });
    assert.equal(res.status, 304);
    assert.equal(res.bytes.length, 0);
  });
});

/* ------------------------------------------------------------------ who may fetch a file */

describe('public files: only the live, visible and PUBLISHED manual makes an upload public', () => {
  test('a draft, an unreferenced upload, a hidden entry and a replaced file are all 404; the live visible reference serves it', async () => {
    const video = await asset('video', 'visible.mp4', validMp4(500));
    const manualPdf = await asset('document', 'manual.pdf', pdf());
    const loose = await asset('video', 'loose.mp4', validMp4(501));
    const doc = manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: video.id }; d.manual.source = { type: 'upload', assetId: manualPdf.id }; });
    assert.equal((await pubFile(video.id)).status, 404, 'uploaded, not referenced');

    // saved as a draft only
    const saved = await saveManual('EDITOR', doc, await manualVersion());
    assert.equal(saved.status, 200, saved.text);
    for (const id of [video.id, manualPdf.id, loose.id]) assert.equal((await pubFile(id)).status, 404, `draft ${id}`);
    assert.equal((await adminFile(video.id)).status, 200, 'staff can still preview the draft');

    // published
    assert.equal((await publishManual(saved.body.data.meta.version)).status, 200);
    assert.equal((await pubFile(video.id)).status, 200);
    assert.equal((await pubFile(manualPdf.id)).status, 200);
    assert.equal((await pubFile(loose.id)).status, 404, 'a file that is not part of the manual stays private');
    const publicManual = (await send(h.siteContent.GET, 'GET', '/api/v1/site-content')).body.data.manual;
    assert.equal(publicManual.videos[0].source.assetId, video.id);

    // a pending draft that adds the loose file does not publish it
    const next = manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: video.id }; d.videos[1].source = { type: 'upload', assetId: loose.id }; d.manual.source = { type: 'upload', assetId: manualPdf.id }; });
    const pending = await saveManual('EDITOR', next, await manualVersion());
    assert.equal(pending.status, 200, pending.text);
    assert.equal((await pubFile(loose.id)).status, 404, 'referenced by a draft only');

    // hiding an entry withdraws its file; so does hiding the manual
    const hidden = manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: video.id }; d.videos[0].visible = false; d.manual.source = { type: 'upload', assetId: manualPdf.id }; d.manual.visible = false; });
    await saveManual('EDITOR', hidden, await manualVersion());
    assert.equal((await publishManual(await manualVersion())).status, 200);
    assert.equal((await pubFile(video.id)).status, 404, 'hidden video');
    assert.equal((await pubFile(manualPdf.id)).status, 404, 'hidden manual');

    // visible again, then replaced by the built-in files: the uploads are private again
    await putManualLive(manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: video.id }; d.manual.source = { type: 'upload', assetId: manualPdf.id }; }));
    assert.equal((await pubFile(video.id)).status, 200);
    await putManualLive(DEFAULT_USER_MANUAL);
    assert.equal((await pubFile(video.id)).status, 404);
    assert.equal((await pubFile(manualPdf.id)).status, 404);
  });

  test('the manual cannot reference an asset of the wrong kind, a missing asset or a missing stored file', async () => {
    const video = await asset('video', 'kind.mp4', validMp4(520));
    const manualPdf = await asset('document', 'kind.pdf', pdf());
    const image = await asset('image', 'kind.png', png());
    const version = await manualVersion();
    const attempts: Array<[string, UserManualContent]> = [
      ['video as the manual PDF', manualWith((d) => { d.manual.source = { type: 'upload', assetId: video.id }; })],
      ['PDF as a video', manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: manualPdf.id }; })],
      ['image as a video', manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: image.id }; })],
      ['image as the manual PDF', manualWith((d) => { d.manual.source = { type: 'upload', assetId: image.id }; })],
      ['unknown id', manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: 'doesnotexist12345' }; })],
      ['an external manual PDF', manualWith((d) => { (d.manual as any).source = { type: 'external', url: 'https://example.org/a.pdf' }; })],
      ['a path outside the shipped files', manualWith((d) => { d.videos[0].source = { type: 'builtIn', path: '../../etc/passwd' }; })],
      ['javascript url', manualWith((d) => { d.videos[0].source = { type: 'external', url: 'javascript:alert(1)' }; })],
      ['data url', manualWith((d) => { d.videos[0].source = { type: 'external', url: 'data:text/html;base64,PHNjcmlwdD4=' }; })],
      ['http url', manualWith((d) => { d.videos[0].source = { type: 'external', url: 'http://example.org/v.mp4' }; })],
      ['credentials in the url', manualWith((d) => { d.videos[0].source = { type: 'external', url: 'https://user:pw@example.org/v.mp4' }; })],
    ];
    for (const [name, doc] of attempts) {
      const res = await saveManual('EDITOR', doc, version);
      assert.equal(res.status, 400, `${name}: ${res.status} ${res.text.slice(0, 160)}`);
    }
    // a stored file that vanished from the disk is reported at save time
    const gone = await asset('video', 'gone.mp4', validMp4(530));
    fs.rmSync(path.join(storageDir, gone.storageKey));
    const res = await saveManual('EDITOR', manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: gone.id }; }), version);
    assert.equal(res.status, 400, res.text);
  });

  test('a published reference whose stored file has disappeared is a 404 without any path in the answer', async () => {
    const video = await asset('video', 'vanish.mp4', validMp4(540));
    await putManualLive(manualWith((d) => { d.videos[0].source = { type: 'upload', assetId: video.id }; }));
    assert.equal((await pubFile(video.id)).status, 200);
    fs.rmSync(path.join(storageDir, video.storageKey));
    const res = await pubFile(video.id);
    assert.equal(res.status, 404);
    assert.ok(!res.text.includes(storageDir) && !res.text.includes(video.storageKey));
    await putManualLive(DEFAULT_USER_MANUAL);
  });

  test('hostile ids and an id of a VIDEO that is in no published record never reach a file', async () => {
    const video = await asset('video', 'private.mp4', validMp4(550));
    for (const id of [video.id.toUpperCase(), `${video.id}%00`, `${video.id}/../x`, `${video.id}.mp4`, ` ${video.id}`]) assert.equal((await pubFile(id)).status, 404, id);
    assert.equal((await pubFile(video.id)).status, 404);
    // the storage key is not an asset id
    assert.equal((await pubFile(video.storageKey.replace('.mp4', ''))).status, 404);
  });
});

/* ------------------------------------------------------------------ asset kinds everywhere */

describe('every module that takes an asset id checks its kind', () => {
  let video: { id: string };
  let manualPdf: { id: string };
  let image: { id: string };
  before(async () => {
    video = await asset('video', 'kinds.mp4', validMp4(560));
    manualPdf = await asset('document', 'kinds.pdf', pdf());
    image = await asset('image', 'kinds.png', png());
  });
  const documentValues = (assetId: string | null) => ({ category: 'enrolment-form', audience: 'all', sortOrder: 1, labelEn: 'L', labelTa: '', titleEn: 'T', titleTa: '', dateLabelEn: null, dateLabelTa: null, assetId, language: null, availabilityNote: null });

  test('documents accept only PDF assets: a VIDEO or an IMAGE is refused on create, on save of a draft and on save of a published record', async () => {
    for (const bad of [video.id, image.id, 'doesnotexist12345']) {
      const res = await send(h.docs.POST, 'POST', '/api/v1/admin/documents', { session: sessions.EDITOR, body: { values: documentValues(bad) } });
      assert.equal(res.status, 400, `${bad}: ${res.text.slice(0, 120)}`);
    }
    const created = await send(h.docs.POST, 'POST', '/api/v1/admin/documents', { session: sessions.EDITOR, body: { values: documentValues(manualPdf.id) } });
    assert.equal(created.status, 201, created.text);
    const id = created.body.data.id;
    const save = (assetId: string, version: number) => send(h.doc.PUT, 'PUT', `/api/v1/admin/documents/${id}`, { session: sessions.EDITOR, params: { id }, body: { values: documentValues(assetId), expectedVersion: version } });
    assert.equal((await save(video.id, 1)).status, 400);
    const published = await send(h.docAction.POST, 'POST', `/api/v1/admin/documents/${id}/publish`, { session: sessions.PUBLISHER, params: { id, action: 'publish' }, body: { expectedVersion: 1 } });
    assert.equal(published.status, 200, published.text);
    assert.equal((await save(video.id, 2)).status, 400, 'a published record cannot get a video draft either');
    assert.equal((await save(image.id, 2)).status, 400);
    // and a hand-made database row with the wrong kind cannot be published
    await client.document.update({ where: { id }, data: { draft: documentValues(video.id) as never } });
    const forced = await send(h.docAction.POST, 'POST', `/api/v1/admin/documents/${id}/publish`, { session: sessions.PUBLISHER, params: { id, action: 'publish' }, body: { expectedVersion: 2 } });
    assert.equal(forced.status, 400, forced.text);
  });

  test('gallery items accept only images', async () => {
    for (const bad of [video.id, manualPdf.id, 'doesnotexist12345']) {
      const res = await send(h.gallery.POST, 'POST', '/api/v1/admin/gallery', { session: sessions.EDITOR, body: { values: { titleEn: 'G', titleTa: '', assetId: bad } } });
      assert.equal(res.status, 400, `${bad}: ${res.text.slice(0, 120)}`);
    }
    assert.equal((await send(h.gallery.POST, 'POST', '/api/v1/admin/gallery', { session: sessions.EDITOR, body: { values: { titleEn: 'G', titleTa: '', assetId: image.id } } })).status, 201);
  });

  test('page pictures and the images of every site-content document accept only images', async () => {
    await client.page.create({ data: { slug: 'coverage', status: 'PUBLISHED', version: 1, publishedAt: new Date(), translations: { create: [{ locale: 'en', title: 'Coverage', sections: [] }] } } });
    const pageValues = (assetId: string) => ({ en: { title: 'Coverage', sections: [{ id: 's1', blocks: [{ type: 'image', assetId, alt: 'A picture' }] }] }, ta: null });
    for (const bad of [video.id, manualPdf.id]) {
      const res = await send(h.page.PUT, 'PUT', '/api/v1/admin/pages/coverage', { session: sessions.EDITOR, params: { id: 'coverage' }, body: { values: pageValues(bad), expectedVersion: 1 } });
      assert.equal(res.status, 400, `${bad}: ${res.text.slice(0, 160)}`);
    }
    assert.equal((await send(h.page.PUT, 'PUT', '/api/v1/admin/pages/coverage', { session: sessions.EDITOR, params: { id: 'coverage' }, body: { values: pageValues(image.id), expectedVersion: 1 } })).status, 200);
    for (const bad of [video.id, manualPdf.id]) {
      const header: any = structuredClone(DEFAULT_SITE_CONTENT.header);
      header.emblem = { assetId: bad, builtIn: null, alt: { en: 'Emblem', ta: '' }, width: null, height: null };
      const res = await send(h.scItem.PUT, 'PUT', '/api/v1/admin/site-content/header', { session: sessions.EDITOR, params: { id: 'header' }, body: { values: header, expectedVersion: 0 } });
      assert.equal(res.status, 400, `${bad}: ${res.text.slice(0, 160)}`);
    }
  });

  test('the Excel import refuses a VIDEO as a document file and as a partner logo', async () => {
    process.env.ADMIN_IMPORT_SIGNING_KEY = 'media-review-signing-key-0123456789abcdef-0123';
    const columns = h.workbook.columns as Record<string, string[]>;
    const ExcelJS = (await import('exceljs')).default;
    const run = async (module: string, row: Record<string, string>) => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Records');
      sheet.addRow(columns[module]);
      sheet.addRow(columns[module].map((c) => row[c] ?? ''));
      const form = new FormData();
      form.set('module', module);
      form.set('mode', 'create');
      form.set('file', new File([new Uint8Array(await book.xlsx.writeBuffer())], 'import.xlsx'));
      return send(h.preview.POST, 'POST', '/api/v1/admin/imports/preview', { session: sessions.EDITOR, form });
    };
    const docRow = (assetId: string) => ({ id: `imp-${assetId.slice(-6)}`, category: 'enrolment-form', audience: 'all', sortOrder: '1', labelEn: 'L', titleEn: 'T', assetId });
    for (const bad of [video.id, image.id]) assert.equal((await run('documents', docRow(bad))).body.valid, false, bad);
    assert.equal((await run('documents', docRow(manualPdf.id))).body.valid, true);
    const category = DEFAULT_SITE_CONTENT.partners.categories[0].id;
    const logoRow = (assetId: string) => ({ id: `logo-${assetId.slice(-6)}`, categoryId: category, nameEn: 'P', logoAssetId: assetId, altEn: 'Logo' });
    for (const bad of [video.id, manualPdf.id]) assert.equal((await run('partners', logoRow(bad))).body.valid, false, bad);
    assert.equal((await run('partners', logoRow(image.id))).body.valid, true);
  });
});

/* ------------------------------------------------------------------ clean-up of orphans */

describe('deleting a draft never deletes a file that other content still uses', () => {
  const galleryValues = (assetId: string, title = 'G') => ({ titleEn: title, titleTa: '', assetId, sortOrder: 1 });
  const createGallery = async (assetId: string, title = 'G'): Promise<{ id: string; version: number }> => {
    const res = await send(h.gallery.POST, 'POST', '/api/v1/admin/gallery', { session: sessions.EDITOR, body: { values: galleryValues(assetId, title) } });
    assert.equal(res.status, 201, res.text);
    return { id: res.body.data.id, version: res.body.data.meta.version };
  };
  const deleteGallery = (item: { id: string; version: number }) =>
    send(h.galleryItem.DELETE, 'DELETE', `/api/v1/admin/gallery/${item.id}?expectedVersion=${item.version}`, { session: sessions.PUBLISHER, params: { id: item.id } });
  const exists = (a: { storageKey: string }) => fs.existsSync(path.join(storageDir, a.storageKey));

  test('baseline: an upload that nothing else uses is removed with its only record', async () => {
    const image = await asset('image', 'solo.png', png(11, 11));
    const item = await createGallery(image.id);
    assert.equal((await deleteGallery(item)).status, 200);
    assert.equal(await client.mediaAsset.count({ where: { id: image.id } }), 0);
    assert.equal(exists(image), false);
  });

  test('a file that is also the PDF of the published manual survives the deletion of a draft document', async () => {
    const manualPdf = await asset('document', 'shared.pdf', pdf('% shared\n'));
    await putManualLive(manualWith((d) => { d.manual.source = { type: 'upload', assetId: manualPdf.id }; }));
    const created = await send(h.docs.POST, 'POST', '/api/v1/admin/documents', { session: sessions.EDITOR, body: { values: { category: 'enrolment-form', audience: 'all', sortOrder: 1, labelEn: 'L', labelTa: '', titleEn: 'T', titleTa: '', dateLabelEn: null, dateLabelTa: null, assetId: manualPdf.id, language: null, availabilityNote: null } } });
    assert.equal(created.status, 201, created.text);
    const id = created.body.data.id;
    const del = await send(h.doc.DELETE, 'DELETE', `/api/v1/admin/documents/${id}?expectedVersion=1`, { session: sessions.PUBLISHER, params: { id } });
    assert.equal(del.status, 200, del.text);
    assert.equal(await client.mediaAsset.count({ where: { id: manualPdf.id } }), 1);
    assert.equal(exists(manualPdf), true);
    assert.equal((await pubFile(manualPdf.id)).status, 200);
    await putManualLive(DEFAULT_USER_MANUAL);
  });

  test('a picture that a page uses (published text, or a pending draft of a page) survives the deletion of the gallery draft that shares it', async () => {
    await client.page.deleteMany({ where: { slug: 'coverage' } });
    const page = await client.page.create({ data: { slug: 'coverage', status: 'PUBLISHED', version: 1, publishedAt: new Date(), translations: { create: [{ locale: 'en', title: 'Coverage', sections: [] }] } } });
    const live = await asset('image', 'page-live.png', png(21, 12));
    const pending = await asset('image', 'page-draft.png', png(22, 12));
    await client.pageTranslation.update({ where: { pageId_locale: { pageId: page.id, locale: 'en' } }, data: { sections: [{ id: 's1', blocks: [{ type: 'image', assetId: live.id, alt: 'x' }] }] } });
    await client.page.update({ where: { id: page.id }, data: { draft: { en: { title: 'Coverage', sections: [{ id: 's1', blocks: [{ type: 'image', assetId: pending.id, alt: 'x' }] }] }, ta: null } } });
    for (const image of [live, pending]) {
      const item = await createGallery(image.id);
      assert.equal((await deleteGallery(item)).status, 200);
      assert.equal(await client.mediaAsset.count({ where: { id: image.id } }), 1, `${image.id} is still used by a page`);
      assert.equal(exists(image), true);
    }
  });

  test('a picture that is the pending draft of a published gallery item or document survives the deletion of another draft that shares it', async () => {
    const shared = await asset('image', 'shared-draft.png', png(23, 12));
    const own = await asset('image', 'own.png', png(24, 12));
    const published = await createGallery(own.id, 'Published');
    const publishedOk = await send(h.galleryAction.POST, 'POST', `/api/v1/admin/gallery/${published.id}/publish`, { session: sessions.PUBLISHER, params: { id: published.id, action: 'publish' }, body: { expectedVersion: published.version } });
    assert.equal(publishedOk.status, 200, publishedOk.text);
    const saved = await send(h.galleryItem.PUT, 'PUT', `/api/v1/admin/gallery/${published.id}`, { session: sessions.EDITOR, params: { id: published.id }, body: { values: galleryValues(shared.id, 'Published'), expectedVersion: 2 } });
    assert.equal(saved.status, 200, saved.text);
    const twin = await createGallery(shared.id, 'Twin');
    assert.equal((await deleteGallery(twin)).status, 200);
    assert.equal(await client.mediaAsset.count({ where: { id: shared.id } }), 1, 'still the pending draft of a published item');
    assert.equal(exists(shared), true);
  });
});

/* ------------------------------------------------------------------ uploads reach the route intact */

describe('uploads', () => {
  test('a 12 MB PDF arrives intact (size, bytes and SHA-256) and is served back byte for byte', async () => {
    const bytes = Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(12 * 1024 * 1024), Buffer.from('\n%%EOF')]);
    const res = await upload('EDITOR', 'document', 'twelve.pdf', bytes);
    assert.equal(res.status, 201, res.text.slice(0, 200));
    assert.equal(res.body.data.bytes, bytes.length);
    assert.equal(res.body.data.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    const back = await adminFile(res.body.data.id);
    assert.equal(back.status, 200);
    assert.ok(back.bytes.equals(bytes));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(storageDir, (await client.mediaAsset.findUniqueOrThrow({ where: { id: res.body.data.id } })).storageKey))).digest('hex'), res.body.data.sha256);
  });

  test('the largest accepted bodies (a 25 MiB PDF and a 25 MiB MP4) fit the upload route and the proxy limit configured for them; one byte more is refused', async () => {
    const pdfBytes = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(25 * 1024 * 1024 - 20, 0x20), Buffer.from('\n%%EOF')]);
    assert.equal(pdfBytes.length, 25 * 1024 * 1024 - 20 + 15);
    const exact = Buffer.concat([pdfBytes, Buffer.alloc(25 * 1024 * 1024 - pdfBytes.length, 0x20)]);
    assert.equal(exact.length, 25 * 1024 * 1024);
    assert.equal((await upload('EDITOR', 'document', 'max.pdf', exact)).status, 201);
    const over = await upload('EDITOR', 'document', 'over.pdf', Buffer.concat([exact, Buffer.from(' ')]));
    assert.equal(over.status, 413);
    assert.match(JSON.stringify(over.body), /larger than the 25 MB limit|too large/i);
    const mp4 = validMp4(25 * 1024 * 1024 - 28 - 28 - 8);
    assert.equal(mp4.length, 25 * 1024 * 1024);
    assert.equal((await upload('EDITOR', 'video', 'max.mp4', mp4)).status, 201);
    assert.equal((await upload('EDITOR', 'video', 'over.mp4', Buffer.concat([mp4, Buffer.alloc(8)]))).status, 413);
    // the multipart envelope of the largest upload stays under the 30 MB the proxy layer buffers
    const form = new FormData();
    form.set('kind', 'document');
    form.set('file', new File([new Uint8Array(exact)], 'max.pdf'));
    const envelope = Buffer.from(await new Request('http://localhost/', { method: 'POST', body: form }).arrayBuffer());
    const { default: nextConfig } = await import('../../next.config');
    const configured = (nextConfig.experimental as { proxyClientMaxBodySize?: string | number }).proxyClientMaxBodySize;
    const { createRequire } = await import('node:module');
    const bytesLib = createRequire(import.meta.url)('next/dist/compiled/bytes') as { parse: (value: string) => number };
    const limit = typeof configured === 'string' ? bytesLib.parse(configured) : (configured as number);
    assert.ok(limit >= envelope.length + 1024 * 1024, `proxyClientMaxBodySize ${limit} must exceed the largest upload body ${envelope.length}`);
    assert.ok(limit >= 16_000_000, 'the import confirm body (16 MB) must fit as well');
  });

  test('video uploads: only .mp4 files that are well-formed MP4s; the record says VIDEO and video/mp4 and the key is random', async () => {
    const ok = await upload('EDITOR', 'video', 'Narrated clip.mp4', validMp4());
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.body.data.kind, 'VIDEO');
    assert.equal(ok.body.data.mimeType, 'video/mp4');
    const row = await client.mediaAsset.findUniqueOrThrow({ where: { id: ok.body.data.id } });
    assert.match(row.storageKey, /^[0-9a-f]{32}\.mp4$/);
    assert.ok(!JSON.stringify(ok.body).includes(row.storageKey));
    for (const [kind, name, bytes] of [
      ['video', 'x.mp4', Buffer.from('%PDF-1.4\n%%EOF')], ['video', 'x.mov', validMp4()], ['video', 'x.mp4', validMp4().subarray(0, 60)], ['video', 'x.mp4', Buffer.alloc(0)],
      ['document', 'x.pdf', validMp4()], ['image', 'x.png', validMp4()], ['audio', 'x.mp4', validMp4()],
    ] as const) {
      const res = await upload('EDITOR', kind as never, name, bytes);
      assert.ok([400, 413, 415].includes(res.status), `${kind} ${name}: ${res.status}`);
    }
    // no session, no upload
    const form = new FormData();
    form.set('kind', 'video');
    form.set('file', new File([new Uint8Array(validMp4())], 'x.mp4'));
    assert.equal((await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { form })).status, 401);
    const before = await client.mediaAsset.count();
    const noCsrf = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { form, headers: { Cookie: sessions.EDITOR.cookie } });
    assert.equal(noCsrf.status, 403);
    assert.equal(await client.mediaAsset.count(), before);
  });
});
