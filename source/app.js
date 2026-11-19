import seedData from '../address-book.json';
import { parse as parseYaml } from 'yaml';
import { importContacts } from './import-contacts.js';
import { findDuplicateGroups, resolveDuplicateGroup } from './duplicates.js';
import esriConfig from '@arcgis/core/config.js';
import '@esri/calcite-components/components/calcite-icon';
import '@arcgis/core/assets/esri/themes/light/main.css';
import './styles.css';

const STORAGE_KEY = 'address-book-data-v1';
const SETTINGS_KEY = 'address-book-settings-v1';
const GEOCODING_URL = 'https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer';
const arcgisApiKey = import.meta.env.VITE_ARCGIS_API_KEY?.trim() || '';
if (arcgisApiKey) {
  esriConfig.apiKey = arcgisApiKey;
  esriConfig.apiKeys = { ...esriConfig.apiKeys, basemapStyles: arcgisApiKey };
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const mapStyles = ['navigation', 'navigation-night', 'streets-relief', 'streets-night', 'outdoor', 'imagery'];
const icons = {
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  sliders: '<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
};

const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const asString = (value) => value == null ? '' : String(value);
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asString(value).trim());
const isValidPhoto = (value) => {
  const photo = asString(value).trim();
  if (!photo || isValidEmail(photo)) return true;
  try {
    const url = new URL(photo);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};
const readStored = (key, fallback) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

async function getGravatarUrl(email, size = 80) {
  const normalizedEmail = asString(email).trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedEmail));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `https://gravatar.com/avatar/${hash}?s=${encodeURIComponent(size)}`;
}

function normalizeContacts(contacts) {
  if (Array.isArray(contacts)) {
    return contacts.filter((contact) => contact && typeof contact === 'object').map((contact) => ({
      type: asString(contact.type || 'other'),
      address: asString(contact.address),
    }));
  }
  if (contacts && typeof contacts === 'object') {
    return Object.entries(contacts).map(([type, address]) => ({ type, address: asString(address) }));
  }
  return [];
}

function normalizeAddress(entry = {}) {
  let business = {};
  let home = {};
  if (Array.isArray(entry.address)) {
    for (const item of entry.address) {
      if (item?.business) business = { ...business, ...item.business };
      if (item?.home) home = { ...home, ...item.home };
    }
  } else if (entry.address && typeof entry.address === 'object') {
    business = { ...business, ...(entry.address.business || {}) };
    home = { ...home, ...(entry.address.home || {}) };
  }
  return {
    ...entry,
    id: asString(entry.id || entry.index || crypto.randomUUID()),
    category: Array.isArray(entry.category) ? entry.category.map(asString) : entry.category ? [asString(entry.category)] : [],
    index: asString(entry.index),
    name: { first: '', last: '', middle: '', prefix: '', suffix: '', dob: '', photo: '', ...(entry.name || {}) },
    contacts: normalizeContacts(entry.contacts),
    business: { company: '', street: '', street2: '', location: '', city: '', state: '', zip: '', country: '', ...(entry.business || business) },
    home: { street: '', street2: '', city: '', state: '', zip: '', country: '', ...(entry.home || home) },
    notes: asString(entry.notes),
  };
}

function displayName(entry) {
  const person = [entry.name.prefix, entry.name.first, entry.name.middle, entry.name.last, entry.name.suffix].filter(Boolean).join(' ').trim();
  return person || entry.business.company || 'Unnamed contact';
}

function initials(entry) {
  const bits = [entry.name.first, entry.name.last].filter(Boolean);
  return bits.length ? bits.map((part) => part[0]).join('').slice(0, 2).toUpperCase() : (entry.business.company || '?').slice(0, 2).toUpperCase();
}

function addressLine(address) {
  return [address.street, address.street2, address.location, address.city, [address.state, address.zip].filter(Boolean).join(' '), address.country]
    .filter(Boolean).join(', ');
}

function formatPhoneNumber(value) {
  const text = asString(value).trim();
  if (!text.startsWith('+1')) return text;
  const [number, ...extensionParts] = text.split(/\s*(?:ext\.?|x)\s*/i);
  const digits = number.replace(/\D/g, '');
  if (!/^\+1[\d\s().-]+$/.test(number) || digits.length !== 11 || !digits.startsWith('1')) return text;
  const formatted = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return extensionParts.length ? `${formatted} ext. ${extensionParts.join(' ')}` : formatted;
}

function contactAction(contact) {
  if (!contact?.address) return null;
  const type = asString(contact.type).trim().toLowerCase();
  const address = asString(contact.address).trim();
  const socialHosts = {
    twitter: ['x.com', '/'],
    x: ['x.com', '/'],
    instagram: ['instagram.com', '/'],
    facebook: ['facebook.com', '/'],
    linkedin: ['linkedin.com', '/in/'],
    github: ['github.com', '/'],
    tiktok: ['tiktok.com', '/@'],
    threads: ['threads.net', '/@'],
    pinterest: ['pinterest.com', '/'],
    snapchat: ['snapchat.com', '/add/'],
    youtube: ['youtube.com', '/@'],
    bluesky: ['bsky.app', '/profile/'],
  };
  if (type === 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { href: `mailto:${address}`, target: '' };
  }
  if (['phone', 'mobile', 'telephone', 'tel', 'work'].includes(type)) {
    const telephone = address.replace(/[^\d+*#,;]/g, '');
    return telephone ? { href: `tel:${telephone}`, target: '' } : null;
  }
  if (type === 'website' || type === 'url') {
    const href = /^https?:\/\//i.test(address) ? address : `https://${address}`;
    return { href, target: '_blank' };
  }
  const [socialHost, pathPrefix] = socialHosts[type] || [];
  if (!socialHost) return null;
  let handle = address;
  if (/^https?:\/\//i.test(address)) {
    try { handle = new URL(address).pathname.split('/').filter(Boolean).at(-1) || ''; }
    catch { handle = address; }
  }
  handle = handle.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
  if (!handle) return null;
  return { href: `https://${socialHost}${pathPrefix}${encodeURIComponent(handle)}`, target: '_blank' };
}

function selectedContactMarkup(contact) {
  if (!contact?.address) return 'No contact detail';
  const display = escapeHtml(formatPhoneNumber(contact.address));
  const action = contactAction(contact);
  if (!action) return display;
  const target = action.target ? ` target="${action.target}" rel="noopener noreferrer"` : '';
  return `<a href="${escapeHtml(action.href)}"${target}>${display}</a>`;
}

function formatBirthday(value) {
  const dateText = asString(value).trim();
  const dateParts = dateText.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  const date = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(dateText);
  if (Number.isNaN(date.getTime())) return dateText;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

let book = readStored(STORAGE_KEY, null) || seedData;
let contacts = (book.addresses || []).map(normalizeAddress);
let settings = { defaultView: 'cards', alphaPlacement: 'right', sortBy: 'last', mapType: 'navigation', ...readStored(SETTINGS_KEY, {}) };
if (!mapStyles.includes(settings.mapType)) settings.mapType = 'navigation';
let activeView = settings.defaultView === 'list' ? 'list' : 'cards';
let activePage = 'contacts';
let activeLetter = 'ALL';
let searchTerm = '';
let selectedId = contacts[0]?.id || null;
let expandedLetters = new Set();
let editingId = null;
let toastTimer;
let mapContactId = null;
let mapLocationType = 'home';
let addressMapView = null;
let mapGeneration = 0;

function serializeEntry(entry, includeId = false) {
  return {
    ...(includeId ? { id: entry.id } : {}),
    index: entry.index || displayName(entry),
    category: entry.category,
    name: entry.name,
    contacts: entry.contacts,
    address: [
      ...(Object.values(entry.business).some(Boolean) ? [{ business: entry.business }] : []),
      ...(Object.values(entry.home).some(Boolean) ? [{ home: entry.home }] : []),
    ],
    additional: entry.additional || {},
    notes: entry.notes,
  };
}

function saveBook() {
  book.addresses = contacts.map((entry) => serializeEntry(entry, true));
  book.head = { ...(book.head || {}), dateLastUpdated: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getSortValue(entry) {
  if (settings.sortBy === 'first') return entry.name.first || entry.business.company || entry.name.last;
  if (settings.sortBy === 'company') return entry.business.company || displayName(entry);
  return entry.name.last || entry.business.company || entry.name.first;
}

function getVisibleContacts() {
  const term = searchTerm.trim().toLocaleLowerCase();
  return contacts.filter((entry) => {
    const sortValue = getSortValue(entry).trim();
    const first = (sortValue[0] || '').toLocaleUpperCase();
    const matchesLetter = searchTerm.trim() || activeLetter === 'ALL' || (activeLetter === '*' ? !/[A-Z]/.test(first) : first === activeLetter);
    const matchesSearch = !term || JSON.stringify(entry).toLocaleLowerCase().includes(term);
    return matchesLetter && matchesSearch;
  }).sort((a, b) => getSortValue(a).localeCompare(getSortValue(b), undefined, { sensitivity: 'base' }));
}

function avatar(entry, size = '') {
  const photo = asString(entry.name.photo).trim();
  if (isValidEmail(photo)) {
    return `<span class="avatar ${size}" data-gravatar-email="${escapeHtml(photo)}">${escapeHtml(initials(entry))}</span>`;
  }
  const photoUrl = /^https?:\/\//i.test(photo) ? photo : '';
  return photoUrl
    ? `<img class="avatar ${size}" src="${escapeHtml(photoUrl)}" alt="" onerror="this.outerHTML='<span class=\'avatar ${size}\'>${escapeHtml(initials(entry))}</span>'">`
    : `<span class="avatar ${size}">${escapeHtml(initials(entry))}</span>`;
}

async function loadGravatarImages() {
  const placeholders = [...document.querySelectorAll('[data-gravatar-email]')];
  await Promise.all(placeholders.map(async (placeholder) => {
    try {
      const url = await getGravatarUrl(placeholder.dataset.gravatarEmail);
      if (!placeholder.isConnected) return;
      const image = document.createElement('img');
      image.className = placeholder.className;
      image.alt = '';
      image.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = placeholder.className;
        fallback.textContent = placeholder.textContent;
        image.replaceWith(fallback);
      }, { once: true });
      image.src = url;
      placeholder.replaceWith(image);
    } catch {}
  }));
}

function contactRows(entry) {
  return entry.contacts.filter((item) => item.address).slice(0, 2).map((item) => `
    <div class="contact-preview"><span class="contact-type">${escapeHtml(item.type)}</span><span>${escapeHtml(formatPhoneNumber(item.address))}</span></div>`).join('');
}

function addressCard(entry) {
  const selectedContact = entry.contacts[0];
  const mapLocationType = entry.business.company ? 'business' : 'home';
  const location = entry[mapLocationType];
  const address = addressLine(location);
  const categories = entry.category.slice(0, 2).map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join('');
  return `<article class="person-card ${entry.id === selectedId ? 'is-selected' : ''}" data-card-id="${escapeHtml(entry.id)}" tabindex="0" aria-label="${escapeHtml(displayName(entry))}">
    <div class="card-top"><div class="identity">${avatar(entry)}<div class="identity-copy"><h3>${escapeHtml(displayName(entry))}</h3><span>${escapeHtml(entry.business.company || 'Personal')}</span></div></div><button class="icon-button card-edit" data-edit="${escapeHtml(entry.id)}" aria-label="Edit ${escapeHtml(displayName(entry))}" title="Edit contact">${icon('edit')}</button></div>
    <div class="tags">${categories || '<span class="tag tag-muted">contact</span>'}</div>
    <div class="card-detail"><span class="detail-label">${icon('pin')} ${mapLocationType === 'business' ? 'BUSINESS' : 'HOME'}</span><p class="address-with-pin"><span>${escapeHtml(address || 'No address added')}</span>${mapPinButton(entry, mapLocationType, address)}</p></div>
    <div class="card-contacts">${entry.contacts.length ? `<label class="contact-select-label" for="contact-${escapeHtml(entry.id)}">Reach them</label><select id="contact-${escapeHtml(entry.id)}" data-contact-select="${escapeHtml(entry.id)}">${entry.contacts.map((item, index) => `<option value="${index}">${escapeHtml(item.type)}</option>`).join('')}</select><div class="selected-contact" data-selected-contact="${escapeHtml(entry.id)}">${selectedContactMarkup(selectedContact)}</div>` : '<span class="empty-detail">No contact details</span>'}</div>
    <div class="card-foot"><span>${entry.name.dob ? `Birthday ${escapeHtml(formatBirthday(entry.name.dob))}` : 'In your address book'}</span><span class="card-index">${escapeHtml((getSortValue(entry)[0] || '#').toUpperCase())}</span></div>
  </article>`;
}

function listView(entries) {
  if (!entries.length) return emptyState();
  const grouped = entries.reduce((groups, entry) => {
    const letter = (getSortValue(entry)[0] || '#').toLocaleUpperCase();
    (groups[letter] ||= []).push(entry);
    return groups;
  }, {});
  return `<div class="tree-list">${Object.entries(grouped).map(([letter, group]) => {
    const open = expandedLetters.has(letter) || Boolean(searchTerm) || (activeLetter !== 'ALL' && (activeLetter === letter || (activeLetter === '*' && !/[A-Z]/.test(letter))));
    return `<section class="letter-group ${open ? 'is-open' : ''}"><button class="letter-heading" data-letter-toggle="${escapeHtml(letter)}" aria-expanded="${Boolean(open)}"><span class="letter-mark">${escapeHtml(letter)}</span><span class="letter-meta">${group.length} ${group.length === 1 ? 'contact' : 'contacts'}</span>${icon('chevron')}</button>${open ? `<div class="list-rows">${group.map((entry) => {
      const businessAddress = addressLine(entry.business);
      const locationType = businessAddress ? 'business' : 'home';
      const address = businessAddress || addressLine(entry.home);
      return `<div class="person-row ${entry.id === selectedId ? 'is-selected' : ''}" data-row-id="${escapeHtml(entry.id)}" tabindex="0"><div class="row-name">${avatar(entry, 'avatar-small')}<div><strong>${escapeHtml(displayName(entry))}</strong><span>${escapeHtml(entry.business.company || entry.category.join(', ') || 'Personal')}</span></div></div><div class="row-contact">${contactRows(entry) || '<span class="empty-detail">No contact details</span>'}</div><div class="row-location"><span>${escapeHtml(address || 'No address')}</span>${mapPinButton(entry, locationType, address)}</div><button class="icon-button row-edit" data-edit="${escapeHtml(entry.id)}" aria-label="Edit ${escapeHtml(displayName(entry))}" title="Edit contact">${icon('edit')}</button></div>`;
    }).join('')}</div>` : ''}</section>`;
  }).join('')}</div>`;
}

function mapPinButton(entry, locationType, address) {
  if (!address) return '';
  const name = displayName(entry);
  return `<button class="icon-button address-map-button" data-map-contact="${escapeHtml(entry.id)}" data-map-location="${locationType}" aria-label="Show ${escapeHtml(name)}'s address on map" title="Show address on map">${icon('pin')}</button>`;
}

function emptyState() {
  return `<div class="empty-state"><span class="empty-stamp">${icon('book')}</span><h2>${searchTerm ? 'No matches found for ' + escapeHtml(searchTerm) : 'Nothing under ' + (activeLetter === 'ALL' ? 'everyone' : activeLetter === '*' ? 'other names' : `${activeLetter}`)}</h2>${!searchTerm ? `<button class="button button-primary" data-action="new">${icon('plus')} Add a contact</button>` : ''}</div>`;
}

function alphaBar() {
  const letters = [...alphabet, '*'];
  return `<nav class="alpha-bar" aria-label="Filter by letter">${letters.map((letter) => `<button class="alpha-key ${activeLetter === letter ? 'is-active' : ''}" data-alpha="${letter}" aria-label="${letter === '*' ? 'Other' : letter}" aria-pressed="${activeLetter === letter}">${letter === '*' ? '*' : letter}</button>`).join('')}</nav>`;
}

function header() {
  return `<header class="topbar"><a class="brand" href="#contacts" data-page="contacts"><span class="brand-mark">${icon('book')}</span><span class="brand-text">${escapeHtml(book.head?.title || 'My').toLocaleUpperCase()} Address Book</span></a><div class="topbar-right"><span class="book-status"><span class="status-dot"></span> All changes saved</span><div class="people-count"><strong>${contacts.length.toString().padStart(2, '0')}</strong><span>CONTACTS</span></div><button class="icon-button settings-shortcut" data-page="settings" aria-label="Settings" title="Settings">${icon('sliders')}</button></div></header>`;
}

function navigation() {
  return `<nav class="bottom-nav" aria-label="Address book actions"><button class="nav-action nav-primary" data-action="new">${icon('plus')}<span>New</span></button><button class="nav-action" data-action="edit" ${selectedId ? '' : 'disabled'}>${icon('edit')}<span>Edit</span></button><button class="nav-action nav-danger" data-action="delete" ${selectedId ? '' : 'disabled'}>${icon('trash')}<span>Delete</span></button><span class="nav-divider"></span><button class="nav-action" data-page="map">${icon('pin')}<span>Map</span></button><button class="nav-action" data-page="settings">${icon('sliders')}<span>Settings</span></button><div class="nav-spacer"></div><button class="nav-action nav-import" data-action="import">${icon('upload')}<span>Import</span></button><button class="nav-action nav-export" data-action="export">${icon('download')}<span>Export</span></button></nav>`;
}

function contactsPage() {
  const visible = getVisibleContacts();
  const countText = `${visible.length} ${visible.length === 1 ? 'contact' : 'contacts'}`;
  return `<main class="main-frame ${settings.alphaPlacement === 'left' ? 'alpha-left' : ''} ${settings.alphaPlacement === 'top' ? 'alpha-top' : ''} ${settings.alphaPlacement === 'bottom' ? 'alpha-bottom' : ''}">
    ${settings.alphaPlacement === 'top' ? alphaBar() : ''}
    <section class="content-shell">
    <div class="toolbar"><div class="filter-caption"><span class="filter-dot"></span><span>${searchTerm ? 'SEARCH RESULTS' : activeLetter === 'ALL' ? 'EVERYONE' : activeLetter === '*' ? 'OTHER NAMES' : `STARTING WITH ${activeLetter}`}</span><span class="result-count">${countText}</span></div><div class="toolbar-tools"><label class="search-field">${icon('search')}<input id="search-input" type="search" value="${escapeHtml(searchTerm)}" placeholder="Find a person..." aria-label="Search contacts"><kbd>⌘ K</kbd></label><button class="icon-button clear-filters" data-action="clear-filters" aria-label="Clear search and letter filter" title="Show all contacts" ${searchTerm || activeLetter !== 'ALL' ? '' : 'disabled'}>${icon('close')}</button><div class="view-toggle" role="group" aria-label="View mode"><button data-view="cards" class="${activeView === 'cards' ? 'is-active' : ''}" aria-label="Card view" title="Card view">${icon('grid')}</button><button data-view="list" class="${activeView === 'list' ? 'is-active' : ''}" aria-label="List view" title="List view">${icon('list')}</button></div></div></div>
    ${visible.length ? (activeView === 'cards' ? `<div class="card-grid">${visible.map(addressCard).join('')}</div>` : listView(visible)) : emptyState()}
    </section>${settings.alphaPlacement === 'right' || settings.alphaPlacement === 'left' ? alphaBar() : ''}${settings.alphaPlacement === 'bottom' ? alphaBar() : ''}</main>`;
}

function formPage() {
  const entry = editingId ? contacts.find((item) => item.id === editingId) : normalizeAddress({});
  if (!entry) return contactsPage();
  const personName = editingId ? displayName(entry) : 'New contact';
  return `<main class="form-page"><div class="form-heading"><button class="back-link" data-action="cancel">${icon('chevron')} Back to contacts</button><h1>${editingId ? 'Edit contact' : 'New contact'}</h1></div>
    <form id="contact-form" class="contact-form"><section class="form-section"><div class="form-section-title"><span>01</span><div><h2>The person</h2></div></div><div class="form-fields form-grid"><label>First name<input name="first" value="${escapeHtml(entry.name.first)}" autocomplete="given-name" placeholder="First name"></label><label>Last name<input name="last" value="${escapeHtml(entry.name.last)}" autocomplete="family-name" placeholder="Last name"></label><label>Middle name<input name="middle" value="${escapeHtml(entry.name.middle)}" placeholder="Middle name"></label><label>Prefix / suffix<input name="prefixSuffix" value="${escapeHtml([entry.name.prefix, entry.name.suffix].filter(Boolean).join(' '))}" placeholder="e.g. Dr. or Jr."></label><label>Birthday<input name="dob" value="${escapeHtml(entry.name.dob)}" placeholder="Birthday"></label><label>Photo URL or email<input name="photo" type="text" value="${escapeHtml(entry.name.photo)}" placeholder="Image URL or email address"></label><label class="field-span">Categories<input name="category" value="${escapeHtml(entry.category.join(', '))}" placeholder="Friends, work, family"></label></div></section>
    <section class="form-section"><div class="form-section-title"><span>02</span><div><h2>Ways to reach them</h2><p>Email, phone, website, social media.</p></div></div><div id="contact-fields" class="contact-fields">${entry.contacts.length ? entry.contacts.map((item) => contactField(item)).join('') : contactField({ type: 'email', address: '' })}</div><button class="text-action" type="button" data-action="add-contact">${icon('plus')} Add another way to reach them</button></section>
    <section class="form-section"><div class="form-section-title"><span>03</span><div><h2>Where they are</h2><p>Work and/or home</p></div></div><div class="address-columns"><div class="address-group"><div class="address-group-label">BUSINESS / WORK</div><div class="form-fields"><label>Company<input name="company" value="${escapeHtml(entry.business.company)}" placeholder="Company"></label><label>Street address<input name="businessStreet" value="${escapeHtml(entry.business.street)}" placeholder="Street"></label><label>Suite / unit<input name="businessStreet2" value="${escapeHtml(entry.business.street2)}" placeholder="Suite, floor, unit"></label><label>Location<input name="businessLocation" value="${escapeHtml(entry.business.location)}" placeholder="Office, room, building"></label><div class="three-fields"><label>City<input name="businessCity" value="${escapeHtml(entry.business.city)}" placeholder="City"></label><label>State<input name="businessState" value="${escapeHtml(entry.business.state)}" placeholder="State"></label><label>ZIP<input name="businessZip" value="${escapeHtml(entry.business.zip)}" placeholder="ZIP"></label></div><label>Country<input name="businessCountry" value="${escapeHtml(entry.business.country)}" placeholder="Country"></label></div></div><div class="address-group"><div class="address-group-label">HOME</div><div class="form-fields"><label>Street address<input name="homeStreet" value="${escapeHtml(entry.home.street)}" placeholder="Street"></label><label>Apartment / unit<input name="homeStreet2" value="${escapeHtml(entry.home.street2)}" placeholder="Apartment, unit"></label><div class="three-fields"><label>City<input name="homeCity" value="${escapeHtml(entry.home.city)}" placeholder="City"></label><label>State<input name="homeState" value="${escapeHtml(entry.home.state)}" placeholder="State"></label><label>ZIP<input name="homeZip" value="${escapeHtml(entry.home.zip)}" placeholder="ZIP"></label></div><label>Country<input name="homeCountry" value="${escapeHtml(entry.home.country)}" placeholder="Country"></label></div></div></div><label class="notes-field">Notes<textarea name="notes" rows="3" placeholder="A detail you don't want to forget">${escapeHtml(entry.notes)}</textarea></label></section>
    <div class="form-actions"><button class="button button-quiet" type="button" data-action="cancel">Cancel</button><button class="button button-primary" type="submit">${editingId ? 'Save changes' : 'Add to address book'} ${icon('chevron')}</button></div></form></main>`;
}

function contactPage() {
  const entry = contacts.find((item) => item.id === selectedId);
  if (!entry) return contactsPage();
  const field = (label, value, className = '') => value == null || value === '' ? '' : `<div class="detail-field ${className}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  const addressFields = (address, business = false) => `
    ${business ? field('Company', address.company) : ''}
    ${field('Street address', address.street)}
    ${field(business ? 'Suite / unit' : 'Apartment / unit', address.street2)}
    ${field('Location', address.location)}
    <div class="three-fields">${field('City', address.city)}${field('State', address.state)}${field('ZIP', address.zip)}</div>
    ${field('Country', address.country)}`;
  const additional = Object.entries(entry.additional || {}).map(([key, value]) => field(key, typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : value)).join('');
  return `<main class="form-page contact-page"><div class="form-heading"><button class="back-link" data-page="contacts">${icon('chevron')} Back to contacts</button><div class="identity">${avatar(entry)}<h1 tabindex="-1">${escapeHtml(displayName(entry))}</h1></div></div>
    <div class="contact-form"><section class="form-section"><div class="form-section-title"><span>01</span><div><h2>The person</h2></div></div><dl class="form-fields form-grid">
      ${field('First name', entry.name.first)}${field('Last name', entry.name.last)}${field('Middle name', entry.name.middle)}
      ${field('Prefix / suffix', [entry.name.prefix, entry.name.suffix].filter(Boolean).join(' '))}
      ${field('Birthday', entry.name.dob)}${field('Photo URL or email', entry.name.photo)}
      ${field('Categories', entry.category.join(', '), 'field-span')}${field('Index', entry.index, 'field-span')}
    </dl></section>
    <section class="form-section"><div class="form-section-title"><span>02</span><div><h2>Ways to reach them</h2><p>Email, phone, website, social media.</p></div></div><dl class="contact-fields">${entry.contacts.filter((item) => item.address).map((item) => `<div class="detail-field"><dt>${escapeHtml(item.type)}</dt><dd>${selectedContactMarkup(item)}</dd></div>`).join('') || '<p class="empty-detail">No contact details</p>'}</dl></section>
    <section class="form-section"><div class="form-section-title"><span>03</span><div><h2>Where they are</h2><p>Work and/or home</p></div></div><div class="address-columns">
      ${['business', 'home'].map((type) => `<div class="address-group"><div class="address-group-label">${type === 'business' ? 'BUSINESS / WORK' : 'HOME'}${mapPinButton(entry, type, addressLine(entry[type]))}</div><dl class="form-fields">${addressFields(entry[type], type === 'business')}</dl></div>`).join('')}
    </div><dl class="notes-field">${field('Notes', entry.notes)}</dl></section>
    ${additional ? `<section class="form-section"><div class="form-section-title"><span>04</span><div><h2>Additional information</h2></div></div><dl class="form-fields form-grid">${additional}</dl></section>` : ''}
    <div class="form-actions"><button class="button button-quiet" data-page="contacts">Back to contacts</button><button class="button button-primary" data-edit="${escapeHtml(entry.id)}">${icon('edit')} Edit contact</button></div></div></main>`;
}

function mapPage() {
  const entry = contacts.find((item) => item.id === mapContactId);
  return `<main class="form-page map-page"><arcgis-map id="address-map" class="address-map" popup-disabled aria-label="${entry ? `Map showing ${escapeHtml(displayName(entry))}'s address` : 'Map showing current location'}"><arcgis-search slot="top-right"></arcgis-search><arcgis-popup slot="popup"></arcgis-popup></arcgis-map></main>`;
}

function destroyAddressMap() {
  mapGeneration += 1;
  if (addressMapView) {
    addressMapView.destroy();
    addressMapView = null;
  }
}

async function initializeAddressMap() {
  if (navigator.onLine === false) {
    showToast('Maps require an Internet connection.');
    return;
  }
  if (!arcgisApiKey) {
    console.log('Configure VITE_ARCGIS_API_KEY to load the Navigation map and locate addresses.');
    return;
  }
  const generation = ++mapGeneration;
  const mapElement = document.querySelector('#address-map');
  const entry = contacts.find((item) => item.id === mapContactId);
  if (!mapElement) return;
  try {
    const [mapModule, graphicModule, locatorModule] = await Promise.all([
      import('@arcgis/core/Map.js'),
      import('@arcgis/core/Graphic.js'),
      import('@arcgis/core/rest/locator.js'),
      import('@arcgis/map-components/components/arcgis-map'),
      import('@arcgis/map-components/components/arcgis-search'),
      import('@arcgis/map-components/components/arcgis-popup'),
    ]);
    if (generation !== mapGeneration) return;
    const ArcGISMap = mapModule.default;
    const Graphic = graphicModule.default;
    const map = new ArcGISMap({ basemap: `arcgis/${settings.mapType}` });
    mapElement.map = map;
    mapElement.center = [-98.5795, 39.8283];
    mapElement.zoom = 3;
    mapElement.constraints = { minZoom: 2 };
    await mapElement.viewOnReady();
    const view = mapElement.view;
    addressMapView = view;
    if (generation !== mapGeneration) return;
    if (!entry) {
      try {
        const position = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('Location unavailable'));
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 60000 });
        });
        if (generation !== mapGeneration) return;
        await view.goTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 17 });
      } catch {
        if (generation === mapGeneration) showToast('Current location unavailable. Search for a location on the map.');
      }
      return;
    }
    const address = addressLine(entry[mapLocationType]);
    const candidates = await locatorModule.addressToLocations(GEOCODING_URL, {
      address: { SingleLine: address },
      maxLocations: 1,
      outFields: ['*'],
    });
    if (generation !== mapGeneration) return;
    const candidate = candidates[0];
    if (!candidate?.location) {
      // @todo: Display a message in a toast notification in the center of the map indicating
      // that no location could be found for the given address.
      console.log('No map location was found for this address.');
      return;
    }
    await view.goTo({ center: candidate.location, zoom: 17 });
    if (generation !== mapGeneration) return;
    const popup = mapElement.querySelector('arcgis-popup');
    const contactGraphic = new Graphic({
      geometry: candidate.location,
      symbol: {
        type: 'simple-marker',
        style: 'circle',
        color: '#e43b3b',
        size: 14,
        outline: { color: '#feffd6', width: 2 },
      },
      attributes: { name: displayName(entry), address },
      popupTemplate: {
        title: displayName(entry),
        content: () => createContactPopup(entry, address, candidate.location, mapElement, popup),
        overwriteActions: true,
        actions: [],
      },
    });
    view.graphics.add(contactGraphic);
    if (popup) {
      popup.location = candidate.location;
      popup.features = [contactGraphic];
      popup.hideHeading = false;
      popup.includeDefaultActionsDisabled = true;
      popup.dockOptions = { breakpoint: false, buttonEnabled: false };
      popup.open = true;
    }
  } catch (error) {
    if (generation === mapGeneration) console.log(`Unable to load this address map: ${error.message}`); // @todo: Display a message in a toast notification in the center of the map indicating the error.
  }
}

function createContactPopup(entry, address, destination, mapElement, popup) {
  const content = document.createElement('div');
  content.className = 'contact-map-popup';
  content.innerHTML = `<p style="font-family: 'Manrope'; font-size: 14px;">${escapeHtml(address)}</p><div style="display: flex; justify-content: flex-end;"><button type="button" class="button contact-popup-route"><calcite-icon icon="location-sharing" scale="s" aria-hidden="true"></calcite-icon> Route</button></div>`;
  const routeButton = content.querySelector('.contact-popup-route');
  routeButton.addEventListener('click', async () => {
    routeButton.disabled = true;
    try {
      await openContactDirections(mapElement, destination, displayName(entry));
      if (mapElement.isConnected) popup.open = false;
    } catch {
      if (mapElement.isConnected) showToast('Unable to open directions. Please try again.');
    } finally {
      routeButton.disabled = false;
    }
  });
  return content;
}

async function openContactDirections(mapElement, destination, name) {
  const generation = mapGeneration;
  const [routeModule] = await Promise.all([
    import('@arcgis/core/layers/RouteLayer.js'),
    import('@arcgis/map-components/components/arcgis-directions'),
  ]);
  if (generation !== mapGeneration || !mapElement.isConnected) return;
  let directions = mapElement.querySelector('arcgis-directions');
  if (!directions) {
    directions = document.createElement('arcgis-directions');
    directions.slot = 'top-left';
    directions.className = 'contact-directions';
    directions.layer = new routeModule.default({ stops: [{ geometry: destination, name }] });
    mapElement.map.add(directions.layer);
    mapElement.append(directions);
  }
  const destinationStop = { geometry: destination, name };
  directions.layer.stops = [destinationStop];
  try {
    const position = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location unavailable'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 60000 });
    });
    if (generation !== mapGeneration || !mapElement.isConnected) return;
    directions.layer.stops = [
      { name: 'Current location', geometry: { x: position.coords.longitude, y: position.coords.latitude, spatialReference: { wkid: 4326 } } },
      destinationStop,
    ];
  } catch {
    if (generation === mapGeneration) showToast('Current location unavailable. Enter a starting address in Directions.');
  }
}

function contactField(item) {
  return `<div class="contact-input-row"><select name="contactType" aria-label="Contact type"><option value="email" ${item.type === 'email' ? 'selected' : ''}>Email</option><option value="mobile" ${item.type === 'mobile' ? 'selected' : ''}>Mobile</option><option value="phone" ${item.type === 'phone' ? 'selected' : ''}>Phone</option><option value="work" ${item.type === 'work' ? 'selected' : ''}>Work</option><option value="website" ${item.type === 'website' ? 'selected' : ''}>Website</option><option value="other" ${!['email', 'mobile', 'phone', 'work', 'website'].includes(item.type) ? 'selected' : ''}>Other</option></select><input name="contactAddress" value="${escapeHtml(item.address)}" placeholder="Email address or phone number"><button class="remove-contact" type="button" data-action="remove-contact" aria-label="Remove contact detail">${icon('close')}</button></div>`;
}

function mapTypeSettings() {
  const previews = ['streets-navigation', 'streets-night', 'streets-relief', 'streets-night', 'topo-vector', 'hybrid'];
  return `<section class="settings-section map-type-section"><h2>Map type</h2><div class="map-type-choices" role="radiogroup" aria-label="Map type">${mapStyles.map((style, index) => `<label class="map-type-choice"><input type="radio" name="map-type" data-setting="mapType" value="${style}" ${settings.mapType === style ? 'checked' : ''}><img data-map-thumbnail="${style}" src="https://js.arcgis.com/5.1.27/@arcgis/core/assets/esri/images/basemap/${previews[index]}.jpg" width="50" height="50" alt=""><span>${escapeHtml(style)}</span></label>`).join('')}</div></section>`;
}

async function loadMapTypeThumbnails() {
  if (!arcgisApiKey) return;
  const images = [...document.querySelectorAll('[data-map-thumbnail]')];
  const { default: Basemap } = await import('@arcgis/core/Basemap.js');
  await Promise.all(images.map(async (image) => {
    const basemap = new Basemap({ style: { id: `arcgis/${image.dataset.mapThumbnail}` } });
    try {
      await basemap.load();
      if (image.isConnected && basemap.thumbnailUrl) image.src = basemap.thumbnailUrl;
    } catch {} finally {
      basemap.destroy();
    }
  }));
}

function settingsPage() {
  return `<main class="settings-page"><div class="form-heading"><button class="back-link" data-page="contacts">${icon('chevron')} Back to contacts</button><h1>Settings</h1></div><section class="settings-section"><div class="settings-row"><div><h2>Default view</h2><p>The first thing you see when opening your address book.</p></div><select data-setting="defaultView"><option value="cards" ${settings.defaultView === 'cards' ? 'selected' : ''}>Card view</option><option value="list" ${settings.defaultView === 'list' ? 'selected' : ''}>List view</option></select></div><div class="settings-row"><div><h2>Alphabet placement</h2><p>Choose where the A–Z navigation lives.</p></div><select data-setting="alphaPlacement"><option value="right" ${settings.alphaPlacement === 'right' ? 'selected' : ''}>Right</option><option value="left" ${settings.alphaPlacement === 'left' ? 'selected' : ''}>Left</option><option value="top" ${settings.alphaPlacement === 'top' ? 'selected' : ''}>Top</option><option value="bottom" ${settings.alphaPlacement === 'bottom' ? 'selected' : ''}>Bottom</option></select></div><div class="settings-row"><div><h2>Sort contacts by</h2><p>Used to organize the alphabet and contact list.</p></div><select data-setting="sortBy"><option value="first" ${settings.sortBy === 'first' ? 'selected' : ''}>First name</option><option value="last" ${settings.sortBy === 'last' ? 'selected' : ''}>Last name</option><option value="company" ${settings.sortBy === 'company' ? 'selected' : ''}>Company</option></select></div></section><section class="settings-section settings-data"><div class="settings-section-head"><div><h2>Move your data</h2><p>Your address book stays on this device unless you export it.</p></div></div><div class="data-actions"><button class="data-action" data-action="import"><span class="data-icon">${icon('upload')}</span><span><strong>Import contacts</strong><small>JSON, CSV, YAML, or a text entry</small></span>${icon('chevron')}</button><button class="data-action" data-action="export"><span class="data-icon">${icon('download')}</span><span><strong>Export address book</strong><small>Download as JSON or CSV</small></span>${icon('chevron')}</button></div><div class="storage-note"><span class="status-dot"></span> Saved in this browser · ${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}</div></section></main>`;
}

function duplicatesPage() {
  const groups = findDuplicateGroups(contacts);
  return `<main class="settings-page duplicates-page"><div class="form-heading"><button class="back-link" data-page="settings">${icon('chevron')} Back to settings</button><h1>Identify Duplicates</h1></div>${groups.length ? groups.map((group, index) => `<section class="duplicate-group" data-duplicate-group="${index}"><h2>${escapeHtml(group[0].name.last.trim())} <small>${group.length} contacts</small></h2>${group.map((entry, entryIndex) => `<label class="duplicate-entry"><input type="radio" name="keep-duplicate-${index}" value="${escapeHtml(entry.id)}" ${entryIndex === 0 ? 'checked' : ''}><span class="duplicate-details"><strong>Keep ${escapeHtml(displayName(entry))}</strong><span>${escapeHtml(entry.business.company)}</span>${entry.contacts.filter(item => item.address).map(item => `<span>${escapeHtml(item.type)}: ${escapeHtml(formatPhoneNumber(item.address))}</span>`).join('')}<span>${escapeHtml(addressLine(entry.business))}</span><span>${escapeHtml(addressLine(entry.home))}</span><span>${escapeHtml(entry.category.join(', '))}</span><span>${escapeHtml(entry.notes)}</span><details><summary>All fields</summary><pre>${escapeHtml(JSON.stringify(serializeEntry(entry), null, 2))}</pre></details></span></label>`).join('')}<div class="duplicate-actions"><button class="button button-quiet" data-duplicate-action="delete" data-group-index="${index}">${icon('trash')} Delete others</button><button class="button button-primary" data-duplicate-action="merge" data-group-index="${index}">${icon('plus')} Merge</button></div></section>`).join('') : '<p class="duplicates-empty" role="status">No duplicate contacts found.</p>'}</main>`;
}

function importStrategyOptions() {
  return `<fieldset class="import-strategies"><legend>Add to address book</legend><label><input type="radio" name="import-strategy" value="merge" checked><span>Import and merge</span></label><label><input type="radio" name="import-strategy" value="replace"><span>Import and replace</span></label><label><input type="radio" name="import-strategy" value="match"><span>Import and match</span></label></fieldset>`;
}

function render() {
  destroyAddressMap();
  const page = activePage === 'form' ? formPage() : activePage === 'contact' ? contactPage() : activePage === 'settings' ? settingsPage() : activePage === 'duplicates' ? duplicatesPage() : activePage === 'map' ? mapPage() : contactsPage();
  document.querySelector('#app').innerHTML = `${header()}${page}${activePage === 'contacts' ? navigation() : ''}<div id="toast" class="toast" role="status" aria-live="polite"></div><dialog id="import-dialog" class="app-dialog"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close">${icon('close')}</button></form><div class="eyebrow">BRING YOUR CONTACTS ALONG</div><h2>Import contacts</h2><p>Choose whether to add these contacts alongside your existing contacts or replace the address book.</p><div class="import-modes"><label><input type="radio" name="import-mode" value="replace"><span><strong>Replace address book</strong><small>Remove existing contacts before importing.</small></span></label><label><input type="radio" name="import-mode" value="merge" checked><span><strong>Add to address book</strong><small>Keep current contacts and add imported ones.</small></span></label></div><button class="button button-primary dialog-main-action" data-action="choose-import">Choose a file ${icon('chevron')}</button></dialog><dialog id="export-dialog" class="app-dialog"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close">${icon('close')}</button></form><div class="eyebrow">TAKE YOUR DATA WITH YOU</div><h2>Export address book</h2><p>Download your contacts in a format you can keep or share.</p><label class="dialog-label">File name<input id="export-name" value="my-addresses" autocomplete="off"></label><div class="export-format" role="group" aria-label="Export format"><button data-export-format="json" class="is-active">JSON</button><button data-export-format="csv">CSV</button></div><button class="button button-primary dialog-main-action" data-action="download-export">Download file ${icon('download')}</button></dialog>`;
  if (activePage === 'settings') {
    document.querySelector('.settings-data')?.insertAdjacentHTML('beforebegin', mapTypeSettings());
    document.querySelector('.settings-data')?.insertAdjacentHTML('beforebegin', `<section class="settings-section settings-data"><div class="settings-section-head"><h2>Identify Duplicates</h2></div><button class="data-action" data-page="duplicates"><span class="data-icon">${icon('search')}</span><span><strong>Identify duplicates</strong></span>${icon('chevron')}</button></section>`);
    loadMapTypeThumbnails();
  }
  document.querySelector('#import-dialog .import-modes')?.insertAdjacentHTML('afterend', importStrategyOptions());
  bindEvents();
  loadGravatarImages();
  updateAlphaOffset();
  if (activePage === 'map') initializeAddressMap();
}

function updateAlphaOffset() {
  const nav = document.querySelector('.alpha-bar');
  if (!nav) return;
  const active = nav.querySelector('.is-active');
  if (active && (settings.alphaPlacement === 'right' || settings.alphaPlacement === 'left')) {
    active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function selectContact(id) {
  selectedId = id;
  activePage = 'contact';
  render();
  window.scrollTo(0, 0);
  document.querySelector('.contact-page h1')?.focus();
}

function openForm(id = null) {
  editingId = id;
  activePage = 'form';
  render();
  window.scrollTo(0, 0);
  document.querySelector('#contact-form input[name="first"]')?.focus();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const current = editingId ? contacts.find((entry) => entry.id === editingId) : normalizeAddress({});
  const contactsFromForm = [...event.currentTarget.querySelectorAll('.contact-input-row')].map((row) => ({
    type: row.querySelector('[name="contactType"]').value,
    address: row.querySelector('[name="contactAddress"]').value.trim(),
  })).filter((item) => item.address);
  const prefixParts = asString(formData.get('prefixSuffix')).trim().split(/\s+/).filter(Boolean);
  const entry = normalizeAddress({
    ...current,
    index: '',
    name: {
      ...current.name,
      first: asString(formData.get('first')).trim(),
      last: asString(formData.get('last')).trim(),
      middle: asString(formData.get('middle')).trim(),
      prefix: prefixParts.length > 1 ? prefixParts[0] : '',
      suffix: prefixParts.length > 1 ? prefixParts.slice(1).join(' ') : prefixParts[0] || '',
      dob: asString(formData.get('dob')).trim(),
      photo: asString(formData.get('photo')).trim(),
    },
    category: asString(formData.get('category')).split(',').map((tag) => tag.trim()).filter(Boolean),
    contacts: contactsFromForm,
    business: {
      company: asString(formData.get('company')).trim(),
      street: asString(formData.get('businessStreet')).trim(),
      street2: asString(formData.get('businessStreet2')).trim(),
      location: asString(formData.get('businessLocation')).trim(),
      city: asString(formData.get('businessCity')).trim(),
      state: asString(formData.get('businessState')).trim(),
      zip: asString(formData.get('businessZip')).trim(),
      country: asString(formData.get('businessCountry')).trim(),
    },
    home: {
      street: asString(formData.get('homeStreet')).trim(),
      street2: asString(formData.get('homeStreet2')).trim(),
      city: asString(formData.get('homeCity')).trim(),
      state: asString(formData.get('homeState')).trim(),
      zip: asString(formData.get('homeZip')).trim(),
      country: asString(formData.get('homeCountry')).trim(),
    },
    notes: asString(formData.get('notes')).trim(),
  });
  if (!isValidPhoto(entry.name.photo)) {
    showToast('Enter an image URL or a valid email address for the photo.');
    document.querySelector('#contact-form input[name="photo"]')?.focus();
    return;
  }
  if (!entry.name.first && !entry.name.last && !entry.business.company) {
    showToast('Add a first name, last name, or company first.');
    document.querySelector('#contact-form input[name="first"]')?.focus();
    return;
  }
  const wasEditing = Boolean(editingId);
  if (wasEditing) contacts = contacts.map((item) => item.id === editingId ? entry : item);
  else contacts.push(entry);
  selectedId = entry.id;
  saveBook();
  activePage = 'contacts';
  editingId = null;
  render();
  showToast(wasEditing ? 'Contact updated.' : 'Contact added.');
}

function deleteSelected() {
  if (!selectedId) return;
  const entry = contacts.find((item) => item.id === selectedId);
  if (!entry || !window.confirm(`Delete ${displayName(entry)} from your address book?`)) return;
  contacts = contacts.filter((item) => item.id !== selectedId);
  selectedId = contacts[0]?.id || null;
  saveBook();
  render();
  showToast('Contact deleted.');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = (rows.shift() || []).map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return rows.filter((values) => values.some(Boolean)).map((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    return csvRecordToContact(record);
  });
}

function csvRecordToContact(record) {
  const value = (...keys) => keys.map((key) => record[key]).find((item) => item != null) || '';
  return normalizeAddress({
    name: { first: value('first', 'first_name'), last: value('last', 'last_name'), middle: value('middle', 'middle_name'), photo: value('photo', 'photo_url') },
    category: value('category', 'categories').split(/[;,]/).map((item) => item.trim()).filter(Boolean),
    contacts: ['email', 'mobile', 'phone', 'work', 'website'].filter((key) => value(key)).map((key) => ({ type: key, address: value(key) })),
    business: { company: value('company', 'organization'), street: value('street', 'business_street'), street2: value('street2', 'business_street2'), city: value('city', 'business_city'), state: value('state', 'business_state'), zip: value('zip', 'postal_code'), country: value('country', 'business_country') },
    notes: value('notes'),
  });
}

function parseTxt(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.*?)\s*$/);
    if (match) values[match[1].trim().toLowerCase().replace(/[\s-]+/g, '_')] = match[2];
  }
  if (Object.keys(values).length) return [csvRecordToContact(values)];
  const name = text.trim().split(/\r?\n/)[0] || '';
  return name ? [normalizeAddress({ name: { first: name } })] : [];
}

function splitVCardValue(value, separator) {
  const parts = [];
  let part = '';
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      part += `\\${char}`;
      escaped = false;
    } else if (char === '\\') escaped = true;
    else if (char === separator) { parts.push(part); part = ''; }
    else part += char;
  }
  if (escaped) part += '\\';
  parts.push(part);
  return parts;
}

function unescapeVCardValue(value) {
  return value.replace(/\\([nN,;:\\])/g, (_, char) => char.toLowerCase() === 'n' ? '\n' : char);
}

function parseVCardProperty(line) {
  const separator = line.indexOf(':');
  if (separator < 1) return null;
  const [property, ...parameters] = line.slice(0, separator).split(';');
  return {
    name: property.split('.').at(-1).toUpperCase(),
    parameters,
    value: line.slice(separator + 1),
  };
}

function vCardTypes(property) {
  return property.parameters.flatMap((parameter) => {
    const value = parameter.includes('=') ? parameter.slice(parameter.indexOf('=') + 1) : parameter;
    return value.replace(/^"|"$/g, '').split(',').map((type) => type.toUpperCase());
  });
}

function parseVCard(lines) {
  const properties = lines.map(parseVCardProperty).filter(Boolean);
  const values = (name) => properties.filter((property) => property.name === name);
  const textValue = (property) => unescapeVCardValue(property.value).trim();
  const nameProperty = values('N')[0];
  const nameParts = nameProperty ? splitVCardValue(nameProperty.value, ';').map((part) => unescapeVCardValue(part).trim()) : [];
  const fullName = textValue(values('FN')[0] || { value: '' });
  const organization = splitVCardValue(values('ORG')[0]?.value || '', ';')
    .map((part) => unescapeVCardValue(part).trim()).filter(Boolean).join(', ');
  const contactDetails = [
    ...values('EMAIL').map((property) => ({ type: 'email', address: textValue(property) })),
    ...values('TEL').map((property) => {
      const types = vCardTypes(property);
      const type = types.some((item) => item === 'CELL' || item === 'MOBILE') ? 'mobile' : types.includes('WORK') ? 'work' : 'phone';
      return { type, address: textValue(property) };
    }),
    ...values('URL').map((property) => ({ type: 'website', address: textValue(property) })),
  ].filter((item) => item.address);
  const business = {};
  const home = {};
  for (const property of values('ADR')) {
    const parts = splitVCardValue(property.value, ';').map((part) => unescapeVCardValue(part).trim());
    const address = {
      street: parts[2] || '',
      street2: parts[1] || parts[0] || '',
      city: parts[3] || '',
      state: parts[4] || '',
      zip: parts[5] || '',
      country: parts[6] || '',
    };
    const target = vCardTypes(property).includes('HOME') ? home : business;
    Object.assign(target, Object.fromEntries(Object.entries(address).filter(([, value]) => value)));
  }
  const categories = values('CATEGORIES').flatMap((property) => splitVCardValue(property.value, ',')
    .map((category) => unescapeVCardValue(category).trim()).filter(Boolean));
  const photo = values('PHOTO').map(textValue).find((value) => /^https?:\/\//i.test(value)) || '';
  return normalizeAddress({
    name: {
      first: nameParts[1] || (nameProperty ? '' : fullName),
      last: nameParts[0] || '',
      middle: nameParts[2] || '',
      prefix: nameParts[3] || '',
      suffix: nameParts[4] || '',
      dob: textValue(values('BDAY')[0] || { value: '' }),
      photo,
    },
    category: categories,
    contacts: contactDetails,
    business: { company: organization, ...business },
    home,
    notes: textValue(values('NOTE')[0] || { value: '' }),
  });
}

function parseVcf(text) {
  const unfolded = text.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const contacts = [];
  let currentCard = null;
  for (const line of unfolded) {
    if (/^BEGIN:VCARD$/i.test(line.trim())) currentCard = [];
    else if (/^END:VCARD$/i.test(line.trim())) {
      if (currentCard) contacts.push(parseVCard(currentCard));
      currentCard = null;
    } else if (currentCard) currentCard.push(line);
  }
  return contacts;
}

async function importFile(file) {
  const replaceBook = document.querySelector('input[name="import-mode"]:checked')?.value === 'replace';
  const strategy = document.querySelector('input[name="import-strategy"]:checked')?.value || 'merge';
  const text = await file.text();
  let incoming;
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'json') {
    const parsed = JSON.parse(text);
    incoming = Array.isArray(parsed) ? parsed : parsed.addresses || [parsed];
  } else if (extension === 'yaml' || extension === 'yml') {
    const parsed = parseYaml(text);
    incoming = Array.isArray(parsed) ? parsed : parsed?.addresses || [parsed];
  } else if (extension === 'csv') incoming = parseCsv(text);
  else if (extension === 'vcf') incoming = parseVcf(text);
  else incoming = parseTxt(text);
  const normalized = incoming.filter((item) => item && typeof item === 'object').map(normalizeAddress);
  if (!normalized.length) throw new Error('No contacts were found in that file.');
  const result = importContacts(contacts, normalized, strategy, replaceBook);
  contacts = result.contacts;
  selectedId = contacts.at(-1)?.id || null;
  saveBook();
  activeLetter = 'ALL';
  searchTerm = '';
  activePage = 'contacts';
  render();
  showToast(`Import complete: ${result.counts.added} added, ${result.counts.updated} updated, ${result.counts.ignored} ignored.`);
}

function csvCell(value) {
  const text = asString(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportData(format) {
  let content;
  let mime;
  let extension;
  book.head = { ...(book.head || {}), dateLastExport: Date.now() };
  saveBook();
  if (format === 'csv') {
    const headers = ['first', 'last', 'category', 'email', 'mobile', 'phone', 'work', 'website', 'company', 'street', 'street2', 'city', 'state', 'zip', 'country', 'notes'];
    const rows = contacts.map((entry) => {
      const byType = Object.fromEntries(entry.contacts.map((item) => [item.type, item.address]));
      return [entry.name.first, entry.name.last, entry.category.join('; '), byType.email, byType.mobile, byType.phone, byType.work, byType.website, entry.business.company, entry.business.street, entry.business.street2, entry.business.city, entry.business.state, entry.business.zip, entry.business.country, entry.notes];
    });
    content = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    mime = 'text/csv;charset=utf-8';
    extension = 'csv';
  } else {
    content = JSON.stringify({ ...book, addresses: contacts.map((entry) => serializeEntry(entry)) }, null, 2);
    mime = 'application/json';
    extension = 'json';
  }
  const baseName = document.querySelector('#export-name').value.trim().replace(/\.[^.]+$/, '') || 'my-addresses';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
  document.querySelector('#export-dialog').close();
  render();
  showToast(`Downloaded ${baseName}.${extension}`);
}

function bindEvents() {
  document.querySelectorAll('[data-duplicate-action]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.groupIndex);
    const group = findDuplicateGroups(contacts)[index];
    const keepId = document.querySelector(`input[name="keep-duplicate-${index}"]:checked`)?.value;
    const survivor = group?.find(entry => entry.id === keepId);
    if (!survivor) return;
    const merge = button.dataset.duplicateAction === 'merge';
    if (!window.confirm(`${merge ? 'Merge into' : 'Keep'} ${displayName(survivor)} and delete ${group.length - 1} other ${group.length === 2 ? 'contact' : 'contacts'}?`)) return;
    contacts = resolveDuplicateGroup(contacts, group.map(entry => entry.id), keepId, merge).map(normalizeAddress);
    selectedId = keepId;
    saveBook();
    render();
    showToast(merge ? 'Duplicate contacts merged.' : 'Other duplicate contacts deleted.');
  }));
  document.querySelectorAll('input[name="import-mode"]').forEach((input) => input.addEventListener('change', () => {
    document.querySelector('.import-strategies').disabled = document.querySelector('input[name="import-mode"]:checked')?.value === 'replace';
  }));
  document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    activePage = button.dataset.page;
    if (activePage === 'map') mapContactId = null;
    render();
    window.scrollTo(0, 0);
  }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', (event) => {
    const action = button.dataset.action;
    if (action === 'new') openForm();
    if (action === 'edit') openForm(selectedId);
    if (action === 'delete') deleteSelected();
    if (action === 'clear-filters') {
      searchTerm = '';
      activeLetter = 'ALL';
      expandedLetters.clear();
      render();
      document.querySelector('#search-input')?.focus();
    }
    if (action === 'map-back') { activePage = 'contacts'; mapContactId = null; render(); }
    if (action === 'cancel') { activePage = 'contacts'; editingId = null; render(); }
    if (action === 'import') document.querySelector('#import-dialog').showModal();
    if (action === 'choose-import') { event.preventDefault(); document.querySelector('#import-dialog').close(); document.querySelector('#import-file').click(); }
    if (action === 'export') document.querySelector('#export-dialog').showModal();
    if (action === 'download-export') { event.preventDefault(); exportData(document.querySelector('[data-export-format].is-active')?.dataset.exportFormat || 'json'); }
    if (action === 'add-contact') document.querySelector('#contact-fields').insertAdjacentHTML('beforeend', contactField({ type: 'email', address: '' }));
    if (action === 'remove-contact') { button.closest('.contact-input-row').remove(); }
  }));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { activeView = button.dataset.view; render(); }));
  document.querySelectorAll('[data-alpha]').forEach((button) => button.addEventListener('click', () => { searchTerm = ''; activeLetter = button.dataset.alpha; expandedLetters.clear(); render(); }));
  document.querySelectorAll('[data-card-id], [data-row-id]').forEach((element) => {
    element.addEventListener('click', (event) => {
      if (event.target.closest('button, select, a, label')) return;
      selectContact(element.dataset.cardId || element.dataset.rowId);
    });
    element.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === element) { event.preventDefault(); selectContact(element.dataset.cardId || element.dataset.rowId); }
    });
  });
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openForm(button.dataset.edit)));
  document.querySelectorAll('[data-map-contact]').forEach((button) => button.addEventListener('click', () => {
    mapContactId = button.dataset.mapContact;
    mapLocationType = button.dataset.mapLocation;
    activePage = 'map';
    render();
    window.scrollTo(0, 0);
  }));
  document.querySelectorAll('[data-letter-toggle]').forEach((button) => button.addEventListener('click', () => {
    const letter = button.dataset.letterToggle;
    if (expandedLetters.has(letter)) expandedLetters.delete(letter); else expandedLetters.add(letter);
    render();
  }));
  document.querySelectorAll('[data-contact-select]').forEach((select) => select.addEventListener('change', () => {
    const entry = contacts.find((item) => item.id === select.dataset.contactSelect);
    const target = document.querySelector(`[data-selected-contact="${CSS.escape(select.dataset.contactSelect)}"]`);
    if (entry && target) target.innerHTML = selectedContactMarkup(entry.contacts[Number(select.value)]);
  }));
  const search = document.querySelector('#search-input');
  search?.addEventListener('input', () => {
    const position = search.selectionStart;
    searchTerm = search.value;
    render();
    const next = document.querySelector('#search-input');
    next?.focus();
    next?.setSelectionRange(position, position);
  });
  document.querySelectorAll('[data-setting]').forEach((select) => select.addEventListener('change', () => {
    settings[select.dataset.setting] = select.value;
    persistSettings();
    if (select.dataset.setting === 'defaultView') activeView = select.value;
    render();
  }));
  document.querySelectorAll('[data-export-format]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-export-format]').forEach((option) => option.classList.toggle('is-active', option === button));
  }));
  document.querySelector('#contact-form')?.addEventListener('submit', handleFormSubmit);
  document.querySelector('#import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try { await importFile(file); }
    catch (error) { window.alert(`Could not import that file: ${error.message}`); }
    event.target.value = '';
  });
}

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    activePage = 'contacts';
    render();
    document.querySelector('#search-input')?.focus();
  }
  if (event.key === 'Escape' && (activePage === 'form' || activePage === 'contact')) { activePage = 'contacts'; editingId = null; render(); }
});

render();
