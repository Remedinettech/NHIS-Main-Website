import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editedSince } from './useDirtyForm';

test('a form that still holds what was sent is replaced by the saved copy, one edited while saving keeps its edits', () => {
  const sent = { title: { en: 'Header', ta: '' }, items: [1, 2] };
  assert.equal(editedSince({ title: { en: 'Header', ta: '' }, items: [1, 2] }, sent), false);
  assert.equal(editedSince({ title: { en: 'Header!', ta: '' }, items: [1, 2] }, sent), true, 'typed while the request ran');
  assert.equal(editedSince({ title: { en: 'Header', ta: '' }, items: [1, 2, 3] }, sent), true, 'a row added while the request ran');
  assert.equal(editedSince({ title: { en: 'Header', ta: '' }, items: [2, 1] }, sent), true, 'a row moved while the request ran');
});
