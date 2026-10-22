import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusSelector, moveFocusTargets } from './useFocusRequest';

test('after a move the button that was pressed is wanted first, the other direction second', () => {
  assert.deepEqual(moveFocusTargets('t-row3', 3, 2), ['t-row3-up', 't-row3-down']);
  assert.deepEqual(moveFocusTargets('t-row3', 2, 3), ['t-row3-down', 't-row3-up']);
});

test('a row that reached an end can still fall back to the button that works there', () => {
  // Row moved up to the top: "Move up" is disabled now, so focus goes to "Move down" of the same row.
  const [first, second] = moveFocusTargets('p', 1, 0);
  assert.equal(first, 'p-up');
  assert.equal(second, 'p-down');
  assert.equal(focusSelector(second), '[data-focus="p-down"]:not(:disabled)');
});

test('a focus target is found by its data-focus name, only while the control is enabled', () => {
  assert.equal(focusSelector('r1-s2-up'), '[data-focus="r1-s2-up"]:not(:disabled)');
});

test('quotes and backslashes in a name cannot end the attribute value early', () => {
  assert.equal(focusSelector('a"b'), '[data-focus="a\\"b"]:not(:disabled)');
  assert.equal(focusSelector('a\\b'), '[data-focus="a\\\\b"]:not(:disabled)');
  assert.equal(focusSelector('x"] , body ["'), '[data-focus="x\\"] , body [\\""]:not(:disabled)');
});
