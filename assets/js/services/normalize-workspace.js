// Maps raw backend rows for the staff workspaces into the shapes views use.
// Both backends return raw snake_case rows; api.js runs them through here, so
// a column rename on the backend is a one-line change in this file.
//
// Backend naming (Phase 1): raw content rows use subject_code / week_no /
// mime_type; some RPCs also expose aliases subject_id / week. Both are accepted
// here so views never depend on raw DB names. Subjects arrive as course codes
// ('BSC131') and are translated to frontend ids ('stat') via catalog.js.

import { normalizeRoles } from './roles.js';
import { STATUSES } from './content-workflow.js';
import { categoryById, subjectIdFrom } from '../data/catalog.js';
import { safeUrl } from './normalize.js';

const str = v => (v == null ? '' : String(v));
const strOrNull = v => (v == null || v === '' ? null : String(v));
const numOrNull = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function normalizeScope(raw) {
  const subject = raw?.subject_id ?? raw?.subject_code;
  if (!raw || typeof raw !== 'object' || !subject) return null;
  return {
    id: strOrNull(raw.id),
    subjectId: subjectIdFrom(subject),
    group: strOrNull(raw.group_name),
    section: strOrNull(raw.section),
  };
}

const scopes = list => (Array.isArray(list) ? list.map(normalizeScope).filter(Boolean) : []);

/** { roles, scopes } for the signed-in user. `available` = the backend actually answered. */
export function normalizeAccess(raw) {
  return {
    roles: normalizeRoles(raw?.roles),
    scopes: scopes(raw?.scopes),
    available: true,
  };
}

function person(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return { id: strOrNull(raw.id ?? raw.user_id), fullName: str(raw.full_name), studentId: str(raw.student_id) };
}

// Backend status 'pending' is the UI's 'pending_review'.
const STATUS_IN = { pending: 'pending_review' };

export function normalizeContentItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const status = STATUS_IN[raw.status] || raw.status;
  const hasFile = Boolean(raw.storage_path || raw.file_name);
  return {
    id: str(raw.id),
    title: str(raw.title) || 'Untitled',
    description: str(raw.description),
    subjectId: subjectIdFrom(raw.subject_id ?? raw.subject_code),
    contentType: categoryById(raw.content_type) ? raw.content_type : 'pdf',
    week: numOrNull(raw.week ?? raw.week_no),
    group: strOrNull(raw.group_name),
    section: strOrNull(raw.section),
    status: STATUSES[status] ? status : 'draft',
    file: hasFile ? {
      name: str(raw.file_name) || str(raw.storage_path).split('/').pop(),
      size: numOrNull(raw.file_size),
      mimeType: str(raw.mime_type ?? raw.file_mime_type),
      storagePath: strOrNull(raw.storage_path),
    } : null,
    externalUrl: safeUrl(raw.external_url),
    submitter: person(raw.submitter),
    reviewer: person(raw.reviewer),
    reviewNote: str(raw.review_note),
    createdAt: raw.created_at || null,
    updatedAt: raw.updated_at || null,
    submittedAt: raw.submitted_at || null,
    reviewedAt: raw.reviewed_at || null,
    publishedAt: raw.published_at || null,
  };
}

export function normalizeAuditEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let metadata = raw.metadata ?? null;
  if (metadata != null && typeof metadata !== 'object') metadata = { value: metadata };
  return {
    id: str(raw.id),
    actor: person(raw.actor),
    action: str(raw.action),
    entityType: str(raw.entity_type),
    entityId: strOrNull(raw.entity_id),
    createdAt: raw.created_at || null,
    metadata,
  };
}

/** A student/staff member as admins see them in Team & Roles / Students. */
export function normalizeMember(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    userId: str(raw.user_id),
    fullName: str(raw.full_name),
    studentId: str(raw.student_id),
    group: strOrNull(raw.group_name),
    section: strOrNull(raw.section),
    roles: normalizeRoles(raw.roles),
    scopes: scopes(raw.scopes),
  };
}

// Unknown / not-yet-built metrics stay null and render as "—".
export const STAT_KEYS = ['total_students', 'section_editors', 'content_managers', 'pending_reviews', 'published_resources', 'quizzes', 'activities'];

// Backend key → frontend key where they differ (get_admin_stats returns `editors`).
const STAT_ALIASES = { section_editors: 'editors' };

export function normalizeStats(raw) {
  return Object.fromEntries(STAT_KEYS.map(k => [k, numOrNull(raw?.[STAT_ALIASES[k]] ?? raw?.[k])]));
}

/**
 * [{ name, sections: [..] }] — groups and their sections. Accepts either one row
 * per group ({ group_name, sections: [] }) or one row per section ({ group_name, section }).
 */
export function normalizeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const byName = new Map();
  for (const g of raw) {
    if (!g || !g.group_name) continue;
    const name = String(g.group_name);
    if (!byName.has(name)) byName.set(name, []);
    const list = byName.get(name);
    const add = s => { if (s != null && s !== '' && !list.includes(String(s))) list.push(String(s)); };
    if (Array.isArray(g.sections)) g.sections.forEach(add);
    else add(g.section);
  }
  return [...byName].map(([name, sections]) => ({ name, sections }));
}

/** Pages: { items, nextCursor } */
export function normalizePage(raw, fn) {
  const rows = Array.isArray(raw) ? raw : raw?.items;
  return {
    items: (Array.isArray(rows) ? rows : []).map(fn).filter(Boolean),
    nextCursor: Array.isArray(raw) ? null : (raw?.next_cursor ?? null),
  };
}
