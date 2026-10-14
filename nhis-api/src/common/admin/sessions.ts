import type { AdminRole, AdminSessionInfo } from '@nhis/shared-types';
import { adminConfig, type AdminConfig } from './config';
import { getDb, type DbLike } from './db';
import { generateToken, sha256Hex } from './tokens';

export interface SessionUser { id: string; email: string; name: string; role: AdminRole }
export interface SessionData {
  id: string;
  csrfToken: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** Absolute expiry. */
  expiresAt: Date;
  /** lastSeenAt + idle timeout. */
  idleExpiresAt: Date;
}
export interface ResolvedSession { user: SessionUser; session: SessionData }

export type SessionState = 'ok' | 'revoked' | 'idle' | 'absolute';

/** Pure lifecycle rule: revoked, past the absolute limit, or idle for longer than the idle timeout. */
export function evaluateSessionState(
  row: { lastSeenAt: Date; expiresAt: Date; revokedAt: Date | null },
  now: Date,
  config: AdminConfig = adminConfig(),
): SessionState {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt.getTime() <= now.getTime()) return 'absolute';
  if (row.lastSeenAt.getTime() + config.idleTimeoutMs <= now.getTime()) return 'idle';
  return 'ok';
}

export interface CreatedSession extends ResolvedSession { token: string }

export async function createSession(
  input: { user: SessionUser; ip: string | null; userAgent: string | null; now?: Date },
  db: DbLike = getDb(),
  config: AdminConfig = adminConfig(),
): Promise<CreatedSession> {
  const now = input.now ?? new Date();
  const token = generateToken(32);
  const csrfToken = generateToken(32);
  const expiresAt = new Date(now.getTime() + config.absoluteTimeoutMs);
  const row = await db.adminSession.create({
    data: {
      tokenHash: sha256Hex(token),
      csrfToken,
      userId: input.user.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      ipAddress: input.ip?.slice(0, 64) ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });
  return {
    token,
    user: input.user,
    session: { id: row.id, csrfToken, createdAt: row.createdAt, lastSeenAt: now, expiresAt, idleExpiresAt: new Date(now.getTime() + config.idleTimeoutMs) },
  };
}

/**
 * Looks up a session by its raw cookie token. Returns null when unknown, revoked, expired (idle or absolute) or when the
 * user is inactive. With `touch` (default) the idle window slides forward.
 */
export async function resolveSession(
  token: string,
  options: { now?: Date; touch?: boolean } = {},
  db: DbLike = getDb(),
  config: AdminConfig = adminConfig(),
): Promise<ResolvedSession | null> {
  const now = options.now ?? new Date();
  const row = await db.adminSession.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!row || !row.user.active) return null;
  if (evaluateSessionState(row, now, config) !== 'ok') return null;
  if (options.touch !== false) {
    await db.adminSession.update({ where: { id: row.id }, data: { lastSeenAt: now } });
  }
  const lastSeenAt = options.touch === false ? row.lastSeenAt : now;
  return {
    user: { id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role },
    session: {
      id: row.id,
      csrfToken: row.csrfToken,
      createdAt: row.createdAt,
      lastSeenAt,
      expiresAt: row.expiresAt,
      idleExpiresAt: new Date(Math.min(lastSeenAt.getTime() + config.idleTimeoutMs, row.expiresAt.getTime())),
    },
  };
}

export async function revokeSession(sessionId: string, db: DbLike = getDb(), now = new Date()): Promise<void> {
  await db.adminSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: now } });
}

/** Revokes every live session of a user, optionally keeping one. Returns the number revoked. */
export async function revokeUserSessions(
  userId: string,
  db: DbLike = getDb(),
  options: { exceptSessionId?: string; now?: Date } = {},
): Promise<number> {
  const result = await db.adminSession.updateMany({
    where: { userId, revokedAt: null, ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}) },
    data: { revokedAt: options.now ?? new Date() },
  });
  return result.count;
}

/** Housekeeping: removes sessions that ended more than a day ago. */
export async function purgeDeadSessions(db: DbLike = getDb(), now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 3_600_000);
  await db.adminSession.deleteMany({ where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] } });
}

export function toSessionInfo(resolved: ResolvedSession): AdminSessionInfo {
  const { user, session } = resolved;
  return {
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    csrfToken: session.csrfToken,
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}
