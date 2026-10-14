import type { AdminContactValues, ContactColumn } from '@nhis/shared-types';
import type { Contact, Prisma } from '@prisma/client';
import { invalid, notFound, queryString } from '../../common/admin';
import { normalizeSearch } from '../hospitals/hospital-search';
import type { EntityAdapter } from './engine';
import { listFilters, randomId, searchWords, type Db, type ModuleDefinition } from './shared';

const searchTextOf = (cells: Record<string, string>) => normalizeSearch(Object.values(cells).join(' '));
const cellsOf = (row: Contact): Record<string, string> => (row.cells ?? {}) as Record<string, string>;

const columnData = (v: AdminContactValues) => ({ cells: v.cells as Prisma.InputJsonValue, sortOrder: v.sortOrder, searchText: searchTextOf(v.cells) });

export const contactAdapter: EntityAdapter<AdminContactValues, Contact> = {
  entityType: 'contact',
  label: (v) => Object.values(v.cells).map((c) => c.trim()).filter(Boolean).slice(0, 2).join(' / ') || 'Contact',
  find: (tx, id) => tx.contact.findUnique({ where: { id } }),
  live: (r) => ({ cells: cellsOf(r), sortOrder: r.sortOrder }),
  draftValues: (r) => (r.draft as AdminContactValues | null) ?? null,
  columnData,
  update: async (tx, id, version, data) => (await tx.contact.updateMany({ where: { id, version }, data: data as Prisma.ContactUpdateManyMutationInput })).count,
  create: async (tx, { id, values, userId, scope }) => {
    if (!scope) throw invalid('directoryId is required.');
    return tx.contact.create({
      data: { id, directoryId: scope, ...columnData(values), status: 'DRAFT', version: 1, createdById: userId, updatedById: userId },
    });
  },
  newId: () => `ct_${randomId()}`,
  remove: async (tx, row) => { await tx.contact.delete({ where: { id: row.id } }); },
  extras: async (_db, row) => ({ directoryId: row.directoryId, sourceRow: row.sourceRow }),
};

async function directoryColumns(db: Pick<Db, 'contactDirectory'>, directoryId: string): Promise<ContactColumn[]> {
  const dir = await db.contactDirectory.findUnique({ where: { id: directoryId }, select: { columns: true } });
  if (!dir) throw notFound('Contact directory not found');
  return dir.columns as unknown as ContactColumn[];
}

export const contactModule: ModuleDefinition<AdminContactValues, Contact> = {
  async parseScope(v, body, db) {
    const id = v.string(body.directoryId, 'directoryId', { max: 64 });
    v.throwIfInvalid();
    await directoryColumns(db, id as string); // 404 for an unknown directory
    return id as string;
  },

  async parseValues(v, input, { db, id, scope }) {
    let directoryId = scope;
    if (!directoryId && id) {
      const row = await db.contact.findUnique({ where: { id }, select: { directoryId: true } });
      if (!row) throw notFound();
      directoryId = row.directoryId;
    }
    if (!directoryId) throw invalid('directoryId is required.');
    const columns = await directoryColumns(db, directoryId);
    const obj = v.object(input, 'values');
    if (!obj) return { cells: {}, sortOrder: 0 };
    v.noUnknownKeys(obj, ['cells', 'sortOrder']);
    const cellsInput = v.object(obj.cells, 'cells') ?? {};
    const cells: Record<string, string> = {};
    for (const key of Object.keys(cellsInput)) if (!columns.some((c) => c.key === key)) v.fail(`cells.${key}`, 'Unknown column for this directory.');
    for (const column of columns) {
      const text = v.string(cellsInput[column.key], `cells.${column.key}`, { max: 500, optional: true }) ?? '';
      if (text && column.kind === 'email' && !/^\S+@\S+\.\S+/.test(text)) v.fail(`cells.${column.key}`, 'Enter a valid e-mail address.');
      if (text && column.kind === 'phone' && !/\d{3,}/.test(text)) v.fail(`cells.${column.key}`, 'Enter a phone number.');
      cells[column.key] = text;
    }
    if (v.ok && Object.values(cells).every((c) => c === '')) v.fail('cells', 'Enter at least one value.');
    let sortOrder = v.int(obj.sortOrder, 'sortOrder', 0, 1_000_000, true);
    if (sortOrder === undefined) {
      const max = await db.contact.aggregate({ where: { directoryId }, _max: { sortOrder: true } });
      sortOrder = (max._max.sortOrder ?? 0) + 1;
    }
    v.throwIfInvalid();
    return { cells, sortOrder };
  },

  async list(db, params, paging) {
    const directoryId = queryString(params, 'directoryId', 64);
    if (!directoryId) throw invalid('directoryId is required.');
    const { q, status } = listFilters(params);
    const words = searchWords(q);
    const where: Prisma.ContactWhereInput = {
      directoryId,
      ...(status ? { status } : {}),
      ...(words.length ? { AND: words.map((w) => ({ searchText: { contains: w } })) } : {}),
    };
    const [total, rows] = await Promise.all([
      db.contact.count({ where }),
      db.contact.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], skip: paging.skip, take: paging.pageSize }),
    ]);
    return { rows, total };
  },
};
