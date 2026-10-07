// Maps raw backend rows for the staff workspaces into the shapes views use.
// Both backends return raw snake_case rows; api.js runs them through here, so
// a column rename on the backend is a one-line change in this file.
//
// Field names follow the PROPOSED contract in docs/ROLE_DASHBOARDS.md and must
// be confirmed by the backend owner.

import { normalizeRoles } from './roles.js';
import { STATUSES } from './content-workflow.js';
import { categoryById } from '../data/catalog.js';

const str = v => (v == null ? '' : String(v));
const strOrNull = v => (v == null || v === '' ? null : String(v));
const numOrNull = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function normalizeScope(raw) {
  if (!raw || typeof raw !== 'object' || !raw.subject_id) return null;
  return {
    id: strOrNull(raw.id),
    subjectId: String(raw.subject_id),
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

export function normalizeContentItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: str(raw.id),
    title: str(raw.title) || 'Untitled',
    description: str(raw.description),
    subjectId: str(raw.subject_id),
    contentType: categoryById(raw.content_type) ? raw.content_type : 'pdf',
    week: numOrNull(raw.week),
    group: strOrNull(raw.group_name),
    section: strOrNull(raw.section),
    status: STATUSES[raw.status] ? raw.status : 'draft',
    file: raw.file_name ? { name: str(raw.file_name), size: numOrNull(raw.file_size), mimeType: str(raw.file_mime_type) } : null,
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

export function normalizeStats(raw) {
  return Object.fromEntries(STAT_KEYS.map(k => [k, numOrNull(raw?.[k])]));
}

/** [{ name, sections: [..] }] — groups and their sections. */
export function normalizeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(g => g && g.group_name)
    .map(g => ({ name: String(g.group_name), sections: Array.isArray(g.sections) ? g.sections.map(String) : [] }));
}

/** Pages: { items, nextCursor } */
export function normalizePage(raw, fn) {
  const rows = Array.isArray(raw) ? raw : raw?.items;
  return {
    items: (Array.isArray(rows) ? rows : []).map(fn).filter(Boolean),
    nextCursor: Array.isArray(raw) ? null : (raw?.next_cursor ?? null),
  };
}
