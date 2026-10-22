import type { AdminRecord, AdminRecordMeta } from '@nhis/shared-types';
import { Prisma, type PublicationStatus } from '@prisma/client';
import { conflict, diffFields, getDb, invalidState, notFound, writeAudit, type AdminContext, type Tx } from '../../common/admin';
import { AdminHttpError } from '../../common/admin/errors';

/** Columns every content table shares (see prisma/schema.prisma). */
export interface RowBase {
  id: string;
  status: PublicationStatus;
  version: number;
  draft: Prisma.JsonValue | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  updatedById: string | null;
}

/** Everything the lifecycle engine needs to know about one content type. */
export interface EntityAdapter<F, Row extends RowBase> {
  /** Used for audit entries and revisions, e.g. "hospital". */
  entityType: string;
  /** Human-readable record name for audit summaries. */
  label(values: F): string;
  find(tx: Tx, id: string): Promise<Row | null>;
  /** Live (published) values stored in the typed columns. */
  live(row: Row): F;
  /** The pending draft values (stored as JSON) or null. */
  draftValues(row: Row): F | null;
  /** Prisma update data that writes `values` into the live columns (including derived columns such as searchText). */
  columnData(values: F): Record<string, unknown>;
  /** Extra work after the live values changed (e.g. page translations). */
  afterLiveWrite?(tx: Tx, row: Row, values: F): Promise<void>;
  /** Cross-record checks before values are stored (referenced assets/documents exist, directory columns, ...). */
  verify?(tx: Tx, values: F): Promise<void>;
  /** Guarded update: must update only when `version` still matches and return the number of rows changed. */
  update(tx: Tx, id: string, version: number, data: Record<string, unknown>): Promise<number>;
  create(tx: Tx, input: { id: string; values: F; userId: string; now: Date; scope?: string }): Promise<Row>;
  newId(): string;
  remove(tx: Tx, row: Row): Promise<void>;
  /** Storage keys of files that became unreferenced by the removal; they are deleted after the transaction commits. */
  collectOrphans?(tx: Tx, row: Row): Promise<string[]>;
  /** Throws REFERENCED/INVALID_STATE when hard deletion would be unsafe. */
  deleteGuard?(tx: Tx, row: Row): Promise<void>;
  /** Extra DTO fields (asset info, source row, ...) for the record envelope. */
  extras?(tx: Tx | ReturnType<typeof getDb>, row: Row, values: F, published: F | null): Promise<Record<string, unknown>>;
  /** Content types whose pages must stay public (core pages) cannot be unpublished or archived. */
  allowUnpublish?: boolean;
  allowArchive?: boolean;
  allowDelete?: boolean;
}

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type DbOrTx = ReturnType<typeof getDb> | Tx;

async function emailOf(db: DbOrTx, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await db.adminUser.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email ?? null;
}

export async function toRecord<F, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>,
  db: DbOrTx,
  row: Row,
  emails?: ReadonlyMap<string, string>,
): Promise<AdminRecord<F> & Record<string, unknown>> {
  const live = adapter.live(row);
  const draft = adapter.draftValues(row);
  const published = row.status === 'PUBLISHED' ? live : null;
  const values = draft ?? live;
  const email = row.updatedById ? emails?.get(row.updatedById) ?? (emails ? null : await emailOf(db, row.updatedById)) : null;
  const meta: AdminRecordMeta = {
    status: row.status,
    version: row.version,
    hasDraft: draft !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    updatedByEmail: email,
  };
  const extras = adapter.extras ? await adapter.extras(db, row, values, published) : {};
  return { id: row.id, meta, values, published, ...extras };
}

/** Batch version for lists: one query for all editor e-mails. */
export async function toRecords<F, Row extends RowBase>(adapter: EntityAdapter<F, Row>, db: DbOrTx, rows: Row[]) {
  const ids = [...new Set(rows.map((r) => r.updatedById).filter((x): x is string => x !== null))];
  const users = ids.length ? await db.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
  const emails = new Map(users.map((u) => [u.id, u.email]));
  return Promise.all(rows.map((row) => toRecord(adapter, db, row, emails)));
}

export async function getRecord<F, Row extends RowBase>(adapter: EntityAdapter<F, Row>, id: string) {
  const db = getDb();
  const row = await adapter.find(db as unknown as Tx, id);
  if (!row) throw notFound();
  return toRecord(adapter, db, row);
}

async function load<F, Row extends RowBase>(adapter: EntityAdapter<F, Row>, tx: Tx, id: string, expectedVersion: number): Promise<Row> {
  const row = await adapter.find(tx, id);
  if (!row) throw notFound();
  if (row.version !== expectedVersion) {
    throw conflict('This record was changed by someone else. Reload the latest version before continuing.', await toRecord(adapter, tx, row));
  }
  return row;
}

async function write<F, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, tx: Tx, row: Row, data: Record<string, unknown>, userId: string,
): Promise<Row> {
  const count = await adapter.update(tx, row.id, row.version, { ...data, version: row.version + 1, updatedById: userId });
  if (count !== 1) {
    const latest = await adapter.find(tx, row.id);
    throw conflict('This record was changed by someone else. Reload the latest version before continuing.', latest ? await toRecord(adapter, tx, latest) : undefined);
  }
  const fresh = await adapter.find(tx, row.id);
  if (!fresh) throw notFound();
  return fresh;
}

async function revision<F, Row extends RowBase>(adapter: EntityAdapter<F, Row>, tx: Tx, row: Row, action: string, userId: string): Promise<void> {
  await tx.contentRevision.create({
    data: { entityType: adapter.entityType, entityId: row.id, version: row.version, action, payload: json(adapter.live(row)), createdById: userId },
  });
}

const tx = <T>(fn: (tx: Tx) => Promise<T>) => getDb().$transaction(fn, { timeout: 30_000 });

type Ctx = Pick<AdminContext, 'user' | 'ip'>;
const audit = (t: Tx, ctx: Ctx, adapter: EntityAdapter<never, never> | { entityType: string }, action: string, id: string, summary: string, detail: Record<string, unknown> = {}) =>
  writeAudit(t, { user: ctx.user, ip: ctx.ip }, { action, entityType: adapter.entityType, entityId: id, summary, detail });

/* ------------------------------------------------------------------ lifecycle operations */

export async function createRecord<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, ctx: Ctx, values: F, options: { id?: string; scope?: string; transaction?: Tx } = {},
) {
  const id = options.id ?? adapter.newId();
  return (options.transaction ? <T>(fn: (t: Tx) => Promise<T>) => fn(options.transaction!) : tx)(async (t) => {
    await adapter.verify?.(t, values);
    const row = await adapter.create(t, { id, values, userId: ctx.user.id, now: new Date(), scope: options.scope });
    await audit(t, ctx, adapter, 'CREATE', row.id, `Created ${adapter.entityType} "${adapter.label(values)}" as a draft`, { values });
    return toRecord(adapter, t, row);
  });
}

/** Saves edits. A published record keeps its live values; the edit waits in `draft` until it is published. */
export async function saveRecord<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, ctx: Ctx, id: string, values: F, expectedVersion: number, transaction?: Tx,
) {
  return (transaction ? <T>(fn: (t: Tx) => Promise<T>) => fn(transaction) : tx)(async (t) => {
    const row = await load(adapter, t, id, expectedVersion);
    if (row.status === 'ARCHIVED') throw invalidState('Archived records cannot be edited. Restore the record first.');
    await adapter.verify?.(t, values);
    const before = (adapter.draftValues(row) ?? adapter.live(row)) as F;
    const fields = Object.keys(values);
    let fresh: Row;
    if (row.status === 'PUBLISHED') {
      const live = adapter.live(row);
      fresh = await write(adapter, t, row, { draft: sameJson(values, live) ? Prisma.DbNull : json(values) }, ctx.user.id);
    } else {
      fresh = await write(adapter, t, row, { ...adapter.columnData(values), draft: Prisma.DbNull }, ctx.user.id);
      await adapter.afterLiveWrite?.(t, fresh, values);
    }
    const diff = diffFields(before as Record<string, unknown>, values as Record<string, unknown>, fields as string[]);
    await audit(t, ctx, adapter, 'UPDATE', id, `Edited ${adapter.entityType} "${adapter.label(values)}"${row.status === 'PUBLISHED' ? ' (saved as draft, not yet published)' : ''}`, diff);
    return toRecord(adapter, t, fresh);
  });
}

export async function discardDraft<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, ctx: Ctx, id: string, expectedVersion: number,
) {
  return tx(async (t) => {
    const row = await load(adapter, t, id, expectedVersion);
    if (adapter.draftValues(row) === null) throw invalidState('There is no draft to discard.');
    const fresh = await write(adapter, t, row, { draft: Prisma.DbNull }, ctx.user.id);
    await audit(t, ctx, adapter, 'DISCARD_DRAFT', id, `Discarded the draft of ${adapter.entityType} "${adapter.label(adapter.live(row))}"`);
    return toRecord(adapter, t, fresh);
  });
}

export async function publishRecord<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, ctx: Ctx, id: string, expectedVersion: number,
) {
  return tx(async (t) => {
    const row = await load(adapter, t, id, expectedVersion);
    if (row.status === 'ARCHIVED') throw invalidState('Archived records must be restored before they can be published.');
    const draft = adapter.draftValues(row);
    if (row.status === 'PUBLISHED' && draft === null) throw invalidState('There are no unpublished changes to publish.');
    const now = new Date();
    let fresh: Row;
    if (draft !== null) {
      await adapter.verify?.(t, draft);
      fresh = await write(adapter, t, row, { ...adapter.columnData(draft), draft: Prisma.DbNull, status: 'PUBLISHED', publishedAt: now, archivedAt: null }, ctx.user.id);
      await adapter.afterLiveWrite?.(t, fresh, draft);
    } else {
      await adapter.verify?.(t, adapter.live(row));
      fresh = await write(adapter, t, row, { status: 'PUBLISHED', publishedAt: now, archivedAt: null }, ctx.user.id);
    }
    await revision(adapter, t, fresh, 'PUBLISH', ctx.user.id);
    await audit(t, ctx, adapter, 'PUBLISH', id, `Published ${adapter.entityType} "${adapter.label(adapter.live(fresh))}"`, { version: fresh.version });
    return toRecord(adapter, t, fresh);
  });
}

export async function unpublishRecord<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, ctx: Ctx, id: string, expectedVersion: number,
) {
  return tx(async (t) => {
    const row = await load(adapter, t, id, expectedVersion);
    if (adapter.allowUnpublish === false) throw invalidState('This content must stay published. Edit and publish a new version instead.');
    if (row.status !== 'PUBLISHED') throw invalidState('Only published records can be unpublished.');
    const draft = adapter.draftValues(row);
    // Pending edits are merged into the live values so that nothing is lost when the record goes private.
    const fresh = await write(adapter, t, row, { ...(draft ? adapter.columnData(draft) : {}), draft: Prisma.DbNull, status: 'DRAFT' }, ctx.user.id);
    if (draft) await adapter.afterLiveWrite?.(t, fresh, draft);
    await revision(adapter, t, fresh, 'UNPUBLISH', ctx.user.id);
    await audit(t, ctx, adapter, 'UNPUBLISH', id, `Unpublished ${adapter.entityType} "${adapter.label(adapter.live(fresh))}"`);
    return toRecord(adapter, t, fresh);
  });
}

export async function archiveRecord<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, ctx: Ctx, id: string, expectedVersion: number,
) {
  return tx(async (t) => {
    const row = await load(adapter, t, id, expectedVersion);
    if (adapter.allowArchive === false) throw invalidState('This content cannot be archived.');
    if (row.status === 'ARCHIVED') throw invalidState('The record is already archived.');
    const draft = adapter.draftValues(row);
    const fresh = await write(adapter, t, row, { ...(draft ? adapter.columnData(draft) : {}), draft: Prisma.DbNull, status: 'ARCHIVED', archivedAt: new Date() }, ctx.user.id);
    if (draft) await adapter.afterLiveWrite?.(t, fresh, draft);
    await revision(adapter, t, fresh, 'ARCHIVE', ctx.user.id);
    await audit(t, ctx, adapter, 'ARCHIVE', id, `Archived ${adapter.entityType} "${adapter.label(adapter.live(fresh))}"`, { wasPublished: row.status === 'PUBLISHED' });
    return toRecord(adapter, t, fresh);
  });
}

export async function restoreRecord<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, ctx: Ctx, id: string, expectedVersion: number,
) {
  return tx(async (t) => {
    const row = await load(adapter, t, id, expectedVersion);
    if (row.status !== 'ARCHIVED') throw invalidState('Only archived records can be restored.');
    const fresh = await write(adapter, t, row, { status: 'DRAFT', archivedAt: null }, ctx.user.id);
    await audit(t, ctx, adapter, 'RESTORE', id, `Restored ${adapter.entityType} "${adapter.label(adapter.live(fresh))}" as a draft`);
    return toRecord(adapter, t, fresh);
  });
}

/** Hard delete: only for a draft that was never published and is not referenced. Everything else is archived instead. */
export async function deleteRecord<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, ctx: Ctx, id: string, expectedVersion: number, removeFile: (key: string) => Promise<void>,
): Promise<{ ok: true }> {
  const orphanKeys: string[] = [];
  await tx(async (t) => {
    const row = await load(adapter, t, id, expectedVersion);
    if (adapter.allowDelete === false) throw invalidState('This content cannot be deleted.');
    if (row.status !== 'DRAFT' || row.publishedAt !== null) {
      throw new AdminHttpError('INVALID_STATE', 'Only drafts that were never published can be deleted. Archive this record instead; archived records can be restored.');
    }
    const history = await t.contentRevision.count({ where: { entityType: adapter.entityType, entityId: row.id } });
    if (history > 0) throw new AdminHttpError('INVALID_STATE', 'This record has publishing history and cannot be deleted. Archive it instead.');
    await adapter.deleteGuard?.(t, row);
    await adapter.remove(t, row);
    orphanKeys.push(...((await adapter.collectOrphans?.(t, row)) ?? []));
    await audit(t, ctx, adapter, 'DELETE', row.id, `Deleted draft ${adapter.entityType} "${adapter.label(adapter.live(row))}"`);
  });
  // Files are removed only after the database change committed; a failure here leaves an unreferenced file, never a broken record.
  await Promise.all(orphanKeys.map((key) => removeFile(key).catch(() => undefined)));
  return { ok: true };
}
