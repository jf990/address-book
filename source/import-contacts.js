export function contactKey(contact) {
  const address = String(contact.address || '').trim();
  const type = String(contact.type || '').toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return `email:${address.toLowerCase()}`;
  if (!/^(phone\d*|mobile|cell|telephone|tel|work|home|fax)$/.test(type)) return '';
  const number = address.replace(/^tel:/i, '').split(/(?:ext\.?|x|;ext=)/i)[0].trim();
  if (!/^\+?[\d\s().-]+$/.test(number)) return '';
  let digits = number.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length >= 7 ? `phone:${digits}` : '';
}

function empty(value) {
  return value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
}

function fillEmptyFields(existing, incoming) {
  if (empty(existing)) return structuredClone(incoming);
  if (!existing || !incoming || Array.isArray(existing) || Array.isArray(incoming)
    || typeof existing !== 'object' || typeof incoming !== 'object') return existing;
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || empty(value)) continue;
    result[key] = fillEmptyFields(existing[key], value);
  }
  return result;
}

export function mergeContact(existing, incoming) {
  const result = fillEmptyFields(existing, incoming);
  result.contacts = structuredClone(existing.contacts || []);
  for (const contact of incoming.contacts || []) {
    if (empty(contact.address)) continue;
    const same = result.contacts.find((item) => item.type === contact.type
      && ((contactKey(contact) && contactKey(item) === contactKey(contact)) || item.address === contact.address));
    if (same) continue;
    const blank = result.contacts.find((item) => item.type === contact.type && empty(item.address));
    if (blank) blank.address = contact.address;
    else result.contacts.push(structuredClone(contact));
  }
  result.id = existing.id;
  return result;
}

export function importContacts(existing, incoming, mode = 'merge', replaceBook = false) {
  const result = replaceBook ? [] : structuredClone(existing);
  const counts = { added: 0, updated: 0, ignored: 0 };
  for (const contact of incoming) {
    const keys = new Set((contact.contacts || []).map(contactKey).filter(Boolean));
    const matchIndex = replaceBook ? -1 : result.findIndex((entry) => (entry.contacts || []).some((item) => keys.has(contactKey(item))));
    if (matchIndex >= 0) {
      const current = result[matchIndex];
      result[matchIndex] = mode === 'replace'
        ? { ...structuredClone(contact), id: current.id }
        : mergeContact(current, contact);
      counts.updated += 1;
    } else if (mode === 'match' && !replaceBook) counts.ignored += 1;
    else {
      const added = structuredClone(contact);
      if (!added.id || result.some((entry) => entry.id === added.id)) added.id = crypto.randomUUID();
      result.push(added);
      counts.added += 1;
    }
  }
  return { contacts: result, counts };
}