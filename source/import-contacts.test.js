import test from 'node:test';
import assert from 'node:assert/strict';
import { importContacts } from './import-contacts.js';

const existing = [{ id: 'keep', name: { first: 'Original', last: '' }, contacts: [{ type: 'email', address: 'Person@example.com' }, { type: 'mobile', address: '+1 (909) 555-1234' }], home: { city: '', street: 'Existing street' }, notes: 'Keep notes', category: ['friends'] }];
const matched = { id: 'incoming', name: { first: 'Incoming', last: 'Smith' }, contacts: [{ type: 'email', address: ' person@EXAMPLE.com ' }, { type: 'work', address: '5551234567' }], home: { city: 'Redlands', street: 'Other street' }, notes: '', category: ['work'] };
const unmatched = { id: 'new', name: { first: 'New' }, contacts: [{ type: 'email', address: 'new@example.com' }] };

test('merge fills empty nested fields and preserves populated fields and source data', () => {
  const result = importContacts(existing, [matched, unmatched]);
  assert.equal(result.contacts.length, 2);
  assert.deepEqual(result.contacts[0].name, { first: 'Original', last: 'Smith' });
  assert.deepEqual(result.contacts[0].home, { city: 'Redlands', street: 'Existing street' });
  assert.equal(result.contacts[0].notes, 'Keep notes');
  assert.deepEqual(result.contacts[0].category, ['friends']);
  assert.equal(result.contacts[0].contacts.length, 3);
  assert.equal(existing[0].name.last, '');
  assert.deepEqual(result.counts, { added: 1, updated: 1, ignored: 0 });
});

test('replace matches formatted US phone numbers and preserves internal identity only', () => {
  const replacement = { ...matched, contacts: [{ type: 'phone2', address: '909.555.1234' }] };
  const result = importContacts(existing, [replacement, unmatched], 'replace');
  assert.deepEqual(result.contacts[0], { ...replacement, id: 'keep' });
  assert.equal(result.contacts.length, 2);
});

test('match mode merges matches and ignores unmatched contacts', () => {
  const result = importContacts(existing, [matched, unmatched], 'match');
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].name.last, 'Smith');
  assert.deepEqual(result.counts, { added: 0, updated: 1, ignored: 1 });
});

test('replace book discards previous contacts and ensures unique imported IDs', () => {
  const result = importContacts(existing, [matched, { ...unmatched, id: matched.id }], 'match', true);
  assert.equal(result.contacts.length, 2);
  assert.equal(result.contacts[0].name.first, 'Incoming');
  assert.notEqual(result.contacts[0].id, result.contacts[1].id);
});

test('empty methods, names and social handles do not produce matches', () => {
  const result = importContacts(existing, [{ ...unmatched, name: existing[0].name, contacts: [{ type: 'twitter', address: '9095551234' }, { type: 'email', address: '' }] }]);
  assert.equal(result.contacts.length, 2);
});

test('successive records match newly added contacts and newly merged email methods', () => {
  const result = importContacts([], [matched, { ...matched, id: 'second', notes: 'New notes' }]);
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].notes, 'New notes');
});