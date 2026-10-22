import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../../services/http';
import { describeError, describeMutationError } from './errorMessage';

test('missing migrations explain the setup action instead of suggesting repeated retries', () => {
  const error = new ApiError('http', 'Private database details', { status: 503, code: 'MIGRATION_REQUIRED' });
  assert.match(describeError(error), /operator.*back up.*migrations/i);
  assert.match(describeError(error), /Repeated retries will not fix/);
  assert.match(describeMutationError(error), /No changes were saved/);
  assert.ok(!describeError(error).includes('Private database details'));
});

test('unexpected server errors retain the generic safe message', () => {
  const error = new ApiError('http', 'Private SQL', { status: 500, code: 'INTERNAL_ERROR' });
  assert.ok(!describeError(error).includes('Private SQL'));
  assert.ok(!describeMutationError(error).includes('Private SQL'));
});
