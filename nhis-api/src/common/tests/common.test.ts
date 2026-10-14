import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, NotFoundError, ValidationError, errorResponse, methodNotAllowed, notImplemented, serverError } from '../utils/errors';
import { parseBoundedString, parseEnum, parsePositiveInt, parseSlugParam } from '../utils/validation';
import { getAuthContext, requireRole, NOT_IMPLEMENTED_MESSAGE } from '../authorization';
import { DEFAULT_SNAPSHOT_DATE, loadServerConfig } from '../../config/server';

test('parsePositiveInt accepts digits within range and rejects everything else', () => {
  assert.equal(parsePositiveInt(null, 'page', 1, 10), 1);
  assert.equal(parsePositiveInt('7', 'page', 1, 10), 7);
  for (const bad of ['0', '-1', '1.5', 'NaN', '11', '', ' 1', '1e2']) {
    assert.throws(() => parsePositiveInt(bad, 'page', 1, 10), ValidationError, bad);
  }
});

test('parseEnum only accepts listed values and treats absence as no filter', () => {
  const allowed = ['a', 'b'] as const;
  assert.equal(parseEnum(null, allowed, 'x'), undefined);
  assert.equal(parseEnum('', allowed, 'x'), undefined);
  assert.equal(parseEnum('a', allowed, 'x'), 'a');
  assert.throws(() => parseEnum('c', allowed, 'x'), /must be one of: a, b/);
  assert.throws(() => parseEnum('A', allowed, 'x'), ValidationError);
});

test('parseBoundedString and parseSlugParam enforce limits', () => {
  assert.equal(parseBoundedString(null, 'q', 5), '');
  assert.equal(parseBoundedString('abcde', 'q', 5), 'abcde');
  assert.throws(() => parseBoundedString('abcdef', 'q', 5), ValidationError);
  assert.equal(parseSlugParam('employee-policy', 'slug'), 'employee-policy');
  for (const bad of ['', 'A', '../x', 'a b', '-a', 'a-', 'a--b', 'x'.repeat(81)]) assert.throws(() => parseSlugParam(bad, 'slug'), ValidationError, bad);
});

test('error helpers produce the documented JSON bodies and statuses', async () => {
  const cases: Array<[Response, number, string]> = [
    [serverError(), 500, 'INTERNAL_ERROR'],
    [methodNotAllowed(['GET']), 405, 'METHOD_NOT_ALLOWED'],
    [notImplemented('x'), 501, 'NOT_IMPLEMENTED'],
    [errorResponse(new ValidationError('bad')), 400, 'INVALID_QUERY'],
    [errorResponse(new NotFoundError()), 404, 'NOT_FOUND'],
  ];
  for (const [response, status, code] of cases) {
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', 'errors are never cached');
  }
  assert.equal(methodNotAllowed(['GET', 'HEAD']).headers.get('Allow'), 'GET, HEAD');
});

test('unknown errors become a generic 500 without leaking details', async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    const response = errorResponse(new Error('secret connection string postgres://user:pw@host'));
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.ok(!text.includes('secret'));
    assert.ok(!text.includes('postgres'));
    assert.ok(!text.includes('stack'));
    assert.deepEqual(JSON.parse(text), { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  } finally {
    console.error = original;
  }
});

test('requireRole always denies with 501 NOT_IMPLEMENTED', async () => {
  const context = getAuthContext(new Request('http://localhost/x', { headers: { Authorization: 'Bearer anything', Cookie: 'session=admin' } }));
  assert.equal(context.authenticated, false);
  assert.equal(context.userId, null);
  assert.deepEqual(context.roles, []);
  for (const roles of [[], ['editor'], ['admin'], ['editor', 'publisher', 'admin']] as const) {
    assert.throws(
      () => requireRole(context, ...roles),
      (error: unknown) => error instanceof ApiError && error.status === 501 && error.code === 'NOT_IMPLEMENTED' && error.message === NOT_IMPLEMENTED_MESSAGE,
    );
  }
  // A forged context cannot succeed either.
  assert.throws(() => requireRole({ authenticated: true, userId: 'u1', roles: ['admin'] } as never, 'admin'), ApiError);
  const response = errorResponse((() => { try { requireRole(context, 'admin'); } catch (e) { return e; } })());
  assert.equal(response.status, 501);
  assert.match((await response.json()).error.message, /not implemented/i);
});

test('server config reads the capture date with a validated default', () => {
  assert.deepEqual(loadServerConfig({}), { snapshotDate: DEFAULT_SNAPSHOT_DATE });
  assert.deepEqual(loadServerConfig({ NHIS_SNAPSHOT_DATE: '2027-01-02' }), { snapshotDate: '2027-01-02' });
  assert.deepEqual(loadServerConfig({ NHIS_SNAPSHOT_DATE: 'yesterday' }), { snapshotDate: DEFAULT_SNAPSHOT_DATE });
});
