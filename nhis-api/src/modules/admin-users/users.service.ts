import type { AdminRole, AdminUserRecord } from '@nhis/shared-types';
import type { Prisma } from '@prisma/client';
import {
  adminJson, AdminHttpError, assertPasswordPolicy, conflict, diffFields, forbidden, getDb, hashPassword, isUniqueViolation,
  notFound, pagedResponse, parseIdParam, parsePaging, queryEnum, queryString, readJsonBody, revokeUserSessions, Validator,
  writeAudit, type AdminContext, type Tx,
} from '../../common/admin';

export const ROLES: readonly AdminRole[] = ['ADMIN', 'EDITOR', 'PUBLISHER'];

type UserRow = { id: string; email: string; name: string; role: AdminRole; active: boolean; lastLoginAt: Date | null; createdAt: Date };

/** Never includes the password hash. */
export function toUserRecord(u: UserRow): AdminUserRecord {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null, createdAt: u.createdAt.toISOString(),
  };
}

const SELECT = { id: true, email: true, name: true, role: true, active: true, lastLoginAt: true, createdAt: true } as const;

/** Locks all active ADMIN rows for the rest of the transaction and returns their count. */
async function lockActiveAdmins(tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "AdminUser" WHERE "role" = 'ADMIN' AND "active" = true FOR UPDATE`;
  return rows.length;
}

export async function listUsersRequest(ctx: AdminContext): Promise<Response> {
  const params = new URL(ctx.request.url).searchParams;
  const paging = parsePaging(params, 25, 100);
  const q = queryString(params, 'q', 100);
  const role = queryEnum(params, 'role', ROLES);
  const activeRaw = queryEnum(params, 'active', ['true', 'false'] as const);
  const where: Prisma.AdminUserWhereInput = {
    ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(role ? { role } : {}),
    ...(activeRaw ? { active: activeRaw === 'true' } : {}),
  };
  const db = getDb();
  const [total, rows] = await Promise.all([
    db.adminUser.count({ where }),
    db.adminUser.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: paging.skip, take: paging.pageSize, select: SELECT }),
  ]);
  return adminJson(pagedResponse(rows.map(toUserRecord), total, paging));
}

export async function createUserRequest(ctx: AdminContext): Promise<Response> {
  const body = await readJsonBody(ctx.request, 16 * 1024);
  const v = new Validator();
  v.noUnknownKeys(body, ['email', 'name', 'role', 'password']);
  const email = v.email(body.email, 'email');
  const name = v.string(body.name, 'name', { min: 1, max: 120 });
  const role = v.enumValue(body.role, 'role', ROLES);
  const password = v.string(body.password, 'password', { max: 1024, keepWhitespace: true });
  v.throwIfInvalid();
  assertPasswordPolicy(password, { email, name });
  const passwordHash = await hashPassword(password as string);
  const db = getDb();
  try {
    const created = await db.$transaction(async (tx) => {
      const user = await tx.adminUser.create({
        data: { email: email as string, name: name as string, role: role as AdminRole, passwordHash },
        select: SELECT,
      });
      await writeAudit(tx, ctx, {
        action: 'USER_CREATE', entityType: 'AdminUser', entityId: user.id, summary: `Created user ${user.email}`,
        detail: { email: user.email, name: user.name, role: user.role },
      });
      return user;
    });
    return adminJson({ data: toUserRecord(created) }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AdminHttpError('CONFLICT', 'A user with this email already exists.');
    throw error;
  }
}

export async function updateUserRequest(ctx: AdminContext & { params: { id: string } }): Promise<Response> {
  const id = parseIdParam(ctx.params.id);
  const body = await readJsonBody(ctx.request, 16 * 1024);
  const v = new Validator();
  v.noUnknownKeys(body, ['name', 'role', 'active']);
  const name = v.string(body.name, 'name', { min: 1, max: 120, optional: true });
  const role = v.enumValue(body.role, 'role', ROLES, true);
  const active = v.boolean(body.active, 'active', true);
  v.throwIfInvalid();
  if (name === undefined && role === undefined && active === undefined) {
    throw new AdminHttpError('INVALID', 'Nothing to update.', { details: [{ field: 'name', message: 'Provide at least one of name, role, active.' }] });
  }
  const isSelf = id === ctx.user.id;

  const updated = await getDb().$transaction(async (tx) => {
    const adminCount = await lockActiveAdmins(tx);
    const before = await tx.adminUser.findUnique({ where: { id }, select: SELECT });
    if (!before) throw notFound('User not found');

    if (isSelf && role !== undefined && role !== before.role) throw forbidden('You cannot change your own role.');
    if (isSelf && active === false && before.active) throw forbidden('You cannot deactivate your own account.');

    const nextRole = role ?? before.role;
    const nextActive = active ?? before.active;
    const losesAdmin = before.role === 'ADMIN' && before.active && (nextRole !== 'ADMIN' || !nextActive);
    if (losesAdmin && adminCount <= 1) {
      throw new AdminHttpError('LAST_ADMIN', 'The last active administrator cannot be demoted or deactivated.');
    }

    const data = { name: name ?? before.name, role: nextRole, active: nextActive };
    const after = { ...before, ...data };
    const diff = diffFields(before, after, ['name', 'role', 'active']);
    if (diff.changed.length === 0) return before;

    const row = await tx.adminUser.update({ where: { id }, data, select: SELECT });
    let revoked = 0;
    if (before.active && !nextActive) revoked = await revokeUserSessions(id, tx);
    await writeAudit(tx, ctx, {
      action: before.active && !nextActive ? 'USER_DEACTIVATE' : !before.active && nextActive ? 'USER_REACTIVATE' : 'USER_UPDATE',
      entityType: 'AdminUser', entityId: id, summary: `Updated user ${before.email} (${diff.changed.join(', ')})`,
      detail: { ...diff, sessionsRevoked: revoked },
    });
    return row;
  });
  return adminJson({ data: toUserRecord(updated) });
}

export async function resetPasswordRequest(ctx: AdminContext & { params: { id: string } }): Promise<Response> {
  const id = parseIdParam(ctx.params.id);
  const body = await readJsonBody(ctx.request, 16 * 1024);
  const v = new Validator();
  v.noUnknownKeys(body, ['newPassword']);
  const newPassword = v.string(body.newPassword, 'newPassword', { max: 1024, keepWhitespace: true });
  v.throwIfInvalid();
  const db = getDb();
  const target = await db.adminUser.findUnique({ where: { id }, select: { id: true, email: true, name: true } });
  if (!target) throw notFound('User not found');
  assertPasswordPolicy(newPassword, { email: target.email, name: target.name }, 'newPassword');
  const passwordHash = await hashPassword(newPassword as string);
  const revoked = await db.$transaction(async (tx) => {
    const res = await tx.adminUser.updateMany({ where: { id }, data: { passwordHash, passwordChangedAt: new Date() } });
    if (res.count === 0) throw conflict('The user no longer exists.');
    const count = await revokeUserSessions(id, tx, id === ctx.user.id ? { exceptSessionId: ctx.session.id } : {});
    await writeAudit(tx, ctx, {
      action: 'USER_PASSWORD_RESET', entityType: 'AdminUser', entityId: id, summary: `Reset password of ${target.email}`,
      detail: { sessionsRevoked: count },
    });
    return count;
  });
  return adminJson({ ok: true, sessionsRevoked: revoked });
}
