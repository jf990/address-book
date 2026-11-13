import { contactKey, mergeContact } from './import-contacts.js';

export function findDuplicateGroups(contacts) {
  const groups = [];
  const visited = new Set();
  const matches = (first, second) => {
    const last = String(first.name?.last || '').trim().toLowerCase();
    if (!last || last !== String(second.name?.last || '').trim().toLowerCase()) return false;
    const keys = new Set((first.contacts || []).map(contactKey).filter(Boolean));
    return (second.contacts || []).some((contact) => keys.has(contactKey(contact)));
  };
  for (const contact of contacts) {
    if (visited.has(contact.id)) continue;
    const group = [contact];
    visited.add(contact.id);
    for (let index = 0; index < group.length; index += 1) {
      for (const candidate of contacts) {
        if (!visited.has(candidate.id) && matches(group[index], candidate)) {
          group.push(candidate);
          visited.add(candidate.id);
        }
      }
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

export function resolveDuplicateGroup(contacts, ids, keepId, merge = false) {
  const group = contacts.filter((contact) => ids.includes(contact.id));
  const survivor = group.find((contact) => contact.id === keepId);
  if (!survivor) throw new Error('Choose a contact to keep.');
  let kept = structuredClone(survivor);
  if (merge) {
    for (const contact of group) {
      if (contact.id === keepId) continue;
      kept = mergeContact(kept, contact);
      kept.category = [...new Set([...(kept.category || []), ...(contact.category || [])])];
      const notes = String(contact.notes || '').trim();
      if (notes && notes !== String(kept.notes || '').trim()) kept.notes = [kept.notes, notes].filter(Boolean).join('\n\n');
    }
  }
  return contacts.flatMap((contact) => contact.id === keepId ? [kept] : ids.includes(contact.id) ? [] : [contact]);
}