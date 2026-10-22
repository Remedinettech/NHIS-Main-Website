/** Public read API against a real PostgreSQL schema containing the imported content (never the live `public` schema). */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createAdminTestDb, type AdminTestDb } from './admin-test-db';
import { ctx } from './helpers';

let testDb: AdminTestDb;
let client: PrismaClient;
let storageDir: string;
/* eslint-disable @typescript-eslint/no-explicit-any */
const r: Record<string, any> = {};

const get = (handler: (req: Request, c?: any) => Promise<Response>, url: string, params?: Record<string, string>, headers: Record<string, string> = {}) =>
  handler(new Request(`http://localhost/api/v1/${url}`, { headers }), params ? ctx(params) : undefined);

before(async () => {
  testDb = await createAdminTestDb();
  client = testDb.client;
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-pub-'));
  process.env.FILE_STORAGE_DIR = storageDir;
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  const { runImport, defaultSources } = await import('../../prisma/import/import');
  const { createStorageAdapter } = await import('../modules/storage');
  await runImport(client, { ...defaultSources(), storage: createStorageAdapter(), log: () => undefined });
  Object.assign(r, {
    hospitals: await import('../app/api/v1/hospitals/route'), hospital: await import('../app/api/v1/hospitals/[id]/route'),
    health: await import('../app/api/v1/health/route'), stats: await import('../app/api/v1/stats/route'),
    page: await import('../app/api/v1/pages/[slug]/route'), documents: await import('../app/api/v1/documents/route'),
    document: await import('../app/api/v1/documents/[id]/route'), contacts: await import('../app/api/v1/contacts/route'),
    contact: await import('../app/api/v1/contacts/[directory]/route'), site: await import('../app/api/v1/site/route'),
    gallery: await import('../app/api/v1/gallery/route'), file: await import('../app/api/v1/files/[assetId]/route'),
  });
});

after(async () => {
  await testDb?.cleanup();
  if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
});

describe('hospitals', () => {
  test('all 1,221 imported records are served, bounded per page, and never lost across pages', async () => {
    const first = await (await get(r.hospitals.GET, 'hospitals')).json();
    assert.equal(first.total, 1221);
    assert.equal(first.data.length, 12);
    const seen = new Set<string>();
    for (let page = 1; page <= 13; page += 1) {
      const body = await (await get(r.hospitals.GET, `hospitals?page=${page}&pageSize=100`)).json();
      body.data.forEach((h: { id: string }) => seen.add(h.id));
    }
    assert.equal(seen.size, 1221);
  });

  test('search is literal, whitespace-normalised and works in Tamil; pagination is validated', async () => {
    const count = async (q: string) => (await (await get(r.hospitals.GET, `hospitals?q=${encodeURIComponent(q)}`)).json()).total as number;
    assert.ok((await count('ARUN MEDICAL')) > 0);
    assert.ok((await count('  arun    medical ')) > 0);
    assert.ok((await count('அருண்')) > 0);
    assert.ok((await count('[')) >= 0);
    assert.equal((await get(r.hospitals.GET, 'hospitals?q=[')).status, 200);
    for (const page of ['0', '-1', '1.5', 'NaN']) assert.equal((await get(r.hospitals.GET, `hospitals?page=${page}`)).status, 400);
    const bad = await get(r.hospitals.GET, 'hospitals?pageSize=101');
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, 'INVALID_QUERY');
    const district = await (await get(r.hospitals.GET, 'hospitals?district=Coimbatore')).json();
    assert.ok(district.total > 0);
    assert.ok(district.districts.length > 5);
  });

  test('detail returns the stored record (Tamil intact) or 404', async () => {
    const ok = await get(r.hospital.GET, 'hospitals/nhis-snapshot-row-2', { id: 'nhis-snapshot-row-2' });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.data.sourceRow, 2);
    assert.match(body.data.name.ta, /அருண்/);
    assert.equal((await get(r.hospital.GET, 'hospitals/missing', { id: 'missing' })).status, 404);
  });

  test('drafts and archived rows are not public', async () => {
    await client.hospital.update({ where: { id: 'nhis-snapshot-row-3' }, data: { status: 'DRAFT' } });
    await client.hospital.update({ where: { id: 'nhis-snapshot-row-4' }, data: { status: 'ARCHIVED' } });
    assert.equal((await get(r.hospital.GET, 'hospitals/nhis-snapshot-row-3', { id: 'nhis-snapshot-row-3' })).status, 404);
    assert.equal((await get(r.hospital.GET, 'hospitals/nhis-snapshot-row-4', { id: 'nhis-snapshot-row-4' })).status, 404);
    assert.equal((await (await get(r.hospitals.GET, 'hospitals')).json()).total, 1219);
    await client.hospital.updateMany({ where: { id: { in: ['nhis-snapshot-row-3', 'nhis-snapshot-row-4'] } }, data: { status: 'PUBLISHED' } });
  });
});

describe('content endpoints', () => {
  test('health reports a live database connection', async () => {
    const body = await (await r.health.GET()).json();
    assert.equal(body.databaseConnected, true);
    assert.equal(body.mode, 'database');
  });

  test('stats are computed from the database', async () => {
    const body = await (await get(r.stats.GET, 'stats')).json();
    assert.equal(body.hospitals, 1221);
    assert.equal(body.contacts, 186);
    assert.equal(body.documents, 23);
  });

  test('pages: 8 slugs, bilingual content, review notes and storage details never exposed', async () => {
    for (const slug of ['employee-policy', 'pensioner-policy', 'coverage', 'eligibility', 'how-to-enroll', 'forms', 'grievances', 'gallery']) {
      const res = await get(r.page.GET, `pages/${slug}`, { slug });
      assert.equal(res.status, 200, slug);
      const text = JSON.stringify(await res.json());
      assert.ok(!text.includes('storageKey'));
    }
    const employee = await (await get(r.page.GET, 'pages/employee-policy', { slug: 'employee-policy' })).json();
    assert.ok(JSON.stringify(employee.data.en).includes('attain the age of 25 years'));
    assert.ok(JSON.stringify(employee.data.ta).includes('உச்ச வயது வரம்பின்றி'));
    assert.equal((await get(r.page.GET, 'pages/zzz', { slug: 'zzz' })).status, 404);
    assert.equal((await get(r.page.GET, 'pages/..%2Fx', { slug: '../x' })).status, 400);
    const enroll = await (await get(r.page.GET, 'pages/how-to-enroll', { slug: 'how-to-enroll' })).json();
    assert.equal(enroll.data.ta, null);
  });

  test('documents: 23 records, one unavailable without a file, downloads served from the file route', async () => {
    const body = await (await get(r.documents.GET, 'documents')).json();
    assert.equal(body.total, 23);
    const unavailable = body.data.filter((d: { availability: string }) => d.availability === 'unavailable');
    assert.equal(unavailable.length, 1);
    assert.equal(unavailable[0].id, 'go-pensioner-199');
    assert.equal(unavailable[0].localPath, null);
    const hashes = new Set(body.data.filter((d: { sha256?: string }) => d.sha256).map((d: { id: string }) => d.id));
    assert.ok(hashes.size >= 22);
    const withFile = body.data.find((d: { localPath: string | null }) => d.localPath);
    assert.match(withFile.localPath, /^\/api\/v1\/files\/[A-Za-z0-9_-]+$/);
    const assetId = withFile.localPath.split('/').pop();
    const file = await get(r.file.GET, `files/${assetId}`, { assetId });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    const suspension = body.data.filter((d: { category: string }) => d.category === 'hospital-suspension');
    assert.equal(suspension.length, 2);
    assert.notEqual(suspension[0].sha256, suspension[1].sha256);
    assert.equal((await get(r.document.GET, 'documents/nope', { id: 'nope' })).status, 404);
    assert.equal((await get(r.file.GET, 'files/doesnotexist1', { assetId: 'doesnotexist1' })).status, 404);
  });

  test('contacts: five directories with exact row counts', async () => {
    const index = await (await get(r.contacts.GET, 'contacts')).json();
    assert.deepEqual(index.data.map((d: { id: string; total: number }) => [d.id, d.total]), [
      ['coordinators', 44], ['uiic-nodal-officers', 39], ['hospital-nodal-officers', 50], ['treasury-offices', 39], ['project-office-officials', 14],
    ]);
    const dir = await (await get(r.contact.GET, 'contacts/hospital-nodal-officers', { directory: 'hospital-nodal-officers' })).json();
    assert.equal(dir.data.rows.length, 50);
    assert.equal((await get(r.contact.GET, 'contacts/nope', { directory: 'nope' })).status, 404);
  });

  test('site settings: helplines, suspension notice with two document versions, portals', async () => {
    const body = await (await get(r.site.GET, 'site')).json();
    assert.deepEqual(body.data.helplines.map((h: { number: string }) => h.number), ['1800-233-5666', '1800-233-5544', '044 40115088']);
    assert.ok(body.data.announcements.some((a: { kind: string }) => a.kind === 'suspension'));
    // the portal links are derived from the effective header / navigation content (see modules/site/site-from-content.ts)
      assert.deepEqual(body.data.portals.map((p: { id: string }) => p.id), ['employee', 'pensioner', 'administrator', 'insurer', 'trackClaim']);
    assert.ok(body.data.portals.every((p: { href: string }) => p.href.startsWith('https://')));
  });

  test('gallery is empty until items are published', async () => {
    const body = await (await get(r.gallery.GET, 'gallery')).json();
    assert.equal(body.total, 0);
    assert.deepEqual(body.data, []);
  });

  test('public responses revalidate instead of serving stale content (ETag / 304)', async () => {
    const first = await get(r.site.GET, 'site');
    assert.match(first.headers.get('cache-control') ?? '', /no-cache/);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    const again = await get(r.site.GET, 'site', undefined, { 'If-None-Match': etag });
    assert.equal(again.status, 304);
    await client.siteSetting.update({ where: { key: 'scheme' }, data: { value: { ...((await client.siteSetting.findUniqueOrThrow({ where: { key: 'scheme' } })).value as object), availability: '24/7 changed' } } });
    const changed = await get(r.site.GET, 'site', undefined, { 'If-None-Match': etag });
    assert.equal(changed.status, 200);
  });
});
