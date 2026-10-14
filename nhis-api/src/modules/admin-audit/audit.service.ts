import type { AdminAuditEntry } from '@nhis/shared-types';
import type { Prisma } from '@prisma/client';
import { adminJson, getDb, pagedResponse, parsePaging, queryString, type AdminContext } from '../../common/admin';

/** GET /admin/audit — any signed-in role. Filters: entityType, entityId, actor (email, case-insensitive exact), page, pageSize. */
export async function listAudit(ctx: AdminContext): Promise<Response> {
  const params = new URL(ctx.request.url).searchParams;
  const paging = parsePaging(params, 50, 100);
  const entityType = queryString(params, 'entityType', 64);
  const entityIdRaw = queryString(params, 'entityId', 200);
  const actor = queryString(params, 'actor', 254);
  const where: Prisma.AuditLogWhereInput = {
    ...(entityType ? { entityType } : {}),
    ...(entityIdRaw ? { entityId: entityIdRaw } : {}),
    ...(actor ? { actorEmail: { equals: actor, mode: 'insensitive' } } : {}),
  };
  const db = getDb();
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: paging.skip, take: paging.pageSize }),
  ]);
  const data: AdminAuditEntry[] = rows.map((r) => ({
    id: r.id,
    actorEmail: r.actorEmail,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    detail: (r.detail && typeof r.detail === 'object' && !Array.isArray(r.detail) ? r.detail : {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }));
  return adminJson(pagedResponse(data, total, paging));
}
