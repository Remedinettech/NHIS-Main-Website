import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSave, publishAdvice } from './saveMessage';

test('a first save of a document that was never published says that it is still private', () => {
  // The defect: the message was just "Header was saved." for a record whose status is DRAFT, which reads as if the site changed.
  const message = describeSave('Header & helplines', { created: false, published: false, status: 'DRAFT', hasDraft: false });
  assert.match(message, /saved as a draft/);
  assert.match(message, /not public until it is published/);
});

test('unpublished edits of a published record are saved as a draft too', () => {
  assert.match(describeSave('Footer', { created: false, published: false, status: 'PUBLISHED', hasDraft: true }), /not public until it is published/);
});

test('a save followed by a publish says it was published, a new record says it was created as a draft', () => {
  assert.equal(describeSave('Footer', { created: false, published: true, status: 'PUBLISHED', hasDraft: false }), 'Footer was saved and published.');
  assert.equal(describeSave('New page', { created: true, published: false, status: 'DRAFT', hasDraft: false }), 'New page was created as a draft.');
});

test('a record that is neither a draft nor has unpublished edits is just saved', () => {
  assert.equal(describeSave('Gallery', { created: false, published: false, status: 'ARCHIVED', hasDraft: false }), 'Gallery was saved.');
});

test('the advice about publishing points an Editor to a publisher, not to a button they do not have', () => {
  assert.equal(publishAdvice(true), 'Use Publish when these changes are ready.');
  assert.doesNotMatch(publishAdvice(false), /Use Publish/);
  assert.match(publishAdvice(false), /publisher or administrator/);
});
