import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directoryTitle } from './contactColumns';

test('the Admin names the directories like the tabs of the public Contact page', () => {
  assert.equal(directoryTitle('project-office-officials', 'Project office officials'), 'UIIC Project Office Officials');
  assert.equal(directoryTitle('coordinators', 'Coordinators'), 'TPA coordinators');
  assert.equal(directoryTitle('uiic-nodal-officers', 'Nodal Officers'), 'UIIC Nodal Officers');
  assert.equal(directoryTitle('some-new-directory', 'Stored name'), 'Stored name', 'a directory this list does not know keeps its stored name');
});
