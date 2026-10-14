/**
 * End-to-end flow against a real PostgreSQL schema (created and dropped by the owner role, never `public`):
 * admin sign-in -> draft -> publish -> public API -> archive/restore, uploads, settings, users, audit.
 * Route handlers are invoked in-process with real Request objects and cookies.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';
import { ctx } from './helpers';

const ORIGIN = 'http://127.0.0.1:5174';
const PASSWORDS = { ADMIN: 'Correct-Horse-Battery-1', EDITOR: 'Editor-Passphrase-Long-2', PUBLISHER: 'Publisher-Passphrase-Long-3' } as const;

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;

// Loaded after the global Prisma client is replaced with the test-schema client.
/* eslint-disable @typescript-eslint/no-explicit-any */
const h: Record<string, any> = {};

interface Session { cookie: string; csrf: string }
interface Res { status: number; body: any; headers: Headers }

async function send(handler: (r: Request, c?: any) => Promise<Response>, method: string, url: string, opts: { session?: Session; body?: unknown; form?: FormData; params?: Record<string, string>; headers?: Record<string, string>; csrf?: boolean } = {}): Promise<Res> {
  const headers: Record<string, string> = { Origin: ORIGIN, ...opts.headers };
  if (opts.session) {
    headers.Cookie = opts.session.cookie;
    if (opts.csrf !== false) headers['X-CSRF-Token'] = opts.session.csrf;
  }
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const response = await handler(new Request(`http://localhost${url}`, { method, headers, body }), opts.params ? ctx(opts.params) : undefined);
  const text = await response.clone().text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function login(role: keyof typeof PASSWORDS): Promise<Session> {
  const res = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: `${role.toLowerCase()}@test.example`, password: PASSWORDS[role] } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  assert.ok(cookie.includes('='), 'session cookie set');
  return { cookie, csrf: res.body.csrfToken };
}

const route = async (p: string) => import(`../app/api/v1/${p}/route`);

before(async () => {
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-e2e-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  process.env.UPLOAD_MAX_DOCUMENT_BYTES = String(200 * 1024);
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;

  const { hashPassword } = await import('../common/admin');
  for (const role of ['ADMIN', 'EDITOR', 'PUBLISHER'] as const) {
    await client.adminUser.create({ data: { email: `${role.toLowerCase()}@test.example`, name: `${role} Tester`, role, passwordHash: await hashPassword(PASSWORDS[role]) } });
  }
  // Import the real content into the isolated schema (also proves the import works on an empty database).
  const { runImport, defaultSources } = await import('../../prisma/import/import');
  const { createStorageAdapter } = await import('../modules/storage');
  await runImport(client, { ...defaultSources(), storage: createStorageAdapter(), log: () => undefined });

  Object.assign(h, {
    login: await route('admin/auth/login'), session: await route('admin/auth/session'), logout: await route('admin/auth/logout'),
    hospitals: await route('admin/hospitals'), hospital: await route('admin/hospitals/[id]'), hospitalAction: await route('admin/hospitals/[id]/[action]'),
    pages: await route('admin/pages'), page: await route('admin/pages/[id]'), pageAction: await route('admin/pages/[id]/[action]'), pagePreview: await route('admin/pages/[id]/preview'),
    documents: await route('admin/documents'), document: await route('admin/documents/[id]'), documentAction: await route('admin/documents/[id]/[action]'),
    contacts: await route('admin/contacts'), contact: await route('admin/contacts/[id]'), contactAction: await route('admin/contacts/[id]/[action]'), contactDirs: await route('admin/contacts/directories'),
    announcements: await route('admin/announcements'), announcement: await route('admin/announcements/[id]'), announcementAction: await route('admin/announcements/[id]/[action]'),
    gallery: await route('admin/gallery'), galleryItem: await route('admin/gallery/[id]'), galleryAction: await route('admin/gallery/[id]/[action]'),
    uploads: await route('admin/uploads'), adminFile: await route('admin/files/[assetId]'),
    settings: await route('admin/settings'), users: await route('admin/users'), user: await route('admin/users/[id]'), audit: await route('admin/audit'),
    pubHospitals: await route('hospitals'), pubPage: await route('pages/[slug]'), pubDocuments: await route('documents'), pubContact: await route('contacts/[directory]'),
    pubSite: await route('site'), pubGallery: await route('gallery'), pubFile: await route('files/[assetId]'), pubStats: await route('stats'),
  });
});

after(async () => {
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
});

const pdfBytes = (extra = ''): Uint8Array => new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n${extra}\n%%EOF`);
const pngBytes = (): Uint8Array => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const formWith = (kind: string, name: string, bytes: Uint8Array, type = 'application/octet-stream') => {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', new File([bytes as unknown as BlobPart], name, { type }));
  return form;
};

const hospitalValues = (over: Record<string, string> = {}) => ({
  nameEn: 'E2E TEST HOSPITAL', nameTa: 'சோதனை மருத்துவமனை', addressEn: '1 Test Street, Chennai', addressTa: '1 சோதனைத் தெரு, சென்னை',
  districtEn: 'Chennai', districtTa: 'சென்னை', stateEn: 'Tamil Nadu', stateTa: 'தமிழ்நாடு', postcode: '600001', category: 'A', type: 'Private',
  specialty: 'General Medicine', contact: '044-12345678', mapUrl: 'https://maps.google.com/?q=13.08,80.27', ...over,
});

describe('authentication and authorization', () => {
  test('wrong password is rejected; unauthenticated admin calls are 401; the demo marker is not accepted', async () => {
    const bad = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: 'admin@test.example', password: 'wrong-password-123' } });
    assert.equal(bad.status, 401);
    assert.equal((await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals')).status, 401);
    const demo = await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals', { headers: { Cookie: 'nhis-admin.demo-session=1', 'X-Demo-Session': '1', Authorization: 'Bearer demo' } });
    assert.equal(demo.status, 401);
    assert.deepEqual((await send(h.session.GET, 'GET', '/api/v1/admin/auth/session')).body, { authenticated: false });
  });

  test('login sets an HttpOnly cookie; session works; mutations need CSRF; logout invalidates the session', async () => {
    const res = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: 'editor@test.example', password: PASSWORDS.EDITOR } });
    const setCookie = res.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=(Lax|Strict)/i);
    const session: Session = { cookie: setCookie.split(';')[0], csrf: res.body.csrfToken };
    assert.equal((await send(h.session.GET, 'GET', '/api/v1/admin/auth/session', { session })).body.authenticated, true);
    const noCsrf = await send(h.hospitals.POST, 'POST', '/api/v1/admin/hospitals', { session, csrf: false, body: { values: hospitalValues() } });
    assert.equal(noCsrf.status, 403);
    const badOrigin = await send(h.hospitals.POST, 'POST', '/api/v1/admin/hospitals', { session, headers: { Origin: 'https://evil.example' }, body: { values: hospitalValues() } });
    assert.equal(badOrigin.status, 403);
    assert.equal((await send(h.logout.POST, 'POST', '/api/v1/admin/auth/logout', { session })).status, 200);
    assert.deepEqual((await send(h.session.GET, 'GET', '/api/v1/admin/auth/session', { session })).body, { authenticated: false });
    assert.equal((await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals', { session })).status, 401);
  });

  test('repeated failures are rate limited', async () => {
    let last = 0;
    for (let i = 0; i < 7; i += 1) {
      last = (await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { headers: { 'X-Forwarded-For': '203.0.113.9' }, body: { email: 'publisher@test.example', password: `wrong-password-${i}x` } })).status;
    }
    assert.equal(last, 429);
  });
});

describe('hospitals: draft, publish, edit, archive', () => {
  let editor: Session;
  let publisher: Session;
  let id = '';
  let version = 0;

  before(async () => {
    editor = await login('EDITOR');
    publisher = await login('PUBLISHER');
  });

  const publicNames = async (q: string) => {
    const r = await send(h.pubHospitals.GET, 'GET', `/api/v1/hospitals?q=${encodeURIComponent(q)}`);
    return (r.body.data as Array<{ name: { en: string; ta: string } }>).map((x) => x.name.en);
  };

  test('validation errors are field-specific', async () => {
    const res = await send(h.hospitals.POST, 'POST', '/api/v1/admin/hospitals', { session: editor, body: { values: hospitalValues({ nameEn: '', mapUrl: 'http://evil.example/x' }) } });
    assert.equal(res.status, 400);
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
    assert.ok(fields.includes('nameEn') && fields.includes('mapUrl'));
  });

  test('an editor creates a draft that stays private; an editor cannot publish', async () => {
    const res = await send(h.hospitals.POST, 'POST', '/api/v1/admin/hospitals', { session: editor, body: { values: hospitalValues() } });
    assert.equal(res.status, 201);
    id = res.body.data.id;
    version = res.body.data.meta.version;
    assert.equal(res.body.data.meta.status, 'DRAFT');
    assert.deepEqual(await publicNames('E2E TEST HOSPITAL'), []);
    const denied = await send(h.hospitalAction.POST, 'POST', `/api/v1/admin/hospitals/${id}/publish`, { session: editor, params: { id, action: 'publish' }, body: { expectedVersion: version } });
    assert.equal(denied.status, 403);
  });

  test('a publisher publishes; the public site shows it with Tamil intact', async () => {
    const res = await send(h.hospitalAction.POST, 'POST', `/api/v1/admin/hospitals/${id}/publish`, { session: publisher, params: { id, action: 'publish' }, body: { expectedVersion: version } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    version = res.body.data.meta.version;
    assert.deepEqual(await publicNames('E2E TEST HOSPITAL'), ['E2E TEST HOSPITAL']);
    const pub = await send(h.pubHospitals.GET, 'GET', `/api/v1/hospitals?q=${encodeURIComponent('சோதனை')}`);
    assert.equal(pub.body.data[0].name.ta, 'சோதனை மருத்துவமனை');
  });

  test('editing a published hospital is a private draft until published; stale versions conflict', async () => {
    const save = await send(h.hospital.PUT, 'PUT', `/api/v1/admin/hospitals/${id}`, { session: editor, params: { id }, body: { expectedVersion: version, values: hospitalValues({ nameEn: 'E2E RENAMED HOSPITAL', nameTa: 'மறுபெயரிடப்பட்ட மருத்துவமனை' }) } });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    assert.equal(save.body.data.meta.hasDraft, true);
    assert.equal(save.body.data.values.nameEn, 'E2E RENAMED HOSPITAL');
    assert.equal(save.body.data.published.nameEn, 'E2E TEST HOSPITAL');
    assert.deepEqual(await publicNames('E2E'), ['E2E TEST HOSPITAL']);
    const stale = await send(h.hospital.PUT, 'PUT', `/api/v1/admin/hospitals/${id}`, { session: editor, params: { id }, body: { expectedVersion: version, values: hospitalValues({ nameEn: 'SECOND EDITOR' }) } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'CONFLICT');
    assert.ok(stale.body.error.current);
    version = save.body.data.meta.version;
    const pub = await send(h.hospitalAction.POST, 'POST', `/api/v1/admin/hospitals/${id}/publish`, { session: publisher, params: { id, action: 'publish' }, body: { expectedVersion: version } });
    assert.equal(pub.status, 200);
    version = pub.body.data.meta.version;
    assert.deepEqual(await publicNames('E2E'), ['E2E RENAMED HOSPITAL']);
  });

  test('discarding a draft, then archive hides it publicly, restore makes it a draft, history blocks hard delete', async () => {
    const save = await send(h.hospital.PUT, 'PUT', `/api/v1/admin/hospitals/${id}`, { session: editor, params: { id }, body: { expectedVersion: version, values: hospitalValues({ nameEn: 'E2E THROWAWAY' }) } });
    version = save.body.data.meta.version;
    const discard = await send(h.hospitalAction.POST, 'POST', `/api/v1/admin/hospitals/${id}/discard-draft`, { session: editor, params: { id, action: 'discard-draft' }, body: { expectedVersion: version } });
    assert.equal(discard.status, 200);
    assert.equal(discard.body.data.meta.hasDraft, false);
    version = discard.body.data.meta.version;
    const archived = await send(h.hospitalAction.POST, 'POST', `/api/v1/admin/hospitals/${id}/archive`, { session: publisher, params: { id, action: 'archive' }, body: { expectedVersion: version } });
    assert.equal(archived.body.data.meta.status, 'ARCHIVED');
    version = archived.body.data.meta.version;
    assert.deepEqual(await publicNames('E2E'), []);
    const edit = await send(h.hospital.PUT, 'PUT', `/api/v1/admin/hospitals/${id}`, { session: editor, params: { id }, body: { expectedVersion: version, values: hospitalValues() } });
    assert.equal(edit.status, 409);
    const restored = await send(h.hospitalAction.POST, 'POST', `/api/v1/admin/hospitals/${id}/restore`, { session: publisher, params: { id, action: 'restore' }, body: { expectedVersion: version } });
    assert.equal(restored.body.data.meta.status, 'DRAFT');
    version = restored.body.data.meta.version;
    const del = await send(h.hospital.DELETE, 'DELETE', `/api/v1/admin/hospitals/${id}?expectedVersion=${version}`, { session: publisher, params: { id } });
    assert.equal(del.status, 409);
    assert.equal(del.body.error.code, 'INVALID_STATE');
  });

  test('a never-published draft can be deleted by a publisher only', async () => {
    const created = await send(h.hospitals.POST, 'POST', '/api/v1/admin/hospitals', { session: editor, body: { values: hospitalValues({ nameEn: 'E2E DELETE ME' }) } });
    const did = created.body.data.id;
    const v = created.body.data.meta.version;
    assert.equal((await send(h.hospital.DELETE, 'DELETE', `/api/v1/admin/hospitals/${did}?expectedVersion=${v}`, { session: editor, params: { id: did } })).status, 403);
    assert.equal((await send(h.hospital.DELETE, 'DELETE', `/api/v1/admin/hospitals/${did}?expectedVersion=${v}`, { session: publisher, params: { id: did } })).status, 200);
    assert.equal((await send(h.hospital.GET, 'GET', `/api/v1/admin/hospitals/${did}`, { session: editor, params: { id: did } })).status, 404);
  });

  test('admin list supports search, status filter, district filter and pagination', async () => {
    const all = await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals?pageSize=100&page=1', { session: editor });
    assert.equal(all.body.total >= 1221, true);
    assert.equal(all.body.data.length, 100);
    const arun = await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals?q=arun%20medical', { session: editor });
    assert.ok(arun.body.total >= 1);
    const tamil = await send(h.hospitals.GET, 'GET', `/api/v1/admin/hospitals?q=${encodeURIComponent('அருண்')}`, { session: editor });
    assert.ok(tamil.body.total >= 1);
    const drafts = await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals?status=DRAFT', { session: editor });
    assert.ok(drafts.body.data.every((r: { meta: { status: string } }) => r.meta.status === 'DRAFT'));
    const district = await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals?district=Coimbatore&pageSize=5', { session: editor });
    assert.ok(district.body.total > 5 && district.body.totalPages > 1);
    assert.equal((await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals?pageSize=1000', { session: editor })).status, 400);
  });
});

describe('pages', () => {
  test('page edits stay in a draft, preview shows them, publishing updates the public page', async () => {
    const editor = await login('EDITOR');
    const publisher = await login('PUBLISHER');
    const slug = 'coverage';
    const current = await send(h.page.GET, 'GET', `/api/v1/admin/pages/${slug}`, { session: editor, params: { id: slug } });
    assert.equal(current.status, 200);
    const values = JSON.parse(JSON.stringify(current.body.data.values));
    values.en.sections[0].blocks.push({ type: 'paragraph', content: [{ type: 'text', text: 'E2E added paragraph.' }] });
    values.ta.sections[0].blocks.push({ type: 'paragraph', content: [{ type: 'text', text: 'சோதனைப் பத்தி.' }] });
    const save = await send(h.page.PUT, 'PUT', `/api/v1/admin/pages/${slug}`, { session: editor, params: { id: slug }, body: { expectedVersion: current.body.data.meta.version, values } });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    const publicBefore = await send(h.pubPage.GET, 'GET', `/api/v1/pages/${slug}`, { params: { slug } });
    assert.ok(!JSON.stringify(publicBefore.body).includes('E2E added paragraph.'));
    const preview = await send(h.pagePreview.GET, 'GET', `/api/v1/admin/pages/${slug}/preview`, { session: editor, params: { id: slug } });
    assert.ok(JSON.stringify(preview.body).includes('E2E added paragraph.'));
    const pub = await send(h.pageAction.POST, 'POST', `/api/v1/admin/pages/${slug}/publish`, { session: publisher, params: { id: slug, action: 'publish' }, body: { expectedVersion: save.body.data.meta.version } });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    const publicAfter = await send(h.pubPage.GET, 'GET', `/api/v1/pages/${slug}`, { params: { slug } });
    assert.ok(JSON.stringify(publicAfter.body).includes('E2E added paragraph.'));
    assert.ok(JSON.stringify(publicAfter.body).includes('சோதனைப் பத்தி.'));
    const bad = await send(h.pageAction.POST, 'POST', `/api/v1/admin/pages/${slug}/archive`, { session: publisher, params: { id: slug, action: 'archive' }, body: { expectedVersion: pub.body.data.meta.version } });
    assert.equal(bad.status, 409);
    const invalid = JSON.parse(JSON.stringify(values));
    invalid.en.sections[0].blocks[0] = { type: 'script', src: 'x' };
    const rejected = await send(h.page.PUT, 'PUT', `/api/v1/admin/pages/${slug}`, { session: editor, params: { id: slug }, body: { expectedVersion: pub.body.data.meta.version, values: invalid } });
    assert.equal(rejected.status, 400);
  });
});

describe('documents and files', () => {
  test('upload validation, private draft files, publish, replace file, protected admin download', async () => {
    const editor = await login('EDITOR');
    const publisher = await login('PUBLISHER');

    const notPdf = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: editor, form: formWith('document', 'fake.pdf', new TextEncoder().encode('MZ not a pdf')) });
    assert.equal(notPdf.status, 415);
    const exe = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: editor, form: formWith('document', 'run.exe', pdfBytes()) });
    assert.equal(exe.status, 415);
    const tooBig = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: editor, form: formWith('document', 'big.pdf', pdfBytes('x'.repeat(300 * 1024))) });
    assert.equal(tooBig.status, 413);
    const traversal = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: editor, form: formWith('document', '../../evil.pdf', pdfBytes('one')) });
    assert.equal(traversal.status, 201);
    assert.ok(!traversal.body.data.originalName.includes('/') && !traversal.body.data.originalName.includes('..'));
    assert.equal((await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { form: formWith('document', 'a.pdf', pdfBytes()) })).status, 401);

    const asset1 = traversal.body.data;
    const values = { category: 'enrolment-guide', audience: 'all', sortOrder: 99, labelEn: 'E2E guide', labelTa: 'சோதனை வழிகாட்டி', titleEn: 'E2E guide', titleTa: '', dateLabelEn: null, dateLabelTa: null, assetId: asset1.id, language: null, availabilityNote: null };
    const created = await send(h.documents.POST, 'POST', '/api/v1/admin/documents', { session: editor, body: { values } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    let version = created.body.data.meta.version;

    const publicList = async () => (await send(h.pubDocuments.GET, 'GET', '/api/v1/documents')).body.data as Array<{ id: string; localPath: string | null; availability: string }>;
    assert.ok(!(await publicList()).some((d) => d.id === id));
    assert.equal((await send(h.pubFile.GET, 'GET', `/api/v1/files/${asset1.id}`, { params: { assetId: asset1.id } })).status, 404);
    assert.equal((await send(h.adminFile.GET, 'GET', `/api/v1/admin/files/${asset1.id}`, { session: editor, params: { assetId: asset1.id } })).status, 200);
    assert.equal((await send(h.adminFile.GET, 'GET', `/api/v1/admin/files/${asset1.id}`, { params: { assetId: asset1.id } })).status, 401);

    const pub = await send(h.documentAction.POST, 'POST', `/api/v1/admin/documents/${id}/publish`, { session: publisher, params: { id, action: 'publish' }, body: { expectedVersion: version } });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    version = pub.body.data.meta.version;
    const entry = (await publicList()).find((d) => d.id === id);
    assert.equal(entry?.localPath, `/api/v1/files/${asset1.id}`);
    const file = await send(h.pubFile.GET, 'GET', `/api/v1/files/${asset1.id}`, { params: { assetId: asset1.id } });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');

    const second = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: editor, form: formWith('document', 'v2.pdf', pdfBytes('two')) });
    const asset2 = second.body.data;
    const edit = await send(h.document.PUT, 'PUT', `/api/v1/admin/documents/${id}`, { session: editor, params: { id }, body: { expectedVersion: version, values: { ...values, assetId: asset2.id } } });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    assert.equal(edit.body.data.draftAsset.id, asset2.id);
    assert.equal((await publicList()).find((d) => d.id === id)?.localPath, `/api/v1/files/${asset1.id}`);
    assert.equal((await send(h.pubFile.GET, 'GET', `/api/v1/files/${asset2.id}`, { params: { assetId: asset2.id } })).status, 404);
    const pub2 = await send(h.documentAction.POST, 'POST', `/api/v1/admin/documents/${id}/publish`, { session: publisher, params: { id, action: 'publish' }, body: { expectedVersion: edit.body.data.meta.version } });
    assert.equal(pub2.status, 200);
    assert.equal((await publicList()).find((d) => d.id === id)?.localPath, `/api/v1/files/${asset2.id}`);
    assert.equal((await send(h.pubFile.GET, 'GET', `/api/v1/files/${asset2.id}`, { params: { assetId: asset2.id } })).status, 200);

    const arch = await send(h.documentAction.POST, 'POST', `/api/v1/admin/documents/${id}/archive`, { session: publisher, params: { id, action: 'archive' }, body: { expectedVersion: pub2.body.data.meta.version } });
    assert.equal(arch.status, 200);
    assert.ok(!(await publicList()).some((d) => d.id === id));
    assert.equal((await send(h.pubFile.GET, 'GET', `/api/v1/files/${asset2.id}`, { params: { assetId: asset2.id } })).status, 404);

    const imported = (await publicList()).find((d) => d.availability === 'available' && d.localPath);
    assert.ok(imported?.localPath?.startsWith('/api/v1/files/'), 'imported documents keep working downloads');
  });
});

describe('contacts, announcements, gallery, settings', () => {
  test('contacts: add within a directory, validate columns, publish, edit, archive', async () => {
    const editor = await login('EDITOR');
    const publisher = await login('PUBLISHER');
    const dirs = await send(h.contactDirs.GET, 'GET', '/api/v1/admin/contacts/directories', { session: editor });
    assert.equal(dirs.body.data.length, 4);
    const bad = await send(h.contacts.POST, 'POST', '/api/v1/admin/contacts', { session: editor, body: { directoryId: 'coordinators', values: { cells: { Z: 'x' } } } });
    assert.equal(bad.status, 400);
    const created = await send(h.contacts.POST, 'POST', '/api/v1/admin/contacts', { session: editor, body: { directoryId: 'coordinators', values: { cells: { A: 'E2E DISTRICT', B: 'E2E COORDINATOR', C: 'District Coordinator', D: '9999900000' } } } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const inDirectory = async () => (await send(h.pubContact.GET, 'GET', '/api/v1/contacts/coordinators', { params: { directory: 'coordinators' } })).body.data.rows.map((r: { cells: Record<string, string> }) => r.cells.A);
    assert.ok(!(await inDirectory()).includes('E2E DISTRICT'));
    const pub = await send(h.contactAction.POST, 'POST', `/api/v1/admin/contacts/${id}/publish`, { session: publisher, params: { id, action: 'publish' }, body: { expectedVersion: created.body.data.meta.version } });
    assert.equal(pub.status, 200);
    assert.ok((await inDirectory()).includes('E2E DISTRICT'));
    const list = await send(h.contacts.GET, 'GET', '/api/v1/admin/contacts?directoryId=coordinators&q=e2e', { session: editor });
    assert.equal(list.body.total, 1);
    const arch = await send(h.contactAction.POST, 'POST', `/api/v1/admin/contacts/${id}/archive`, { session: publisher, params: { id, action: 'archive' }, body: { expectedVersion: pub.body.data.meta.version } });
    assert.equal(arch.status, 200);
    assert.ok(!(await inDirectory()).includes('E2E DISTRICT'));
  });

  test('announcements: publish and unpublish change the public site notices', async () => {
    const editor = await login('EDITOR');
    const publisher = await login('PUBLISHER');
    const values = { kind: 'general', severity: 'warning', messageEn: [{ type: 'text', text: 'E2E notice text' }], messageTa: [{ type: 'text', text: 'சோதனை அறிவிப்பு' }], startsAt: null, endsAt: null, sortOrder: 50 };
    const created = await send(h.announcements.POST, 'POST', '/api/v1/admin/announcements', { session: editor, body: { values } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const notices = async () => JSON.stringify((await send(h.pubSite.GET, 'GET', '/api/v1/site')).body.data.announcements);
    assert.ok(!(await notices()).includes('E2E notice text'));
    const pub = await send(h.announcementAction.POST, 'POST', `/api/v1/admin/announcements/${id}/publish`, { session: publisher, params: { id, action: 'publish' }, body: { expectedVersion: created.body.data.meta.version } });
    assert.equal(pub.status, 200);
    assert.ok((await notices()).includes('சோதனை அறிவிப்பு'));
    const un = await send(h.announcementAction.POST, 'POST', `/api/v1/admin/announcements/${id}/unpublish`, { session: publisher, params: { id, action: 'unpublish' }, body: { expectedVersion: pub.body.data.meta.version } });
    assert.equal(un.status, 200);
    assert.ok(!(await notices()).includes('E2E notice text'));
    const scripted = await send(h.announcements.POST, 'POST', '/api/v1/admin/announcements', { session: editor, body: { values: { ...values, messageEn: [{ type: 'link', href: 'javascript:alert(1)', text: 'x' }] } } });
    assert.equal(scripted.status, 400);
  });

  test('gallery: upload an image, publish, public listing and file, archive', async () => {
    const editor = await login('EDITOR');
    const publisher = await login('PUBLISHER');
    const up = await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: editor, form: formWith('image', 'photo.png', pngBytes()) });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const wrongKind = await send(h.gallery.POST, 'POST', '/api/v1/admin/gallery', { session: editor, body: { values: { titleEn: 'x', titleTa: '', assetId: (await send(h.uploads.POST, 'POST', '/api/v1/admin/uploads', { session: editor, form: formWith('document', 'd.pdf', pdfBytes('g')) })).body.data.id, sortOrder: 1 } } });
    assert.equal(wrongKind.status, 400);
    const created = await send(h.gallery.POST, 'POST', '/api/v1/admin/gallery', { session: editor, body: { values: { titleEn: 'E2E photo', titleTa: 'சோதனைப் படம்', assetId: up.body.data.id, sortOrder: 1 } } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal((await send(h.pubGallery.GET, 'GET', '/api/v1/gallery')).body.total, 0);
    const pub = await send(h.galleryAction.POST, 'POST', `/api/v1/admin/gallery/${id}/publish`, { session: publisher, params: { id, action: 'publish' }, body: { expectedVersion: created.body.data.meta.version } });
    assert.equal(pub.status, 200);
    const listing = await send(h.pubGallery.GET, 'GET', '/api/v1/gallery');
    assert.equal(listing.body.total, 1);
    assert.equal(listing.body.data[0].imageUrl, `/api/v1/files/${up.body.data.id}`);
    assert.equal((await send(h.pubFile.GET, 'GET', `/api/v1/files/${up.body.data.id}`, { params: { assetId: up.body.data.id } })).status, 200);
    const arch = await send(h.galleryAction.POST, 'POST', `/api/v1/admin/gallery/${id}/archive`, { session: publisher, params: { id, action: 'archive' }, body: { expectedVersion: pub.body.data.meta.version } });
    assert.equal(arch.status, 200);
    assert.equal((await send(h.pubGallery.GET, 'GET', '/api/v1/gallery')).body.total, 0);
  });

  test('settings: validated explicit save for publishers, conflicts detected, public site reflects it', async () => {
    const editor = await login('EDITOR');
    const publisher = await login('PUBLISHER');
    const current = await send(h.settings.GET, 'GET', '/api/v1/admin/settings', { session: editor });
    assert.equal(current.status, 200);
    const values = { ...current.body.data, availability: '24/7 (E2E)' };
    assert.equal((await send(h.settings.PUT, 'PUT', '/api/v1/admin/settings', { session: editor, body: { values, expectedVersion: current.body.version } })).status, 403);
    const badPortal = { ...values, portals: [{ id: 'employee', label: 'Employees', labelTa: '', href: 'http://insecure.example' }] };
    assert.equal((await send(h.settings.PUT, 'PUT', '/api/v1/admin/settings', { session: publisher, body: { values: badPortal, expectedVersion: current.body.version } })).status, 400);
    const saved = await send(h.settings.PUT, 'PUT', '/api/v1/admin/settings', { session: publisher, body: { values, expectedVersion: current.body.version } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal((await send(h.pubSite.GET, 'GET', '/api/v1/site')).body.data.availability, '24/7 (E2E)');
    const stale = await send(h.settings.PUT, 'PUT', '/api/v1/admin/settings', { session: publisher, body: { values, expectedVersion: current.body.version } });
    assert.equal(stale.status, 409);
  });
});

describe('users and audit', () => {
  test('administrators manage users; the last administrator is protected; deactivation ends sessions', async () => {
    const admin = await login('ADMIN');
    const editor = await login('EDITOR');
    assert.equal((await send(h.users.GET, 'GET', '/api/v1/admin/users', { session: editor })).status, 403);
    const created = await send(h.users.POST, 'POST', '/api/v1/admin/users', { session: admin, body: { email: 'new.person@test.example', name: 'New Person', role: 'EDITOR', password: 'A-Long-Initial-Passphrase-9' } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.ok(!JSON.stringify(created.body).includes('passwordHash'));
    const uid = created.body.data.id;
    const weak = await send(h.users.POST, 'POST', '/api/v1/admin/users', { session: admin, body: { email: 'weak@test.example', name: 'Weak', role: 'EDITOR', password: 'short' } });
    assert.equal(weak.status, 400);
    const promoted = await send(h.user.PUT, 'PUT', `/api/v1/admin/users/${uid}`, { session: admin, params: { id: uid }, body: { role: 'PUBLISHER' } });
    assert.equal(promoted.body.data.role, 'PUBLISHER');
    const newSession = await send(h.login.POST, 'POST', '/api/v1/admin/auth/login', { body: { email: 'new.person@test.example', password: 'A-Long-Initial-Passphrase-9' } });
    const cookie = (newSession.headers.get('set-cookie') ?? '').split(';')[0];
    assert.equal((await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals', { session: { cookie, csrf: newSession.body.csrfToken } })).status, 200);
    const off = await send(h.user.PUT, 'PUT', `/api/v1/admin/users/${uid}`, { session: admin, params: { id: uid }, body: { active: false } });
    assert.equal(off.body.data.active, false);
    assert.equal((await send(h.hospitals.GET, 'GET', '/api/v1/admin/hospitals', { session: { cookie, csrf: newSession.body.csrfToken } })).status, 401);
    const adminId = (await client.adminUser.findUniqueOrThrow({ where: { email: 'admin@test.example' } })).id;
    const self = await send(h.user.PUT, 'PUT', `/api/v1/admin/users/${adminId}`, { session: admin, params: { id: adminId }, body: { active: false } });
    assert.ok([403, 409].includes(self.status), `self-deactivation rejected, got ${self.status}`);
  });

  test('every change is audited with the acting user', async () => {
    const admin = await login('ADMIN');
    const res = await send(h.audit.GET, 'GET', '/api/v1/admin/audit?entityType=hospital&pageSize=50', { session: admin });
    assert.equal(res.status, 200);
    const actions = (res.body.data as Array<{ action: string; actorEmail: string | null }>).map((e) => e.action);
    for (const a of ['CREATE', 'UPDATE', 'PUBLISH', 'ARCHIVE', 'RESTORE', 'DISCARD_DRAFT', 'DELETE']) assert.ok(actions.includes(a), `audit has ${a}`);
    assert.ok((res.body.data as Array<{ actorEmail: string | null }>).every((e) => e.actorEmail !== null));
  });
});

describe('import', () => {
  test('re-running the import duplicates nothing and keeps admin edits', async () => {
    const { runImport, defaultSources } = await import('../../prisma/import/import');
    const { createStorageAdapter } = await import('../modules/storage');
    const before = { hospitals: await client.hospital.count(), documents: await client.document.count(), contacts: await client.contact.count(), assets: await client.mediaAsset.count() };
    const report = await runImport(client, { ...defaultSources(), storage: createStorageAdapter(), log: () => undefined });
    assert.ok(Object.values(report.created).every((n) => n === 0), JSON.stringify(report.created));
    assert.equal(await client.hospital.count(), before.hospitals);
    assert.equal(await client.document.count(), before.documents);
    assert.equal(await client.contact.count(), before.contacts);
    assert.equal(await client.mediaAsset.count(), before.assets);
    const edited = await client.page.findUniqueOrThrow({ where: { slug: 'coverage' }, include: { translations: true } });
    assert.ok(JSON.stringify(edited.translations).includes('E2E added paragraph.'), 'admin edit survived the import');
    assert.equal(await client.hospital.count({ where: { sourceRow: { not: null } } }), 1221);
  });
});
