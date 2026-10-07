// Content submission workflow as the UI understands it. Pure functions.
//
//   Draft → Pending review → Approved / Rejected → Published
//
// UX ONLY: which buttons to offer and what to pre-validate. The backend
// decides which transitions are actually allowed for the caller.

import { CATEGORIES } from '../data/catalog.js';

export const STATUSES = {
  draft:          { id: 'draft',          label: 'Draft',          tone: 'neutral' },
  pending_review: { id: 'pending_review', label: 'Pending review', tone: 'pending' },
  approved:       { id: 'approved',       label: 'Approved',       tone: 'ok' },
  rejected:       { id: 'rejected',       label: 'Rejected',       tone: 'bad' },
  published:      { id: 'published',      label: 'Published',      tone: 'live' },
  archived:       { id: 'archived',       label: 'Archived',       tone: 'neutral' },
};
// Note: the backend calls 'pending_review' simply 'pending' (mapped in the Supabase adapter).

export const STATUS_IDS = Object.keys(STATUSES);
export const statusMeta = id => STATUSES[id] || { id, label: id || 'Unknown', tone: 'neutral' };

// Content types are the existing resource categories.
export const CONTENT_TYPES = CATEGORIES;

// Statuses a reviewer has already acted on ("processed").
export const PROCESSED_STATUSES = ['approved', 'rejected', 'published'];

/** Editor may still change the item (draft, or a rejected item being fixed). */
export const isEditable = status => status === 'draft' || status === 'rejected';
/** Editor may send it for review. */
export const canSubmit = status => status === 'draft' || status === 'rejected';
/** Reviewer may approve / reject. */
export const canDecide = status => status === 'pending_review';
/** Reviewer/admin may publish. */
export const canPublish = status => status === 'approved';

export const MIN_REASON_LENGTH = 5;
export const MAX_WEEK = 16;

const blank = v => v == null || String(v).trim() === '';

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? '.' + m[1].toLowerCase() : '';
}

/**
 * Pre-validates the upload form. Returns { ok, errors: { field: message } }.
 * `values`: { subjectId, contentType, week, group, section, title, description, file, existingFile }
 * `rules`:  { maxBytes, accept: ['.pdf', …], requireFile }
 * The server re-validates everything; this only saves a round-trip.
 */
export function validateSubmission(values, { maxBytes = Infinity, accept = [], requireFile = false } = {}) {
  const errors = {};
  if (blank(values.subjectId)) errors.subjectId = 'Choose a subject.';
  if (!CONTENT_TYPES.some(c => c.id === values.contentType)) errors.contentType = 'Choose a content type.';
  if (!blank(values.week)) {
    const w = Number(values.week);
    if (!Number.isInteger(w) || w < 1 || w > MAX_WEEK) errors.week = `Week must be a whole number from 1 to ${MAX_WEEK}.`;
  }
  const title = String(values.title ?? '').trim();
  if (!title) errors.title = 'Add a title.';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (String(values.description ?? '').length > 2000) errors.description = 'Keep the description under 2000 characters.';

  const file = values.file;
  if (file) {
    if (accept.length && !accept.includes(extOf(file.name))) errors.file = `This file type isn’t accepted. Use ${accept.join(', ')}.`;
    else if (file.size > maxBytes) errors.file = `This file is too large (max ${Math.round(maxBytes / 1048576)} MB).`;
    else if (file.size === 0) errors.file = 'This file is empty.';
  } else if (requireFile && !values.existingFile) {
    errors.file = 'Attach a file before submitting for review.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Reviewer decision pre-check: a rejection always needs a reason the editor can act on. */
export function validateDecision(decision, note) {
  const text = String(note ?? '').trim();
  if (decision === 'reject' && text.length < MIN_REASON_LENGTH) {
    return { ok: false, error: `Tell the editor what to fix (at least ${MIN_REASON_LENGTH} characters).` };
  }
  if (text.length > 1000) return { ok: false, error: 'Keep the note under 1000 characters.' };
  return { ok: true, error: '' };
}

export function countByStatus(items) {
  const out = Object.fromEntries(STATUS_IDS.map(s => [s, 0]));
  for (const it of items || []) if (it.status in out) out[it.status]++;
  return out;
}

/** File name reduced to [a-z0-9._-], extension kept, at most 80 characters. */
export function safeFileName(name) {
  const raw = String(name || 'file').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const ext = extOf(raw).replace(/[^a-z0-9.]/g, '').slice(0, 10);
  const base = raw.slice(0, raw.length - extOf(raw).length).toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/-{2,}/g, '-') || 'file';
  return base.slice(0, 80 - ext.length) + ext;
}

const randomToken = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
};

/**
 * Storage object path for an upload: <subject_id>/<content_item_id>/<unique-safe-filename>.
 * Unique every time, so a replacement never overwrites an existing object.
 */
export function storageObjectPath(subjectId, itemId, fileName, token = randomToken()) {
  const seg = v => String(v).replace(/[^A-Za-z0-9_-]/g, '');
  if (!seg(subjectId) || !seg(itemId)) throw new Error('storageObjectPath: subject and item id are required');
  return `${seg(subjectId)}/${seg(itemId)}/${Date.now().toString(36)}-${seg(token)}-${safeFileName(fileName)}`;
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
