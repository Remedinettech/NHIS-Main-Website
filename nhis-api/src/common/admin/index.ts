/**
 * Public API of the admin foundation. Content CRUD modules should import from here only.
 *
 *   export const POST = withAdmin<{ id: string }>(async ({ request, user, ip, params }) => {
 *     requireCapability(user.role, 'publish');
 *     const body = await readJsonBody(request);
 *     const v = new Validator(); const expectedVersion = parseExpectedVersion(body);
 *     await getDb().$transaction(async (tx) => { ...; await writeAudit(tx, { user, ip }, {...}); });
 *     return adminJson({ data });
 *   }, { capability: 'publish' });
 */
export * from './config';
export * from './errors';
export * from './db';
export * from './tokens';
export * from './password';
export * from './cookies';
export * from './csrf';
export * from './request';
export * from './sessions';
export * from './rate-limit';
export * from './roles';
export * from './validation';
export * from './audit';
export * from './with-admin';
