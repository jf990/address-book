import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function harness() {
  const calls = { render: 0, focus: 0, scroll: 0 };
  const context = {
    crypto: { randomUUID: () => 'new-contact' },
    icon: () => '',
    contacts: [],
    selectedId: 'one',
    render: () => { calls.render += 1; },
    contactsPage: () => 'contacts page',
    document: { querySelector: () => ({ focus: () => { calls.focus += 1; } }) },
    window: { scrollTo: () => { calls.scroll += 1; } },
  };
  runInNewContext([
    between('const escapeHtml =', 'const readStored ='),
    between('function normalizeContacts(', 'let book ='),
    between('function avatar(', 'async function loadGravatarImages('),
    between('function mapPinButton(', 'function emptyState('),
    between('function contactPage(', 'function mapPage('),
    between('function selectContact(', 'function openForm('),
  ].join('\n'), context);
  return { context, calls };
}

test('detail screen displays every saved field and contact method without editable controls', () => {
  const { context } = harness();
  const entry = context.normalizeAddress({
    id: 'one',
    index: 'custom-index',
    name: { first: 'Ada <script>', last: 'Lovelace', middle: 'Byron', prefix: 'Dr.', suffix: 'Jr.', dob: '1815-12-10', photo: 'https://example.test/portrait.jpg' },
    category: ['Friends', 'Work'],
    contacts: [
      { type: 'email', address: 'ada@example.test' },
      { type: 'mobile', address: '+12025550123' },
      { type: 'custom', address: 'Third contact method' },
    ],
    business: { company: 'Analytical Engines', street: '1 Work St', street2: 'Suite 2', location: 'Building 3', city: 'London', state: 'Work State', zip: 'W1', country: 'UK' },
    home: { street: '4 Home St', street2: 'Flat 5', city: 'Oxford', state: 'Home State', zip: 'OX1', country: 'England' },
    notes: 'First line\nSecond line',
    additional: { title: '<Engineer>', metadata: { language: 'English' }, count: 0, active: false },
  });
  context.contacts = [entry];
  const before = JSON.stringify(entry);
  const html = context.contactPage();
  for (const value of [
    ...Object.values(entry.name), entry.index, ...Object.values(entry.business), ...Object.values(entry.home),
    entry.notes, 'Friends, Work', 'Third contact method', 'English', 'count', 'active',
  ]) {
    assert.ok(html.includes(value.replaceAll('<', '&lt;').replaceAll('>', '&gt;')), `Missing ${value}`);
  }
  assert.match(html, /mailto:ada@example.test/);
  assert.match(html, /tel:\+12025550123/);
  assert.match(html, /data-map-location="business"/);
  assert.match(html, /data-map-location="home"/);
  assert.match(html, /&lt;Engineer&gt;/);
  assert.match(html, /<dd>0<\/dd>/);
  assert.match(html, /<dd>false<\/dd>/);
  assert.match(html, /data-edit="one"/);
  assert.doesNotMatch(html, /<(?:input|select|textarea|form)\b|<script>/);
  assert.equal(JSON.stringify(entry), before);
});

test('sparse and company-only contacts render without invented values', () => {
  const { context } = harness();
  context.contacts = [context.normalizeAddress({ id: 'one', business: { company: 'Company only' } })];
  const html = context.contactPage();
  assert.match(html, /Company only/);
  assert.match(html, /No contact details/);
  assert.doesNotMatch(html, /undefined|null|Additional information|data-map-contact/);
});

for (const dataset of [{ cardId: 'one' }, { rowId: 'one' }]) {
  test(`${Object.keys(dataset)[0]} opens details by click and keyboard without intercepting embedded actions`, () => {
    const { context, calls } = harness();
    const handlers = {};
    const element = { dataset, addEventListener: (type, handler) => { handlers[type] = handler; } };
    context.document.querySelectorAll = () => [element];
    runInNewContext(between("document.querySelectorAll('[data-card-id], [data-row-id]')", "document.querySelectorAll('[data-edit]')"), context);
    for (const event of [
      { type: 'click', target: { closest: () => null } },
      { type: 'keydown', key: 'Enter', target: element },
      { type: 'keydown', key: ' ', target: element },
    ]) {
      context.activePage = 'contacts';
      handlers[event.type]({ preventDefault() {}, ...event });
      assert.equal(context.activePage, 'contact');
      assert.equal(context.selectedId, 'one');
    }
    assert.equal(calls.render, 3);
    assert.equal(calls.focus, 3);
    assert.equal(calls.scroll, 3);
    handlers.click({ target: { closest: () => ({}) } });
    handlers.keydown({ key: 'Enter', target: {}, preventDefault: () => assert.fail('Embedded control intercepted') });
    assert.equal(calls.render, 3);
  });
}
