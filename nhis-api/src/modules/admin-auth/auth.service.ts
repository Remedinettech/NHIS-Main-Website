import {
  adminConfig, adminJson, AdminHttpError, assertActionAllowed, assertAllowedOrigin, assertLoginAllowed, assertPasswordPolicy,
  buildClearCookie, buildSessionCookie, clearActionFailures, clientIp, clientUserAgent, createSession, getDb, hashPassword,
  invalid, passwordNeedsRehash, purgeDeadSessions, readJsonBody, readSessionToken, recordActionFailure, recordLoginFailure,
  recordLoginSuccess, resolveSession, revokeSession, revokeUserSessions, toSessionInfo, unauthenticated, Validator,
  verifyDummyPassword, verifyPassword, writeAudit, sha256Hex, type AdminContext,
} from '../../common/admin';

const LOGIN_ERROR = 'Invalid email or password.';
const PASSWORD_CHANGE_MAX_FAILURES = 5;

/** POST /admin/auth/login. Not wrapped by withAdmin (no session yet). */
export async function login(request: Request): Promise<Response> {
  const config = adminConfig();
  assertAllowedOrigin(request, config, true);
  const body = await readJsonBody(request, 16 * 1024);
  const v = new Validator();
  v.noUnknownKeys(body, ['email', 'password']);
  const email = v.email(body.email, 'email');
  const password = v.string(body.password, 'password', { max: 1024, keepWhitespace: true });
  v.throwIfInvalid('Email and password are required.');
  const ip = clientIp(request, config);
  const db = getDb();

  await assertLoginAllowed(email as string, ip, db, config);

  const user = await db.adminUser.findUnique({ where: { email: email as string } });
  const valid = user && user.active
    ? await verifyPassword(user.passwordHash, password as string)
    : await verifyDummyPassword(password as string);

  if (!user || !user.active || !valid) {
    await recordLoginFailure(email as string, ip, db);
    // Same entry for unknown / inactive / wrong password so the audit trail does not reveal which accounts exist.
    await writeAudit(db, { user: null, ip }, {
      action: 'LOGIN_FAILED', entityType: 'AdminUser', entityId: email as string,
      summary: 'Failed sign-in attempt', detail: { emailAttempted: email }, actorEmailOverride: email as string,
    });
    throw new AdminHttpError('UNAUTHENTICATED', LOGIN_ERROR);
  }

  const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  const previousToken = readSessionToken(request, config);
  const created = await db.$transaction(async (tx) => {
    if (previousToken) {
      const old = await tx.adminSession.findUnique({ where: { tokenHash: sha256Hex(previousToken) }, select: { id: true } });
      if (old) await revokeSession(old.id, tx);
    }
    const session = await createSession({ user: sessionUser, ip, userAgent: clientUserAgent(request) }, tx, config);
    await tx.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(passwordNeedsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password as string) } : {}) },
    });
    await writeAudit(tx, { user: sessionUser, ip }, {
      action: 'LOGIN', entityType: 'AdminUser', entityId: user.id, summary: 'Signed in',
    });
    return session;
  });
  await recordLoginSuccess(email as string, ip, db);
  await purgeDeadSessions(db).catch(() => undefined);

  const maxAge = (created.session.expiresAt.getTime() - Date.now()) / 1000;
  return adminJson(toSessionInfo(created), { headers: { 'Set-Cookie': buildSessionCookie(created.token, maxAge, config) } });
}

/** GET /admin/auth/session. Never an error for "not signed in". */
export async function currentSession(request: Request): Promise<Response> {
  const config = adminConfig();
  const token = readSessionToken(request, config);
  const resolved = token ? await resolveSession(token, {}, getDb(), config) : null;
  if (!resolved) {
    return adminJson({ authenticated: false }, token ? { headers: { 'Set-Cookie': buildClearCookie(config) } } : {});
  }
  return adminJson(toSessionInfo(resolved));
}

/** POST /admin/auth/logout (inside withAdmin, so CSRF-protected). */
export async function logout(ctx: AdminContext): Promise<Response> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    await revokeSession(ctx.session.id, tx);
    await writeAudit(tx, ctx, { action: 'LOGOUT', entityType: 'AdminUser', entityId: ctx.user.id, summary: 'Signed out' });
  });
  return adminJson({ ok: true }, { headers: { 'Set-Cookie': buildClearCookie() } });
}

/** POST /admin/auth/change-password (inside withAdmin). Revokes all OTHER sessions of the user. */
export async function changePassword(ctx: AdminContext): Promise<Response> {
  const body = await readJsonBody(ctx.request, 16 * 1024);
  const v = new Validator();
  v.noUnknownKeys(body, ['currentPassword', 'newPassword']);
  const currentPassword = v.string(body.currentPassword, 'currentPassword', { max: 1024, keepWhitespace: true });
  const newPassword = v.string(body.newPassword, 'newPassword', { max: 1024, keepWhitespace: true });
  v.throwIfInvalid();

  const db = getDb();
  const key = `pwchange:${ctx.user.id}`;
  await assertActionAllowed(key, PASSWORD_CHANGE_MAX_FAILURES, db);
  const user = await db.adminUser.findUnique({ where: { id: ctx.user.id } });
  if (!user || !user.active) throw unauthenticated();
  if (!(await verifyPassword(user.passwordHash, currentPassword as string))) {
    await recordActionFailure(key, db);
    throw invalid('The current password is incorrect.', [{ field: 'currentPassword', message: 'The current password is incorrect.' }]);
  }
  assertPasswordPolicy(newPassword, { email: user.email, name: user.name }, 'newPassword');
  if (newPassword === currentPassword) {
    throw invalid('The new password must differ from the current password.', [{ field: 'newPassword', message: 'Must differ from the current password.' }]);
  }
  const passwordHash = await hashPassword(newPassword as string);
  const revoked = await db.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } });
    const count = await revokeUserSessions(user.id, tx, { exceptSessionId: ctx.session.id });
    await writeAudit(tx, ctx, {
      action: 'PASSWORD_CHANGED', entityType: 'AdminUser', entityId: user.id, summary: 'Changed own password',
      detail: { otherSessionsRevoked: count },
    });
    return count;
  });
  await clearActionFailures(key, db);
  return adminJson({ ok: true, otherSessionsRevoked: revoked });
}
