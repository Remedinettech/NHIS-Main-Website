import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PartnersContent, PartnerEntry } from '@nhis/shared-types';
import { adminJson, AdminHttpError, getDb, invalid, notFound, readJsonBody, requireCapability, Validator, withAdmin, writeAudit, type AdminContext, type Tx } from '../../common/admin';
import { createRecord, saveRecord, type EntityAdapter, type RowBase } from '../admin-content/engine';
import { hospitalAdapter, hospitalModule } from '../admin-content/hospitals.admin';
import { documentAdapter, documentModule } from '../admin-content/documents.admin';
import { contactAdapter, contactModule } from '../admin-content/contacts.admin';
import { announcementAdapter, announcementModule } from '../admin-content/announcements.admin';
import { siteContentAdapter, siteContentModule } from '../admin-content/site-content.admin';
import type { ModuleDefinition } from '../admin-content/shared';
import { columns, importLimits, modules, readWorkbook, template, type ImportModule } from './workbook';

/** The largest signed plan that /confirm accepts (see readJsonBody there); the preview refuses a larger one up front. */
const MAX_TOKEN_BYTES = 15_000_000;

type Values = Record<string, unknown>;
interface PlanRow { row: number; id: string; scope?: string; version: number; values: Values; kind: 'new' | 'update' | 'invalid' | 'duplicate'; errors: { field: string; message: string }[] }
interface Plan { actor: string; module: ImportModule; mode: 'create' | 'update'; expires: number; nonce: string; rows: PlanRow[] }
interface Result { row: number; id: string; state: 'created' | 'updated' | 'failed' | 'skipped'; message?: string }
const definitions = { hospitals: [hospitalAdapter, hospitalModule], documents: [documentAdapter, documentModule], contacts: [contactAdapter, contactModule], announcements: [announcementAdapter, announcementModule] };
function definition(module: Exclude<ImportModule, 'partners'>) {
  // All module adapters implement the same lifecycle; values are validated by the matching module before use.
  return definitions[module] as unknown as [EntityAdapter<Values, RowBase>, ModuleDefinition<Values, RowBase>];
}
/**
 * The HMAC key of the preview tokens. There is deliberately no default and no per-process random fallback: previews must
 * verify on every API worker and after a restart, and a guessable or missing key would let anybody mint a plan. Without a
 * proper key (at least 32 characters, not blank) every import route that signs or verifies a token fails closed.
 */
function key() {
  const value = process.env.ADMIN_IMPORT_SIGNING_KEY;
  if (value && value.trim().length >= 32) return value;
  console.error('ADMIN_IMPORT_SIGNING_KEY is missing or shorter than 32 characters; Excel imports are disabled.');
  throw new AdminHttpError('INTERNAL_ERROR', 'Excel import is not configured: set ADMIN_IMPORT_SIGNING_KEY (at least 32 random characters) in the API environment and restart the API.');
}
const sign = (data: string) => crypto.createHmac('sha256', key()).update(data).digest('base64url');
export function encodePlan(plan: Plan) { const data = Buffer.from(JSON.stringify(plan)).toString('base64url'); return `${data}.${sign(data)}`; }
export function decodePlan(token: string, actor: string): Plan {
  const [data, signature, extra] = token.split('.'); const expected = Buffer.from(sign(data ?? ''));
  // Compare bytes, not string lengths: a signature of the same length in characters can be longer in UTF-8.
  const supplied = Buffer.from(signature ?? '');
  if (!data || !signature || extra !== undefined || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw invalid('Invalid import preview. Upload and validate again.');
  let plan: Plan;
  try { plan = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { throw invalid('Invalid preview.'); }
  const shaped = typeof plan === 'object' && plan !== null && typeof plan.actor === 'string' && typeof plan.expires === 'number'
    && modules.includes(plan.module) && (plan.mode === 'create' || plan.mode === 'update') && Array.isArray(plan.rows);
  if (!shaped) throw invalid('Invalid preview. Upload and validate again.');
  if (plan.actor !== actor || plan.expires < Date.now()) throw invalid('Preview expired or belongs to another user. Upload again.');
  return plan;
}
/** Fails closed before any work is done when the signing key is not configured. */
export const requireSigningKey = () => { key(); };
const json = (v: unknown) => v as Prisma.InputJsonValue;
function moduleName(value: string | null): ImportModule { if (!modules.includes(value as ImportModule)) throw invalid('Unknown import module.'); return value as ImportModule; }
async function headersFor(module: ImportModule, directoryId: string) {
  if (module !== 'contacts') return columns[module];
  const dir = await getDb().contactDirectory.findUnique({ where: { id: directoryId } });
  if (!dir) throw invalid('Select an existing directory before downloading or importing contacts.');
  return [...columns.contacts, ...(dir.columns as { key: string }[]).map(c => `cell.${c.key}`)];
}
function patched(base: Values, cells: Record<string, string>): Values {
  const v = { ...base };
  for (const [key, raw] of Object.entries(cells)) {
    if (['id', 'directoryId'].includes(key) || raw === '') continue;
    v[key] = raw === '#CLEAR' ? null : ['sortOrder'].includes(key) ? Number(raw) : raw;
  }
  return v;
}
const defaults: Record<string, Values> = {
  hospitals: Object.fromEntries(columns.hospitals.filter(k => k !== 'id').map(k => [k, ''])),
  documents: { category: '', audience: '', sortOrder: 0, labelEn: '', labelTa: '', titleEn: '', titleTa: '', dateLabelEn: null, dateLabelTa: null, assetId: null, language: null, availabilityNote: null },
  announcements: { kind: 'general', severity: 'notice', messageEn: [], messageTa: [], startsAt: null, endsAt: null, sortOrder: 0 },
};
async function validateRecord(module: Exclude<ImportModule, 'partners'>, cells: Record<string, string>, id: string, update: boolean, db: Tx, scope?: string) {
  const [adapter, def] = definition(module);
  const existing = await adapter.find(db, id);
  if (update && !existing) throw invalid('No record with this ID.');
  if (!update && existing) throw invalid('ID already exists. Use update mode.');
  if (existing?.status === 'ARCHIVED') throw invalid('Restore archived records before importing updates.');
  let base: Values = existing ? adapter.draftValues(existing) ?? adapter.live(existing) : defaults[module] ?? { cells: {}, sortOrder: 0 };
  let values = patched(base, cells);
  if (module === 'contacts') {
    const dir = await db.contact.findUnique({ where: { id }, select: { directoryId: true } });
    if (dir && dir.directoryId !== scope) throw invalid('Record belongs to another directory.');
    if (cells.directoryId !== scope) throw invalid('directoryId must match the selected template directory.');
    const contactCells = { ...(base.cells as Record<string, string>) };
    for (const [k, v] of Object.entries(cells)) if (k.startsWith('cell.') && v !== '') contactCells[k.slice(5)] = v === '#CLEAR' ? '' : v;
    values = { cells: contactCells, sortOrder: values.sortOrder };
  }
  if (module === 'announcements') for (const lang of ['messageEn', 'messageTa']) if (cells[lang]) values[lang] = cells[lang] === '#CLEAR' ? [] : [{ type: 'text', text: cells[lang] }];
  const parsed = await def.parseValues(new Validator(), values, { db, id: update ? id : undefined, scope });
  await adapter.verify?.(db, parsed);
  return { values: parsed, version: existing?.version ?? 0 };
}
/**
 * Partner rows are applied one after the other to the stored document, exactly as processing will apply them, so each row
 * is validated against the result of the rows before it: workbook order is kept (a new partner without sortOrder goes to
 * the end, after the previous ones) and a workbook that would exceed a limit of the whole document fails in the preview.
 */
async function partnerSession(db: Tx) {
  const row = await siteContentAdapter.find(db, 'partners'); if (!row) throw notFound();
  let working = structuredClone(siteContentAdapter.draftValues(row) ?? siteContentAdapter.live(row)) as PartnersContent;
  return {
    version: row.version,
    async apply(cells: Record<string, string>, update: boolean) {
      const old = working.partners.find(p => p.id === cells.id);
      if (update !== !!old) throw invalid(update ? 'Partner ID not found.' : 'Partner ID already exists.');
      const index = old ? working.partners.indexOf(old) : -1;
      const v: PartnerEntry = old ? { ...old, name: { ...old.name }, logo: { ...old.logo, alt: { ...old.logo.alt } } } : { id: cells.id, categoryId: '', name: { en: '', ta: '' }, logo: { assetId: null, builtIn: null, alt: { en: '', ta: '' }, width: null, height: null }, url: null, visible: true };
      for (const [key, raw] of Object.entries(cells)) {
        if (raw === '' || ['id', 'sortOrder'].includes(key)) continue;
        const text = raw === '#CLEAR' ? '' : raw;
        if (key === 'nameEn') v.name.en = text; else if (key === 'nameTa') v.name.ta = text;
        else if (key === 'altEn') v.logo.alt.en = text; else if (key === 'altTa') v.logo.alt.ta = text;
        else if (key === 'logoAssetId') { v.logo.assetId = text || null; v.logo.builtIn = null; }
        else if (key === 'visible') { if (!['true', 'false'].includes(text)) throw invalid('visible must be true or false.'); v.visible = text === 'true'; }
        else if (key === 'categoryId') v.categoryId = text; else if (key === 'url') v.url = text || null;
      }
      const next = structuredClone(working);
      next.partners = next.partners.filter(p => p.id !== v.id);
      if (cells.sortOrder && !/^\d{1,4}$/.test(cells.sortOrder)) throw invalid('sortOrder must be a valid resulting position.');
      const position = cells.sortOrder ? Number(cells.sortOrder) : old ? index : next.partners.length;
      if (position < 0 || position > next.partners.length) throw invalid('sortOrder must be a valid resulting position.');
      next.partners.splice(position, 0, v);
      const parsed = await siteContentModule.parseValues(new Validator(), next, { db, id: 'partners' }) as PartnersContent;
      working = parsed;
      return { values: { entry: parsed.partners.find(p => p.id === v.id)!, position } as unknown as Values, version: row.version };
    },
  };
}
function issues(error: unknown) { return error instanceof AdminHttpError ? error.extras.details?.length ? error.extras.details : [{ field: 'record', message: error.message }] : [{ field: 'record', message: 'Validation failed. Please retry or check server configuration.' }]; }

export const downloadTemplate = withAdmin(async ctx => {
  requireCapability(ctx, 'editContent');
  const params = new URL(ctx.request.url).searchParams; const module = moduleName(params.get('module'));
  const bytes = await template(module, await headersFor(module, params.get('directoryId') ?? ''));
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${module}-template.xlsx"` } });
});
export const previewImport = withAdmin(async ctx => {
  requireCapability(ctx, 'editContent');
  requireSigningKey();
  const max = importLimits().bytes;
  // Bound the entire multipart body before the platform buffers/parses it.
  const reader = ctx.request.body?.getReader(); if (!reader) throw invalid('Workbook required.');
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > max + 65536) { await reader.cancel(); throw invalid('Upload too large.'); } chunks.push(part.value); }
  const request = new Request(ctx.request.url, { method: 'POST', headers: ctx.request.headers, body: Buffer.concat(chunks) });
  let form: FormData; try { form = await request.formData(); } catch { throw invalid('Invalid upload.'); }
  const module = moduleName(String(form.get('module'))); const mode = String(form.get('mode'));
  if (mode !== 'create' && mode !== 'update') throw invalid('Select create or update mode.');
  const file = form.get('file'); if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.size > max) throw invalid('Upload an .xlsx workbook within the size limit.');
  const scope = String(form.get('directoryId') ?? '');
  const rawRows = await readWorkbook(Buffer.from(await file.arrayBuffer()), await headersFor(module, scope));
  if (module === 'partners' && rawRows.length > 40) throw invalid('Partners imports support up to 40 rows.');
  const counts = new Map<string, number>(); rawRows.forEach(r => { if (r.cells.id) counts.set(r.cells.id, (counts.get(r.cells.id) ?? 0) + 1); });
  const rows: PlanRow[] = [];
  const partners = module === 'partners' ? await partnerSession(getDb()) : null;
  for (const raw of rawRows) {
    const id = raw.cells.id || (module === 'partners' ? '' : definition(module)[0].newId());
    const row: PlanRow = { row: raw.row, id, scope, version: 0, values: {}, kind: mode === 'create' ? 'new' : 'update', errors: [...raw.errors] };
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || (mode === 'update' && !raw.cells.id)) row.errors.push({ field: 'id', message: 'A valid stable ID is required.' });
    if ((counts.get(id) ?? 0) > 1) { row.kind = 'duplicate'; row.errors.push({ field: 'id', message: 'Duplicate identifier within this workbook.' }); }
    if (!row.errors.length) try {
      const parsed = partners ? await partners.apply(raw.cells, mode === 'update') : await validateRecord(module as Exclude<ImportModule, 'partners'>, raw.cells, id, mode === 'update', getDb(), scope);
      row.values = parsed.values; row.version = parsed.version;
    } catch (error) { row.errors.push(...issues(error)); }
    if (row.errors.length && row.kind !== 'duplicate') row.kind = 'invalid'; rows.push(row);
  }
  const plan: Plan = { actor: ctx.user.id, module, mode, expires: Date.now() + 30 * 60_000, nonce: crypto.randomUUID(), rows };
  const valid = rows.every(r => !r.errors.length);
  const token = valid ? encodePlan(plan) : null;
  if (token && token.length > MAX_TOKEN_BYTES) throw invalid('This workbook is too large to confirm in one step. Split it into smaller workbooks.');
  return adminJson({ rows, valid, token, limits: importLimits() });
});

function summary(job: { id: string; module: string; mode: string; state: string; cursor: number; total: number; results: unknown; createdAt: Date }) {
  const results = job.results as Result[];
  return { id: job.id, module: job.module, mode: job.mode, state: job.state, cursor: job.cursor, total: job.total, results, createdAt: job.createdAt, counts: Object.fromEntries(['created', 'updated', 'failed', 'skipped'].map(s => [s, results.filter(r => r.state === s).length])) };
}
export const confirmImport = withAdmin(async ctx => {
  requireCapability(ctx, 'editContent');
  requireSigningKey();
  const body = await readJsonBody(ctx.request, 16_000_000); if (typeof body.token !== 'string') throw invalid('Validated preview required.');
  const plan = decodePlan(body.token, ctx.user.id);
  const id = crypto.createHash('sha256').update(body.token).digest('hex');
  const job = await getDb().$transaction(async tx => {
    const created = await tx.contentImport.createMany({ data: [{ id, actorId: ctx.user.id, module: plan.module, mode: plan.mode, rows: json(plan.rows), total: plan.rows.length }], skipDuplicates: true });
    if (created.count) await writeAudit(tx, ctx, { action: 'IMPORT_START', entityType: 'content-import', entityId: id, summary: `Started ${plan.module} ${plan.mode} import (${plan.rows.length} rows)` });
    return tx.contentImport.findUniqueOrThrow({ where: { id } });
  });
  return adminJson({ data: summary(job) });
});

async function runRow(ctx: AdminContext, jobId: string) {
  // Row change, audit and checkpoint commit together. Job row lock serialises concurrent clicks/workers.
  return getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ContentImport" WHERE "id" = ${jobId} FOR UPDATE`;
    const job = await tx.contentImport.findUnique({ where: { id: jobId } });
    if (!job || job.actorId !== ctx.user.id) throw notFound();
    if (job.state === 'DONE') return;
    const rows = job.rows as unknown as PlanRow[]; const results = job.results as unknown as Result[];
    const row = rows[job.cursor]; if (!row) throw invalid('Invalid import checkpoint.');
    // Savepoint rolls back a failed row without losing its durable failure report.
    await tx.$executeRawUnsafe('SAVEPOINT import_row');
    let result: Result = { row: row.row, id: row.id, state: job.mode === 'create' ? 'created' : 'updated' };
    try {
      if (job.module === 'partners') {
        const stored = await siteContentAdapter.find(tx, 'partners'); if (!stored) throw notFound();
        const expected = rows[0].version + job.cursor;
        if (stored.version !== expected || results.some(r => r.state === 'failed')) throw invalid('Partners changed since preview or an earlier row failed. Revalidate a new workbook.');
        const values = structuredClone(siteContentAdapter.draftValues(stored) ?? siteContentAdapter.live(stored)) as PartnersContent;
        const entry = row.values.entry as PartnerEntry; const exists = values.partners.some(p => p.id === entry.id);
        if ((job.mode === 'update') !== exists) throw invalid('Partner identifier conflict.');
        values.partners = values.partners.filter(p => p.id !== entry.id); values.partners.splice(Number(row.values.position), 0, entry);
        const parsed = await siteContentModule.parseValues(new Validator(), values, { db: tx, id: 'partners' });
        await saveRecord(siteContentAdapter, ctx, 'partners', parsed, expected, tx);
      } else {
        const [adapter, def] = definition(moduleName(job.module) as Exclude<ImportModule, 'partners'>);
        const existing = await adapter.find(tx, row.id);
        if (job.mode === 'create' && existing) throw invalid('ID now exists. Revalidate the workbook.');
        const values = await def.parseValues(new Validator(), row.values, { db: tx, id: job.mode === 'update' ? row.id : undefined, scope: row.scope });
        if (job.mode === 'create') await createRecord(adapter, ctx, values, { id: row.id, scope: row.scope, transaction: tx });
        else await saveRecord(adapter, ctx, row.id, values, row.version, tx);
      }
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT import_row');
    } catch (error) {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT import_row');
      result = { row: row.row, id: row.id, state: 'failed', message: issues(error).map(i => `${i.field}: ${i.message}`).join('; ') };
    }
    results.push(result); const cursor = job.cursor + 1; const done = cursor === job.total;
    await tx.contentImport.update({ where: { id: jobId }, data: { cursor, results: json(results), state: done ? 'DONE' : 'RUNNING' } });
    await writeAudit(tx, ctx, { action: done ? 'IMPORT_COMPLETE' : 'IMPORT_ROW', entityType: 'content-import', entityId: jobId, summary: `${job.module}: ${cursor}/${job.total} rows processed`, detail: { result, ...(done ? { created: results.filter(r => r.state === 'created').length, updated: results.filter(r => r.state === 'updated').length, failed: results.filter(r => r.state === 'failed').length } : {}) } });
  }, { timeout: 30_000 });
}
export const processImport = withAdmin<{ id: string }>(async ctx => {
  requireCapability(ctx, 'editContent');
  for (let i = 0; i < importLimits().batch; i++) await runRow(ctx, ctx.params.id);
  const job = await getDb().contentImport.findUnique({ where: { id: ctx.params.id } }); if (!job || job.actorId !== ctx.user.id) throw notFound();
  return adminJson({ data: summary(job) });
});
export const importHistory = withAdmin(async ctx => {
  requireCapability(ctx, 'editContent'); const params = new URL(ctx.request.url).searchParams;
  const jobs = await getDb().contentImport.findMany({ where: { actorId: ctx.user.id, ...(params.get('module') ? { module: moduleName(params.get('module')) } : {}) }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, module: true, mode: true, state: true, cursor: true, total: true, results: true, createdAt: true } });
  return adminJson({ data: jobs.map(summary) });
});
