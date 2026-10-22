/**
 * Resumed security review: the matchers that tell "this release is ahead of its database" (missing table, missing enum
 * value, no rights on a new table) from a real fault. The error objects have the shapes Prisma 6.19 produced against
 * PostgreSQL 18 (captured from real failures); nothing else must be mistaken for them. No database needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMissingEnumValueError, isMissingTableError, isTablePermissionError, isTableUnavailableError } from '../modules/site-content/missing-table';

const named = (name: string, props: Record<string, unknown>) => Object.assign(new Error(String(props.message ?? '')), { name }, props);
const connector = (code: string, message: string) =>
  `Invalid \`prisma.siteContent.findMany()\` invocation: Error occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "${code}", message: "${message}", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })`;

test('no rights on a new table: the query API (unknown request error) and a raw query (P2010) are recognised', () => {
  const model = named('PrismaClientUnknownRequestError', { message: connector('42501', 'permission denied for table SiteContent') });
  const raw = named('PrismaClientKnownRequestError', { code: 'P2010', meta: { code: '42501', message: 'ERROR: permission denied for table ContentImport' }, message: 'Raw query failed. Code: `42501`. Message: `ERROR: permission denied for table ContentImport`' });
  for (const error of [model, raw]) {
    assert.equal(isTablePermissionError(error), true);
    assert.equal(isTableUnavailableError(error), true);
    assert.equal(isMissingTableError(error), false);
  }
});

test('no rights on any other table, other database errors and things that are not Prisma errors are real faults', () => {
  const other = named('PrismaClientUnknownRequestError', { message: connector('42501', 'permission denied for table AuditLog') });
  const lookalike = named('PrismaClientUnknownRequestError', { message: connector('42501', 'permission denied for table SiteContentArchive') });
  const syntax = named('PrismaClientKnownRequestError', { code: 'P2010', meta: { code: '42601', message: 'ERROR: syntax error at or near "SiteContent"' }, message: 'Raw query failed. Code: `42601`.' });
  const connection = named('PrismaClientInitializationError', { message: "Can't reach database server. permission denied for table SiteContent" });
  for (const error of [other, lookalike, syntax, connection, new Error('permission denied for table SiteContent'), 'permission denied for table SiteContent', null, undefined, 42, {}]) {
    assert.equal(isTablePermissionError(error), false, String(error));
    assert.equal(isTableUnavailableError(error), false, String(error));
  }
});

test('a missing table is still recognised, and is still not mistaken for a missing right', () => {
  const missing = named('PrismaClientKnownRequestError', { code: 'P2021', message: 'The table `public.SiteContent` does not exist in the current database.' });
  assert.equal(isMissingTableError(missing), true);
  assert.equal(isTableUnavailableError(missing), true);
  assert.equal(isTablePermissionError(missing), false);
});

test('the enum value VIDEO missing from the database is recognised, other enum errors and other databases errors are not', () => {
  const video = named('PrismaClientUnknownRequestError', { message: connector('22P02', 'invalid input value for enum \\"AssetKind\\": \\"VIDEO\\"') });
  assert.equal(isMissingEnumValueError(video), true);
  const otherEnum = named('PrismaClientUnknownRequestError', { message: connector('22P02', 'invalid input value for enum \\"PublicationStatus\\": \\"X\\"') });
  assert.equal(isMissingEnumValueError(otherEnum), false);
  assert.equal(isMissingEnumValueError(new Error('invalid input value for enum "AssetKind": "VIDEO"')), false);
  assert.equal(isMissingEnumValueError(null), false);
  assert.equal(isMissingEnumValueError(named('PrismaClientKnownRequestError', { code: 'P2010', meta: { code: '23505' }, message: 'invalid input value for enum "AssetKind"' })), false);
});
