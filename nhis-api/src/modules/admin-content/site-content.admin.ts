import {
  SITE_CONTENT_INFO, SITE_CONTENT_KEYS, isSiteContentKey, mapSiteImages, validateSiteContent,
  type SiteContentKey, type SiteContentMap,
} from '@nhis/shared-types';
import type { Prisma, PublicationStatus, SiteContent } from '@prisma/client';
import { invalid, notFound } from '../../common/admin';
import { effectiveDefault, effectiveDefaults } from '../site-content/effective-default';
import { createMissingTableWarning, isTableUnavailableError } from '../site-content/missing-table';
import { checkSiteContentReferences } from '../site-content/references';
import { resolveSiteContent } from '../site-content/resolve';
import type { EntityAdapter, RowBase } from './engine';
import type { Db, ModuleDefinition } from './shared';

/*
 * Admin side of the site-content documents (docs/site-content-management.md, sections 2 and 3). The six documents
 * reuse the lifecycle engine like pages do: `id` is the document key, a first save creates the row (DRAFT), Publish
 * makes `value` public, later edits wait in `draft`. A key without a row is a VIRTUAL row (version 0) that stands for
 * the effective default (built-in content plus legacy settings); the first save or publish creates the real row.
 */

export type SiteContentValues = SiteContentMap[SiteContentKey];

export interface SiteContentRow extends RowBase {
  value: Prisma.JsonValue;
  /** True while no database row exists and the row stands for the effective default. */
  virtual: boolean;
}

const EPOCH = new Date(0);

const virtualRow = (key: SiteContentKey, value: SiteContentValues): SiteContentRow => ({
  id: key, status: 'DRAFT', version: 0, draft: null, publishedAt: null, archivedAt: null, createdAt: EPOCH, updatedAt: EPOCH,
  updatedById: null, value: value as unknown as Prisma.JsonValue, virtual: true,
});

const storedRow = (row: SiteContent): SiteContentRow => ({ ...row, virtual: false });

/**
 * Which document a set of values belongs to, from its shape. The engine hands the adapter only the values (for the
 * audit label and the cross-record checks); every shape is distinct because values are strictly validated.
 */
export function siteContentKeyOf(values: unknown): SiteContentKey | null {
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return null;
  const has = (name: string) => Object.prototype.hasOwnProperty.call(values, name);
  if (has('manual') && has('videos')) return 'manual';
  if (has('loginMenu')) return 'header';
  if (has('linkGroups')) return 'footer';
  if (has('hero') && has('sections')) return 'home';
  if (has('partners') && has('categories')) return 'partners';
  if (has('overrides')) return 'text';
  if (has('items')) return 'navigation';
  return null;
}

/**
 * The value as the validator would write it. PostgreSQL's jsonb stores object keys in its own order, so values read back
 * from the database are put into the validator's order; the engine compares JSON text to tell whether a save changed anything.
 */
function canonical(key: SiteContentKey | null, raw: unknown): SiteContentValues {
  if (key) {
    const checked = validateSiteContent(key, raw);
    if (checked.ok) return checked.value as SiteContentValues;
  }
  return raw as SiteContentValues;
}

const keyOfRow = (row: SiteContentRow): SiteContentKey | null => (isSiteContentKey(row.id) ? row.id : null);

const cannotChange = () => invalid('Site content documents cannot be created or deleted. Edit and publish them instead.');

export const siteContentAdapter: EntityAdapter<SiteContentValues, SiteContentRow> = {
  entityType: 'site-content',
  label: (values) => {
    const key = siteContentKeyOf(values);
    return key ? SITE_CONTENT_INFO[key].label : 'Site content';
  },
  async find(tx, id) {
    if (!isSiteContentKey(id)) return null;
    const row = await tx.siteContent.findUnique({ where: { id } });
    return row ? storedRow(row) : virtualRow(id, await effectiveDefault(id, tx));
  },
  live: (row) => canonical(keyOfRow(row), row.value),
  draftValues: (row) => (row.draft === null ? null : canonical(keyOfRow(row), row.draft)),
  columnData: (values) => ({ value: values }),
  async verify(tx, values) {
    const key = siteContentKeyOf(values);
    if (!key) throw invalid('This is not a known content document.');
    const { problems } = await checkSiteContentReferences(tx, key, values as never, { measure: false });
    if (problems.length > 0) throw invalid('Some fields are invalid.', problems);
  },
  async update(tx, id, version, data) {
    if (version === 0) {
      // The row does not exist yet: this is the first save (or the first publish of the untouched built-in content).
      // `skipDuplicates` turns "someone created it meanwhile" into a count of 0, which the engine reports as a
      // conflict, without failing (and thereby aborting) the transaction.
      if (!isSiteContentKey(id)) return 0;
      const value = (data.value ?? (await effectiveDefault(id, tx))) as Prisma.InputJsonValue;
      const status: PublicationStatus = data.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
      const created = await tx.siteContent.createMany({
        data: [{
          id,
          status,
          value,
          version: 1,
          publishedAt: data.publishedAt instanceof Date ? data.publishedAt : null,
          updatedById: typeof data.updatedById === 'string' ? data.updatedById : null,
        }],
        skipDuplicates: true,
      });
      return created.count;
    }
    return (await tx.siteContent.updateMany({ where: { id, version }, data: data as Prisma.SiteContentUpdateManyMutationInput })).count;
  },
  create: () => { throw cannotChange(); },
  newId: () => { throw cannotChange(); },
  remove: async () => { throw cannotChange(); },
  extras: async (_db, row) => ({ key: row.id, customised: !row.virtual }),
  allowUnpublish: false,
  allowArchive: false,
  allowDelete: false,
};

export const siteContentModule: ModuleDefinition<SiteContentValues, SiteContentRow> = {
  async parseValues(v, input, { db, id }) {
    if (id === undefined || !isSiteContentKey(id)) throw notFound();
    const checked = validateSiteContent(id, input);
    if (!checked.ok) {
      // The paths are relative to the document, exactly the ones the Admin form addresses.
      for (const issue of checked.issues) v.fail(issue.field, issue.message);
      v.throwIfInvalid();
      throw invalid('The content is not valid.');
    }
    const { problems, sizes } = await checkSiteContentReferences(db, id, checked.value, { measure: true });
    for (const problem of problems) v.fail(problem.field, problem.message);
    v.throwIfInvalid();
    // The pixel size of an uploaded image always comes from the stored file, never from the browser.
    return mapSiteImages(id, checked.value, (image) => {
      const size = image.assetId ? sizes.get(image.assetId) : undefined;
      return size ? { ...image, width: size.width, height: size.height } : image;
    }) as SiteContentValues;
  },

  /** The six documents in their fixed order; a key without a row appears as a virtual row. Paging does not apply. */
  async list(db) {
    const rows = await db.siteContent.findMany({ where: { id: { in: [...SITE_CONTENT_KEYS] } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const defaults = byId.size < SITE_CONTENT_KEYS.length ? await effectiveDefaults(db) : null;
    const ordered = SITE_CONTENT_KEYS.map((key) => {
      const row = byId.get(key);
      return row ? storedRow(row) : virtualRow(key, (defaults as SiteContentMap)[key]);
    });
    return { rows: ordered, total: ordered.length };
  },
};

const warnMissingTable = createMissingTableWarning('The preview shows the built-in content.');

/**
 * Every document with the pending drafts applied: draft, else the saved value, else the effective default, each
 * validated exactly like the public endpoint (an invalid stored value falls back to the effective default).
 */
export async function previewSiteContentValues(db: Db): Promise<SiteContentMap> {
  let rows: Array<{ id: string; value: Prisma.JsonValue; draft: Prisma.JsonValue | null }> = [];
  try {
    rows = await db.siteContent.findMany({ select: { id: true, value: true, draft: true } });
  } catch (error) {
    if (!isTableUnavailableError(error)) throw error;
    warnMissingTable();
  }
  return resolveSiteContent(new Map(rows.map((row) => [row.id, row.draft ?? row.value])), () => effectiveDefaults(db), (key) => {
    console.warn(`The stored site content "${key}" does not pass validation; the built-in content is shown in the preview.`);
  });
}
