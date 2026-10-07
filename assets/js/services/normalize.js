// Turns raw records (legacy resources.json or backend rows) into the shapes views expect.

import { categoryById } from '../data/catalog.js';

// Only http(s) links are ever rendered as clickable.
export function safeUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url, globalThis.location?.href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

// Legacy resources.json used type 'video' (a link) and 'pdf'.
const LEGACY_TYPE_TO_CATEGORY = { video: 'lecture', pdf: 'pdf' };

export function normalizeResource(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const category = categoryById(raw.category) ? raw.category : (LEGACY_TYPE_TO_CATEGORY[raw.type] || 'pdf');
  const url = safeUrl(raw.url);
  return {
    id: String(raw.id ?? ''),
    subjectId: String(raw.subjectId ?? raw.subject ?? ''),
    category,
    title: String(raw.title ?? 'Untitled'),
    url,
    format: raw.format || (category === 'pdf' || /\.pdf($|\?)/i.test(url || '') ? 'pdf' : 'link'),
    addedAt: raw.addedAt || null,
    week: Number.isFinite(raw.week) ? raw.week : null,
    dueAt: raw.dueAt || null,
    placeholder: Boolean(raw.placeholder),
  };
}

export function normalizeAnnouncement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    body: String(raw.body ?? ''),
    subjectId: raw.subjectId || null,
    publishedAt: raw.publishedAt || null,
    pinned: Boolean(raw.pinned),
    author: String(raw.author ?? 'Course team'),
    placeholder: Boolean(raw.placeholder),
    // Optional update kind (academic | deadline | activity | general); derived when absent (services/updates.js).
    type: raw.type || raw.update_type || null,
    // Optional deep link to Hub content (services/deep-links.js).
    link: raw.link_type ? {
      type: String(raw.link_type), id: String(raw.link_id ?? ''), subjectId: raw.link_subject_id || null,
      category: raw.link_category || null,
    } : null,
  };
}

export function matchesQuery(resource, subject, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [resource.title, subject?.name, subject?.code, categoryById(resource.category)?.single]
    .some(v => v && v.toLowerCase().includes(q));
}
