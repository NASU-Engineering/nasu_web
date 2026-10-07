// Updates feed (the page at /announcements). Pure functions — no DOM.
//
// The Hub is the source of truth; WhatsApp "Updates" will only distribute a
// short notice + deep link back here (not built yet).

// Kinds shown as the primary filters. 'general' has no filter of its own (only "All").
export const UPDATE_KINDS = {
  academic: { id: 'academic', label: 'Academic' },
  deadline: { id: 'deadline', label: 'Deadline' },
  activity: { id: 'activity', label: 'Activity' },
  general:  { id: 'general',  label: 'General' },
};

export const UPDATE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'academic', label: 'Academic' },
  { value: 'deadline', label: 'Deadlines' },
  { value: 'activity', label: 'Activities' },
];

const LINK_KIND = { assignment: 'deadline', activity: 'activity', quiz: 'academic', resource: 'academic', subject: 'academic' };

/**
 * Kind of an update: an explicit `type` when the backend sends a known one,
 * otherwise derived from its deep link, otherwise academic if it belongs to a
 * subject, else general.
 */
export function updateKind(u) {
  if (u?.type && UPDATE_KINDS[u.type]) return u.type;
  if (u?.link?.type === 'resource' && u.link.category === 'assignment') return 'deadline';
  if (u?.link?.type && LINK_KIND[u.link.type]) return LINK_KIND[u.link.type];
  return u?.subjectId ? 'academic' : 'general';
}

/** Pinned first, then newest first. Returns a new array. */
export function sortUpdates(list) {
  return [...(list || [])].sort((a, b) =>
    (Number(b.pinned) - Number(a.pinned)) || String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
}

/** kind: '' | academic | deadline | activity · subjectId: '' or a subject id. */
export function filterUpdates(list, { kind = '', subjectId = '' } = {}) {
  return (list || []).filter(u => (!kind || updateKind(u) === kind) && (!subjectId || u.subjectId === subjectId));
}
