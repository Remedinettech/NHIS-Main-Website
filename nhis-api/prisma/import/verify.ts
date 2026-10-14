/**
 * `npm run db:verify-import -w nhis-api`: compares the database with the snapshot JSON field by field
 * (hospitals, pages, contacts, documents) and checks the stored PDFs against their sha256. Tamil text must
 * round-trip byte for byte. Records edited by an administrator after the import (version > 1) are reported
 * separately, not as failures.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { createStorageAdapter } from '../../src/modules/storage';
import { defaultSources } from './import';

const read = <T>(dir: string, file: string): T => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as T;
const same = (a: unknown, b: unknown) => (typeof a === 'string' && typeof b === 'string' ? Buffer.from(a, 'utf8').equals(Buffer.from(b, 'utf8')) : isDeepStrictEqual(a, b));

export interface VerifyResult {
  compared: Record<string, number>;
  mismatches: string[];
  edited: string[];
}

export async function verifyImport(client: PrismaClient, dataDir: string, storage: ReturnType<typeof createStorageAdapter>): Promise<VerifyResult> {
  const result: VerifyResult = { compared: {}, mismatches: [], edited: [] };
  const check = (label: string, id: string, a: unknown, b: unknown) => {
    if (!same(a, b)) result.mismatches.push(`${label} ${id}`);
  };

  const hospitals = read<Array<Record<string, any>>>(dataDir, 'hospitals.json');
  const rows = new Map((await client.hospital.findMany()).map((r) => [r.id, r]));
  for (const h of hospitals) {
    const r = rows.get(h.id);
    if (!r) {
      result.mismatches.push(`hospital ${h.id} missing`);
      continue;
    }
    if (r.version > 1) {
      result.edited.push(`hospital ${h.id}`);
      continue;
    }
    const f: Array<[string, unknown, unknown]> = [
      ['nameEn', r.nameEn, h.name.en], ['nameTa', r.nameTa, h.name.ta], ['addressEn', r.addressEn, h.address.en], ['addressTa', r.addressTa, h.address.ta],
      ['districtEn', r.districtEn, h.district.en], ['districtTa', r.districtTa, h.district.ta], ['stateEn', r.stateEn, h.state.en ?? ''], ['stateTa', r.stateTa, h.state.ta ?? ''],
      ['postcode', r.postcode, h.postcode], ['category', r.category, h.category], ['type', r.type, h.type], ['specialty', r.specialty, h.specialty],
      ['contact', r.contact, h.contact], ['mapUrl', r.mapUrl, h.mapUrl], ['sourceRow', r.sourceRow, h.sourceRow], ['sourceData', r.sourceData, h],
    ];
    for (const [name, a, b] of f) check(`hospital.${name}`, h.id, a, b);
    result.compared.hospitals = (result.compared.hospitals ?? 0) + 1;
  }
  if (rows.size < hospitals.length) result.mismatches.push(`hospital count ${rows.size} < ${hospitals.length}`);

  const pages = read<Array<Record<string, any>>>(dataDir, 'pages.json');
  for (const p of pages) {
    const row = await client.page.findUnique({ where: { slug: p.slug }, include: { translations: true } });
    if (!row) {
      result.mismatches.push(`page ${p.slug} missing`);
      continue;
    }
    if (row.version > 1) {
      result.edited.push(`page ${p.slug}`);
      continue;
    }
    check('page.legacyPaths', p.slug, row.legacyPaths, p.legacyPaths);
    check('page.documentIds', p.slug, row.documentIds, p.documentIds);
    check('page.sourceUrl', p.slug, row.sourceUrl, p.sourceUrl);
    check('page.reviewNotes', p.slug, row.reviewNotes, p.reviewNotes);
    for (const locale of ['en', 'ta'] as const) {
      const t = row.translations.find((x) => x.locale === locale);
      if (!p[locale]) check('page.translation(absent)', `${p.slug}/${locale}`, t, undefined);
      else {
        check('page.title', `${p.slug}/${locale}`, t?.title, p[locale].title);
        check('page.sections', `${p.slug}/${locale}`, t?.sections, p[locale].sections);
      }
    }
    result.compared.pages = (result.compared.pages ?? 0) + 1;
  }

  const directories = read<Array<Record<string, any>>>(dataDir, 'contacts.json');
  for (const d of directories) {
    const dir = await client.contactDirectory.findUnique({ where: { id: d.id }, include: { contacts: true } });
    if (!dir) {
      result.mismatches.push(`directory ${d.id} missing`);
      continue;
    }
    check('directory.label', d.id, [dir.labelEn, dir.labelTa], [d.label.en, d.label.ta]);
    check('directory.columns', d.id, dir.columns, d.columns);
    check('directory.flags', d.id, dir.flags, d.flags);
    const byId = new Map(dir.contacts.map((c) => [c.id, c]));
    for (const row of d.rows as Array<{ sourceRow: number; cells: unknown }>) {
      const c = byId.get(`${d.id}-row-${row.sourceRow}`);
      if (!c) result.mismatches.push(`contact ${d.id}-row-${row.sourceRow} missing`);
      else if (c.version > 1) result.edited.push(`contact ${c.id}`);
      else {
        check('contact.cells', c.id, c.cells, row.cells);
        result.compared.contacts = (result.compared.contacts ?? 0) + 1;
      }
    }
  }

  const documents = read<Array<Record<string, any>>>(dataDir, 'documents.json');
  for (const d of documents) {
    const row = await client.document.findUnique({ where: { id: d.id }, include: { asset: true } });
    if (!row) {
      result.mismatches.push(`document ${d.id} missing`);
      continue;
    }
    if (row.version > 1) {
      result.edited.push(`document ${d.id}`);
      continue;
    }
    check('document.label', d.id, [row.labelEn, row.labelTa], [d.label.en, d.label.ta]);
    check('document.title', d.id, [row.titleEn, row.titleTa], [d.title.en, d.title.ta]);
    check('document.dateLabel', d.id, [row.dateLabelEn, row.dateLabelTa], [d.dateLabel.en, d.dateLabel.ta]);
    check('document.sourceUrl', d.id, row.sourceUrl, d.sourceUrl);
    check('document.notes', d.id, row.notes, d.notes);
    check('document.availability', d.id, row.asset ? 'available' : 'unavailable', d.availability);
    if (d.localPath) {
      if (!row.asset) continue;
      check('document.asset.sha256', d.id, row.asset.sha256, d.sha256);
      check('document.asset.bytes', d.id, row.asset.bytes, d.bytes);
      const chunks: Buffer[] = [];
      for await (const part of await storage.get(row.asset.storageKey)) chunks.push(part as Buffer);
      check('document.file.sha256', d.id, crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex'), d.sha256);
    }
    result.compared.documents = (result.compared.documents ?? 0) + 1;
  }
  return result;
}

async function main(): Promise<void> {
  const client = new PrismaClient();
  try {
    const result = await verifyImport(client, defaultSources().dataDir, createStorageAdapter());
    console.log('Compared:', JSON.stringify(result.compared));
    console.log(`Edited after import (skipped): ${result.edited.length}`);
    if (result.mismatches.length > 0) {
      console.error(`MISMATCHES (${result.mismatches.length}):`, result.mismatches.slice(0, 20).join('; '));
      process.exitCode = 1;
    } else {
      console.log('OK: database content matches the snapshot byte for byte.');
    }
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error: unknown) => {
    console.error('Verification failed:', error instanceof Error ? error.message.split('\n').slice(-3).join(' ') : String(error));
    process.exitCode = 1;
  });
}
