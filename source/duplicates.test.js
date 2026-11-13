import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateGroups, resolveDuplicateGroup } from './duplicates.js';

const entries = [
  { id: 'one', name: { first: 'Chosen', last: 'Smith' }, contacts: [{ type: 'email', address: 'ONE@example.com' }], category: ['friends'], notes: 'Original', home: { city: '' } },
  { id: 'two', name: { first: 'Other', last: ' smith ' }, contacts: [{ type: 'email', address: 'one@EXAMPLE.com' }, { type: 'mobile', address: '+1 (909) 555-1234' }], category: ['work'], notes: 'Extra', home: { city: 'Redlands' } },
  { id: 'three', name: { last: 'Smith' }, contacts: [{ type: 'phone', address: '9095551234' }] },
  { id: 'four', name: { last: 'Jones' }, contacts: [{ type: 'email', address: 'one@example.com' }] },
];

test('requires last name plus email or phone and groups linked matches', () => {
  assert.deepEqual(findDuplicateGroups(entries).map(group => group.map(entry => entry.id)), [['one', 'two', 'three']]);
  assert.equal(findDuplicateGroups(entries.map(entry => ({ ...entry, name: { last: '' } }))).length, 0);
});

test('merge preserves chosen identity and conflicts while combining nonempty data', () => {
  const result = resolveDuplicateGroup(entries, ['one', 'two', 'three'], 'one', true);
  assert.equal(result.length, 2);
  assert.equal(result[0].name.first, 'Chosen');
  assert.equal(result[0].home.city, 'Redlands');
  assert.deepEqual(result[0].category, ['friends', 'work']);
  assert.equal(result[0].notes, 'Original\n\nExtra');
  assert.equal(result[0].contacts.length, 3);
  assert.equal(entries[0].home.city, '');
});

test('delete keeps selected contact unchanged and leaves unrelated contacts alone', () => {
  assert.deepEqual(resolveDuplicateGroup(entries, ['one', 'two', 'three'], 'two'), [entries[1], entries[3]]);
  assert.throws(() => resolveDuplicateGroup(entries, ['one', 'two'], 'missing'));
});