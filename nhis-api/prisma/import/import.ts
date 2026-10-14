/**
 * Repeatable, non-destructive import of the committed snapshot into PostgreSQL.
 *
 * Source: nhis-api/src/data/*.json and the PDFs in nhis-client/public/documents.
 * Every source row is tracked in `ImportMarker` (key + checksum). A row whose marker exists is skipped, so re-running
 * never duplicates records, never overwrites an administrator's edits and never resurrects a record that an
 * administrator deleted. Nothing is ever updated or deleted by the import.
 * Text is stored verbatim (UTF-8, no normalisation): the snapshot already holds exactly what the source published.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { StorageAdapter } from '../../src/modules/storage/storage.types';
import { buildHospitalSearchText, normalizeSearch } from '../../src/modules/hospitals/hospital-search';
import { SETTING_KEYS } from '../../src/modules/site/site-settings';

export interface ImportOptions {
  dataDir: string;
  documentsDir: string;
  storage: StorageAdapter;
  now?: Date;
  log?: (message: string) => void;
}

export interface ImportReport {
  created: Record<string, number>;
  /** Source rows that already had a marker (or an existing record) and were left untouched. */
  skipped: Record<string, number>;
  /** Source rows whose content changed since they were imported; they are NOT applied (admin data wins). */
  sourceChanged: string[];
}

/** Walks up from `start` to the monorepo root (the folder that contains both nhis-api and nhis-client). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, 'nhis-api')) && fs.existsSync(path.join(dir, 'nhis-client'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Monorepo root (containing nhis-api and nhis-client) not found');
}

export function defaultSources(root: string = findRepoRoot()) {
  return {
    dataDir: path.join(root, 'nhis-api', 'src', 'data'),
    documentsDir: path.join(root, 'nhis-client', 'public', 'documents'),
  };
}

const readJson = <T>(dir: string, file: string): T => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as T;
const checksum = (value: unknown): string => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/* ------------------------------------------------------------------ source shapes (snapshot JSON) */
type Bi<T = string> = { en: T; ta: T };
interface SrcHospital {
  id: string;
  sourceRow: number;
  name: Bi;
  address: Bi;
  district: Bi;
  state: Bi;
  category: string;
  postcode: string;
  type: string;
  specialty: string;
  contact: string;
  mapUrl: string;
}
interface SrcDirectory {
  id: string;
  label: Bi;
  sourceFile: string;
  columns: unknown[];
  rows: Array<{ id: string; sourceRow: number; cells: Record<string, string> }>;
  flags: unknown[];
}
interface SrcDocument {
  id: string;
  category: string;
  audience: string;
  order: number;
  label: Bi;
  title: Bi;
  dateLabel: Bi<string | null>;
  sourceUrl: string;
  localPath: string | null;
  availability: 'available' | 'unavailable';
  availabilityNote?: string;
  pages?: number;
  bytes?: number;
  sha256?: string;
  hasTextIndex?: boolean;
  fileNameDate?: string;
  notes: string[];
  language?: string;
  versionGroup?: string;
}
interface SrcPage {
  slug: string;
  legacyPaths: string[];
  sourceUrl: string;
  en: { title: string; sections: unknown } | null;
  ta: { title: string; sections: unknown } | null;
  documentIds: string[];
  reviewNotes: unknown[];
}
interface SrcSite {
  schemeName: Bi;
  coverageStatement: Bi;
  helplines: Array<{ id: string; label: Bi; number: string; telHref: string }>;
  availability: string;
  announcements: Array<{ id: string; kind: string; severity: string; message: { en: unknown; ta: unknown } }>;
}

/** The legacy NHIS portal destinations (same values as nhis-client/src/config/portals.ts, base https://tn-nhis.com). */
export const LEGACY_PORTAL_BASE_URL = 'https://tn-nhis.com';
export const PORTAL_SEED: ReadonlyArray<{ id: string; label: string; labelTa: string; href: string }> = [
  { id: 'employee', label: 'Employees', labelTa: 'பணியாளர்கள்', href: `${LEGACY_PORTAL_BASE_URL}/?Pagename=TNportal` },
  { id: 'pensioner', label: 'Pensioners', labelTa: 'ஓய்வூதியம் பெறுவோர்', href: `${LEGACY_PORTAL_BASE_URL}/?Pagename=Pensioners` },
  { id: 'administrator', label: 'Administrator', labelTa: 'நிர்வாகி', href: `${LEGACY_PORTAL_BASE_URL}/?Pagename=Administrator` },
  { id: 'insurer', label: 'Insurer', labelTa: 'காப்பீட்டாளர்', href: `${LEGACY_PORTAL_BASE_URL}/?Pagename=TNportal` },
  { id: 'trackClaim', label: 'Track Claim', labelTa: 'உரிமைகோரலைக் கண்காணிக்கவும்', href: `${LEGACY_PORTAL_BASE_URL}/?Pagename=TNportal` },
  { id: 'forgotPassword', label: 'Forgot Password?', labelTa: 'கடவுச்சொல்லை மறந்துவிட்டீர்களா?', href: `${LEGACY_PORTAL_BASE_URL}/Account/ForgetPassword` },
  { id: 'hospitalMediAssist', label: 'MEDI ASSIST INSURANCE TPA Private Limited', labelTa: 'மெடி அசிஸ்ட் இன்சூரன்ஸ் டிபிஏ பிரைவேட். லிமிடெட்', href: 'https://provider.ihx.in/' },
  { id: 'hospitalMdIndia', label: 'MD India Health Insurance TPA Private Limited', labelTa: 'எம்டி இந்தியா ஹெல்த் இன்சூரன்ஸ் டிபிஏ பிரைவேட் லிமிடெட்', href: 'https://tnnhis2016.com/' },
];

const BATCH = 400;
const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export async function runImport(client: PrismaClient, options: ImportOptions): Promise<ImportReport> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => undefined);
  const report: ImportReport = { created: {}, skipped: {}, sourceChanged: [] };
  const bump = (bucket: 'created' | 'skipped', name: string, n = 1) => {
    report[bucket][name] = (report[bucket][name] ?? 0) + n;
  };

  const markers = new Map((await client.importMarker.findMany()).map((m) => [m.key, m.checksum]));
  /** True when the source row still has to be imported. Changed source rows are reported, never re-applied. */
  const isNew = (key: string, sum: string, kind: string): boolean => {
    const existing = markers.get(key);
    if (existing === undefined) return true;
    if (existing !== sum) report.sourceChanged.push(key);
    bump('skipped', kind);
    return false;
  };
  const remember = (key: string, sum: string) => markers.set(key, sum);

  /* -------------------------------------------------------------- hospitals */
  {
    const source = readJson<SrcHospital[]>(options.dataDir, 'hospitals.json');
    const fresh = source
      .map((h) => ({ h, key: `hospital:${h.id}`, sum: checksum(h) }))
      .filter((x) => isNew(x.key, x.sum, 'hospitals'));
    let created = 0;
    for (const batch of chunk(fresh, BATCH)) {
      await client.$transaction(async (tx) => {
        const result = await tx.hospital.createMany({
          skipDuplicates: true,
          data: batch.map(({ h }) => ({
            id: h.id,
            sourceRow: h.sourceRow,
            nameEn: h.name.en,
            nameTa: h.name.ta,
            addressEn: h.address.en,
            addressTa: h.address.ta,
            districtEn: h.district.en,
            districtTa: h.district.ta,
            stateEn: h.state.en ?? '', // one source row (900) has no English state value
            stateTa: h.state.ta ?? '',
            postcode: h.postcode,
            category: h.category,
            type: h.type,
            specialty: h.specialty,
            contact: h.contact,
            mapUrl: h.mapUrl,
            searchText: buildHospitalSearchText({
              nameEn: h.name.en,
              nameTa: h.name.ta,
              addressEn: h.address.en,
              addressTa: h.address.ta,
              districtEn: h.district.en,
              districtTa: h.district.ta,
              specialty: h.specialty,
              postcode: h.postcode,
            }),
            status: 'PUBLISHED' as const,
            version: 1,
            publishedAt: now,
            sourceData: asJson(h),
          })),
        });
        created += result.count;
        await tx.importMarker.createMany({ skipDuplicates: true, data: batch.map((x) => ({ key: x.key, checksum: x.sum })) });
      }, { timeout: 120_000 });
      batch.forEach((x) => remember(x.key, x.sum));
    }
    bump('created', 'hospitals', created);
    bump('skipped', 'hospitals', fresh.length - created);
    log(`hospitals: ${created} created, ${source.length - fresh.length} already imported`);
  }

  /* -------------------------------------------------------------- contact directories and contacts */
  {
    const source = readJson<SrcDirectory[]>(options.dataDir, 'contacts.json');
    for (const [index, dir] of source.entries()) {
      const dirKey = `contactDirectory:${dir.id}`;
      const dirSum = checksum({ id: dir.id, label: dir.label, sourceFile: dir.sourceFile, columns: dir.columns, flags: dir.flags });
      const newDirectory = isNew(dirKey, dirSum, 'contactDirectories');
      const rows = dir.rows
        .map((row) => {
          const id = `${dir.id}-row-${row.sourceRow}`;
          return { row, id, key: `contact:${id}`, sum: checksum(row.cells) };
        })
        .filter((x) => isNew(x.key, x.sum, 'contacts'));
      if (!newDirectory && rows.length === 0) continue;
      await client.$transaction(async (tx) => {
        if (newDirectory) {
          await tx.contactDirectory.createMany({
            skipDuplicates: true,
            data: [{ id: dir.id, labelEn: dir.label.en, labelTa: dir.label.ta, sourceFile: dir.sourceFile, columns: asJson(dir.columns), flags: asJson(dir.flags), sortOrder: index }],
          });
          await tx.importMarker.createMany({ skipDuplicates: true, data: [{ key: dirKey, checksum: dirSum }] });
          bump('created', 'contactDirectories');
        }
        if (rows.length > 0) {
          const result = await tx.contact.createMany({
            skipDuplicates: true,
            data: rows.map(({ row, id }) => ({
              id,
              directoryId: dir.id,
              sourceRow: row.sourceRow,
              sortOrder: row.sourceRow,
              cells: asJson(row.cells),
              searchText: normalizeSearch(Object.values(row.cells).join(' ')),
              status: 'PUBLISHED' as const,
              version: 1,
              publishedAt: now,
            })),
          });
          await tx.importMarker.createMany({ skipDuplicates: true, data: rows.map((x) => ({ key: x.key, checksum: x.sum })) });
          bump('created', 'contacts', result.count);
        }
      }, { timeout: 60_000 });
      if (newDirectory) remember(dirKey, dirSum);
      rows.forEach((x) => remember(x.key, x.sum));
    }
    log(`contacts: ${report.created.contacts ?? 0} created`);
  }

  /* -------------------------------------------------------------- documents (+ files copied into storage) */
  {
    const source = readJson<SrcDocument[]>(options.dataDir, 'documents.json');
    for (const d of source) {
      const key = `document:${d.id}`;
      const sum = checksum(d);
      if (!isNew(key, sum, 'documents')) continue;

      let stored: { key: string; bytes: number; sha256: string } | null = null;
      let originalName = '';
      if (d.localPath) {
        if (!d.localPath.startsWith('/documents/')) throw new Error(`${d.id}: unexpected localPath ${d.localPath}`);
        const file = path.resolve(options.documentsDir, d.localPath.slice('/documents/'.length));
        if (path.relative(options.documentsDir, file).startsWith('..')) throw new Error(`${d.id}: path escapes the documents directory`);
        const data = fs.readFileSync(file);
        const actual = crypto.createHash('sha256').update(data).digest('hex');
        if (actual !== d.sha256 || data.length !== d.bytes) throw new Error(`${d.id}: ${path.basename(file)} does not match the registry hash/size; import aborted`);
        stored = await options.storage.put(data, 'pdf');
        originalName = path.basename(file);
      }
      try {
        await client.$transaction(async (tx) => {
          const existing = await tx.document.findUnique({ where: { id: d.id }, select: { id: true } });
          if (!existing) {
            const asset = stored
              ? await tx.mediaAsset.create({
                  data: { kind: 'DOCUMENT', storageKey: stored.key, originalName, mimeType: 'application/pdf', bytes: stored.bytes, sha256: stored.sha256 },
                })
              : null;
            await tx.document.create({
              data: {
                id: d.id,
                category: d.category,
                audience: d.audience,
                sortOrder: d.order,
                labelEn: d.label.en,
                labelTa: d.label.ta,
                titleEn: d.title.en,
                titleTa: d.title.ta,
                dateLabelEn: d.dateLabel.en,
                dateLabelTa: d.dateLabel.ta,
                sourceUrl: d.sourceUrl,
                assetId: asset?.id ?? null,
                availabilityNote: d.availabilityNote ?? null,
                pages: d.pages ?? null,
                hasTextIndex: d.hasTextIndex ?? null,
                fileNameDate: d.fileNameDate ?? null,
                notes: asJson(d.notes),
                language: d.language ?? null,
                versionGroup: d.versionGroup ?? null,
                status: 'PUBLISHED',
                version: 1,
                publishedAt: now,
              },
            });
            bump('created', 'documents');
            if (asset) bump('created', 'mediaAssets');
          } else {
            bump('skipped', 'documents');
          }
          await tx.importMarker.create({ data: { key, checksum: sum } });
        });
        remember(key, sum);
      } catch (error) {
        if (stored) await options.storage.delete(stored.key).catch(() => undefined);
        throw error;
      }
    }
    log(`documents: ${report.created.documents ?? 0} created, ${report.created.mediaAssets ?? 0} files stored`);
  }

  /* -------------------------------------------------------------- pages */
  {
    const source = readJson<SrcPage[]>(options.dataDir, 'pages.json');
    for (const p of source) {
      const key = `page:${p.slug}`;
      const sum = checksum(p);
      if (!isNew(key, sum, 'pages')) continue;
      await client.$transaction(async (tx) => {
        if (!(await tx.page.findUnique({ where: { slug: p.slug }, select: { id: true } }))) {
          const translations = (['en', 'ta'] as const).flatMap((locale) => {
            const t = p[locale];
            return t ? [{ locale, title: t.title, sections: asJson(t.sections) }] : [];
          });
          await tx.page.create({
            data: {
              slug: p.slug,
              legacyPaths: p.legacyPaths,
              sourceUrl: p.sourceUrl,
              documentIds: p.documentIds,
              reviewNotes: asJson(p.reviewNotes),
              translations: { create: translations },
              status: 'PUBLISHED',
              version: 1,
              publishedAt: now,
            },
          });
          bump('created', 'pages');
          bump('created', 'pageTranslations', translations.length);
        } else {
          bump('skipped', 'pages');
        }
        await tx.importMarker.create({ data: { key, checksum: sum } });
      });
      remember(key, sum);
    }
    log(`pages: ${report.created.pages ?? 0} created`);
  }

  /* -------------------------------------------------------------- site settings and announcements */
  {
    const site = readJson<SrcSite>(options.dataDir, 'site.json');
    for (const [index, a] of site.announcements.entries()) {
      const key = `announcement:${a.id}`;
      const sum = checksum(a);
      if (!isNew(key, sum, 'announcements')) continue;
      await client.$transaction(async (tx) => {
        if (!(await tx.announcement.findUnique({ where: { id: a.id }, select: { id: true } }))) {
          await tx.announcement.create({
            data: {
              id: a.id,
              kind: a.kind,
              severity: a.severity,
              messageEn: asJson(a.message.en),
              messageTa: asJson(a.message.ta),
              sortOrder: index,
              status: 'PUBLISHED',
              version: 1,
              publishedAt: now,
            },
          });
          bump('created', 'announcements');
        } else {
          bump('skipped', 'announcements');
        }
        await tx.importMarker.create({ data: { key, checksum: sum } });
      });
      remember(key, sum);
    }

    const settings: Array<{ key: string; value: unknown }> = [
      {
        key: SETTING_KEYS.scheme,
        value: {
          schemeNameEn: site.schemeName.en,
          schemeNameTa: site.schemeName.ta,
          coverageStatementEn: site.coverageStatement.en,
          coverageStatementTa: site.coverageStatement.ta,
          availability: site.availability,
        },
      },
      {
        key: SETTING_KEYS.helplines,
        value: site.helplines.map((h) => ({ id: h.id, labelEn: h.label.en, labelTa: h.label.ta, number: h.number, telHref: h.telHref })),
      },
      { key: SETTING_KEYS.portals, value: PORTAL_SEED.map((p) => ({ ...p })) },
    ];
    for (const s of settings) {
      const key = `setting:${s.key}`;
      const sum = checksum(s.value);
      if (!isNew(key, sum, 'siteSettings')) continue;
      await client.$transaction(async (tx) => {
        if (!(await tx.siteSetting.findUnique({ where: { key: s.key }, select: { key: true } }))) {
          await tx.siteSetting.create({ data: { key: s.key, value: asJson(s.value), version: 1 } });
          bump('created', 'siteSettings');
        } else {
          bump('skipped', 'siteSettings');
        }
        await tx.importMarker.create({ data: { key, checksum: sum } });
      });
      remember(key, sum);
    }
    log(`announcements: ${report.created.announcements ?? 0}, settings: ${report.created.siteSettings ?? 0} created`);
  }

  /* -------------------------------------------------------------- audit trail (only when something was written) */
  const total = Object.values(report.created).reduce((a, b) => a + b, 0);
  if (total > 0) {
    await client.auditLog.create({
      data: {
        actorId: null,
        actorEmail: null,
        action: 'IMPORT',
        entityType: 'Import',
        entityId: 'snapshot',
        summary: `Imported snapshot content: ${Object.entries(report.created).map(([k, v]) => `${v} ${k}`).join(', ')}`,
        detail: asJson({ created: report.created, skipped: report.skipped }),
      },
    });
  }
  return report;
}
