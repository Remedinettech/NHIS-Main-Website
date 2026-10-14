import { adminConfig, type AdminConfig } from './config';
import { getDb, type DbLike } from './db';
import { AdminHttpError } from './errors';

/**
 * Failure counters kept in LoginAttempt. Keys:
 *  - `login:<email>|<ip>`  5 failures / 15 min (default)
 *  - `login-ip:<ip>`       30 failures / 15 min (default)
 * A successful login deletes the email+IP key. `limit` rows are enough to block until the oldest ages out.
 */
const UNKNOWN_IP = 'unknown';
const MAX_KEY_PART = 254;

export function loginKeys(email: string, ip: string | null): { emailIp: string; ip: string } {
  const addr = ip ?? UNKNOWN_IP;
  return { emailIp: `login:${email.toLowerCase().slice(0, MAX_KEY_PART)}|${addr}`, ip: `login-ip:${addr}` };
}

async function retryAfterFor(db: DbLike, key: string, limit: number, windowMs: number, now: Date): Promise<number | null> {
  const since = new Date(now.getTime() - windowMs);
  const rows = await db.loginAttempt.findMany({
    where: { key, succeeded: false, createdAt: { gt: since } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { createdAt: true },
  });
  if (rows.length < limit) return null;
  // The attempt that has to age out for the count to drop below the limit is the `limit`-th most recent one.
  const pivot = rows[rows.length - 1].createdAt.getTime();
  return Math.max(1, Math.ceil((pivot + windowMs - now.getTime()) / 1000));
}

/** Throws 429 RATE_LIMITED (with Retry-After) when either counter is exhausted. */
export async function assertLoginAllowed(
  email: string,
  ip: string | null,
  db: DbLike = getDb(),
  config: AdminConfig = adminConfig(),
  now = new Date(),
): Promise<void> {
  const keys = loginKeys(email, ip);
  const waits = [
    await retryAfterFor(db, keys.emailIp, config.maxFailuresPerEmailIp, config.loginWindowMs, now),
    await retryAfterFor(db, keys.ip, config.maxFailuresPerIp, config.loginWindowMs, now),
  ].filter((n): n is number => n !== null);
  if (waits.length > 0) {
    const retryAfterSeconds = Math.max(...waits);
    throw new AdminHttpError('RATE_LIMITED', 'Too many failed sign-in attempts. Try again later.', { retryAfterSeconds });
  }
}

export async function recordLoginFailure(email: string, ip: string | null, db: DbLike = getDb(), now = new Date()): Promise<void> {
  const keys = loginKeys(email, ip);
  await db.loginAttempt.createMany({
    data: [
      { key: keys.emailIp, succeeded: false, createdAt: now },
      { key: keys.ip, succeeded: false, createdAt: now },
    ],
  });
}

/** Success clears the email+IP counter (the per-IP counter keeps counting). Also trims rows older than a day. */
export async function recordLoginSuccess(email: string, ip: string | null, db: DbLike = getDb(), now = new Date()): Promise<void> {
  const keys = loginKeys(email, ip);
  await db.loginAttempt.deleteMany({ where: { key: keys.emailIp } });
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } });
}

/** Generic per-subject failure limiter (e.g. wrong current password in change-password), same table. */
export async function assertActionAllowed(key: string, limit: number, db: DbLike = getDb(), config: AdminConfig = adminConfig(), now = new Date()): Promise<void> {
  const wait = await retryAfterFor(db, key, limit, config.loginWindowMs, now);
  if (wait !== null) throw new AdminHttpError('RATE_LIMITED', 'Too many failed attempts. Try again later.', { retryAfterSeconds: wait });
}
export async function recordActionFailure(key: string, db: DbLike = getDb(), now = new Date()): Promise<void> {
  await db.loginAttempt.create({ data: { key, succeeded: false, createdAt: now } });
}
export async function clearActionFailures(key: string, db: DbLike = getDb()): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { key } });
}
