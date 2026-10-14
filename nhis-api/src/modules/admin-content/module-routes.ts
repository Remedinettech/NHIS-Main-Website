import {
  adminJson, getDb, invalid, pagedResponse, parseExpectedVersion, parseIdParam, parsePaging, readJsonBody, requireCapability, Validator,
  withAdmin, type AdminContext,
} from '../../common/admin';
import { getStorage } from '../storage';
import {
  archiveRecord, createRecord, deleteRecord, discardDraft, getRecord, publishRecord, restoreRecord, saveRecord, toRecords,
  unpublishRecord, type EntityAdapter, type RowBase,
} from './engine';
import type { ModuleDefinition } from './shared';

export const ACTIONS = ['discard-draft', 'publish', 'unpublish', 'archive', 'restore'] as const;
export type ModuleAction = (typeof ACTIONS)[number];

interface Options {
  /** Pages are addressed by slug and cannot be created or deleted. */
  creatable?: boolean;
  deletable?: boolean;
}

/**
 * Builds the thin route handlers shared by every content module (see docs/admin-backend-design.md).
 * Reads need any signed-in role; create/save/discard need `editContent`; publish, unpublish, archive, restore and
 * delete need `publish`. Mutations always carry CSRF + `expectedVersion` (checked in the engine).
 */
export function moduleRoutes<F extends object, Row extends RowBase>(
  adapter: EntityAdapter<F, Row>, def: ModuleDefinition<F, Row>, options: Options = {},
) {
  const { creatable = true, deletable = true } = options;

  const list = withAdmin(async (ctx) => {
    const params = new URL(ctx.request.url).searchParams;
    const paging = parsePaging(params, 25, 100);
    const { rows, total } = await def.list(getDb(), params, paging);
    return adminJson(pagedResponse(await toRecords(adapter, getDb(), rows), total, paging));
  });

  const create = withAdmin(async (ctx) => {
    requireCapability(ctx, 'editContent');
    if (!creatable) throw invalid('This content cannot be created.');
    const body = await readJsonBody(ctx.request);
    const v = new Validator();
    v.noUnknownKeys(body, def.parseScope ? ['values', 'directoryId'] : ['values']);
    const scope = def.parseScope ? await def.parseScope(v, body, getDb()) : undefined;
    const values = await def.parseValues(v, body.values, { db: getDb(), scope });
    v.throwIfInvalid();
    return adminJson({ data: await createRecord(adapter, ctx, values, { scope }) }, { status: 201 });
  });

  const get = withAdmin<{ id: string }>(async (ctx) => adminJson({ data: await getRecord(adapter, parseIdParam(ctx.params.id)) }));

  const put = withAdmin<{ id: string }>(async (ctx) => {
    requireCapability(ctx, 'editContent');
    const id = parseIdParam(ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const v = new Validator();
    v.noUnknownKeys(body, ['values', 'expectedVersion']);
    const expectedVersion = parseExpectedVersion(body);
    const values = await def.parseValues(v, body.values, { db: getDb(), id });
    v.throwIfInvalid();
    return adminJson({ data: await saveRecord(adapter, ctx, id, values, expectedVersion) });
  });

  const del = withAdmin<{ id: string }>(async (ctx) => {
    requireCapability(ctx, 'publish');
    if (!deletable) throw invalid('This content cannot be deleted.');
    const raw = new URL(ctx.request.url).searchParams.get('expectedVersion');
    const v = new Validator();
    const expectedVersion = v.int(raw !== null && /^\d{1,10}$/.test(raw) ? Number(raw) : undefined, 'expectedVersion', 0, 2_000_000_000);
    v.throwIfInvalid('expectedVersion query parameter is required.');
    const removeFile = (key: string) => getStorage().delete(key);
    return adminJson(await deleteRecord(adapter, ctx, parseIdParam(ctx.params.id), expectedVersion as number, removeFile));
  });

  const action = withAdmin<{ id: string; action: string }>(async (ctx: AdminContext & { params: { id: string; action: string } }) => {
    const name = ctx.params.action as ModuleAction;
    if (!(ACTIONS as readonly string[]).includes(name)) throw invalid('Unknown action.');
    requireCapability(ctx, name === 'discard-draft' ? 'editContent' : 'publish');
    const body = await readJsonBody(ctx.request);
    const v = new Validator();
    v.noUnknownKeys(body, ['expectedVersion']);
    const expectedVersion = parseExpectedVersion(body);
    const id = parseIdParam(ctx.params.id);
    const run = {
      'discard-draft': discardDraft, publish: publishRecord, unpublish: unpublishRecord, archive: archiveRecord, restore: restoreRecord,
    }[name];
    return adminJson({ data: await run(adapter, ctx, id, expectedVersion) });
  });

  return { list, create, get, put, del, action };
}
