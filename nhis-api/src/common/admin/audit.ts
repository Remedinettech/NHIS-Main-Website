import type { Prisma } from '@prisma/client';
import type { DbLike } from './db';

export interface AuditActor { user?: { id: string; email: string } | null; ip?: string | null }

export interface AuditEntryInput {
  /** e.g. CREATE, UPDATE, PUBLISH, LOGIN, LOGIN_FAILED, PASSWORD_CHANGED */
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  /** Free-form JSON detail (changed field names, before/after of non-sensitive fields). Secret-looking keys are dropped. */
  detail?: Record<string, unknown>;
  /** Overrides the actor email (failed logins have no user). */
  actorEmailOverride?: string | null;
}

const SECRET_KEY = /pass(word)?|hash|token|secret|cookie|csrf|authorization|credential/i;
const MAX_STRING = 2000;
const MAX_DEPTH = 6;
const MAX_ITEMS = 200;

/** Deep copy that drops secret-looking keys, truncates long strings and bounds depth/size. JSON-safe output. */
export function sanitizeAuditDetail(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}...` : value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => sanitizeAuditDetail(v, depth + 1)) as Prisma.InputJsonValue;
  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = sanitizeAuditDetail(v, depth + 1);
    }
    return out as Prisma.InputJsonObject;
  }
  return null;
}

/**
 * Writes an AuditLog row with the supplied client. Call it INSIDE the same `$transaction` as the change it describes,
 * passing the transaction client, so the audit entry and the change commit or roll back together.
 */
export async function writeAudit(tx: DbLike, ctx: AuditActor, entry: AuditEntryInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: ctx.user?.id ?? null,
      actorEmail: entry.actorEmailOverride !== undefined ? entry.actorEmailOverride : ctx.user?.email ?? null,
      action: entry.action.slice(0, 64),
      entityType: entry.entityType.slice(0, 64),
      entityId: entry.entityId.slice(0, 200),
      summary: entry.summary.slice(0, 500),
      detail: (sanitizeAuditDetail(entry.detail ?? {}) ?? {}) as Prisma.InputJsonValue,
      ipAddress: ctx.ip?.slice(0, 64) ?? null,
    },
  });
}

/** Builds `{ changed, before, after }` for the listed fields, comparing by JSON value. Helper for content CRUD audit detail. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: T, fields: readonly (keyof T & string)[]) {
  const changed: string[] = [];
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const f of fields) {
    if (JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null)) {
      changed.push(f);
      b[f] = before[f] ?? null;
      a[f] = after[f] ?? null;
    }
  }
  return { changed, before: b, after: a };
}
