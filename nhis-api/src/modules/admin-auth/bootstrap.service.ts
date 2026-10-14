import {
  assertPasswordPolicy, getDb, hashPassword, invalid, revokeUserSessions, sha256Hex, Validator, writeAudit, type Db,
} from '../../common/admin';

export class BootstrapRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapRefusedError';
  }
}

/**
 * Creates the first ADMIN. Refuses (BootstrapRefusedError) when any ADMIN already exists, regardless of active state.
 * The password is validated against the policy and is never logged; only a hash is stored. Writes an audit entry (system actor).
 */
export async function bootstrapAdmin(input: { email: string; password: string; name?: string }, db: Db = getDb()) {
  const v = new Validator();
  const email = v.email(input.email, 'email');
  const name = v.string(input.name ?? 'Administrator', 'name', { min: 1, max: 120 });
  v.throwIfInvalid();
  assertPasswordPolicy(input.password, { email, name });
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    // Serialise concurrent bootstrap runs.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(727401)`;
    if ((await tx.adminUser.count({ where: { role: 'ADMIN' } })) > 0) {
      throw new BootstrapRefusedError('An administrator already exists. Bootstrap is only for the very first administrator; use admin:reset-password for lockout recovery.');
    }
    const user = await tx.adminUser.create({
      data: { email: email as string, name: name as string, role: 'ADMIN', passwordHash },
      select: { id: true, email: true, name: true, role: true },
    });
    await writeAudit(tx, { user: null }, {
      action: 'BOOTSTRAP_ADMIN', entityType: 'AdminUser', entityId: user.id, summary: `Bootstrapped initial administrator ${user.email}`,
      detail: { email: user.email, via: 'cli' }, actorEmailOverride: 'cli:admin:bootstrap',
    });
    return user;
  });
}

/** Lockout recovery: sets a new password, revokes all sessions, clears the login throttling for that email. */
export async function resetPasswordByEmail(emailInput: string, newPassword: string, db: Db = getDb()) {
  const v = new Validator();
  const email = v.email(emailInput, 'email');
  v.throwIfInvalid();
  const user = await db.adminUser.findUnique({ where: { email: email as string } });
  if (!user) throw invalid('No user with that email exists.');
  assertPasswordPolicy(newPassword, { email: user.email, name: user.name }, 'newPassword');
  const passwordHash = await hashPassword(newPassword);
  return db.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } });
    const revoked = await revokeUserSessions(user.id, tx);
    await tx.loginAttempt.deleteMany({ where: { key: { startsWith: `login:${user.email}|` } } });
    await tx.loginAttempt.deleteMany({ where: { key: `pwchange:${user.id}` } });
    await writeAudit(tx, { user: null }, {
      action: 'USER_PASSWORD_RESET', entityType: 'AdminUser', entityId: user.id, summary: `Password reset via CLI for ${user.email}`,
      detail: { sessionsRevoked: revoked, via: 'cli', fingerprint: sha256Hex(user.id).slice(0, 8) }, actorEmailOverride: 'cli:admin:reset-password',
    });
    return { email: user.email, sessionsRevoked: revoked };
  });
}
