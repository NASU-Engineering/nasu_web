// DEV ONLY — mock workspaces for frontend development (CONFIG.backend = 'mock').
// Re-exported by mock-backend.js. Never used when CONFIG.backend = 'supabase'.
//
// Fake people, fake submissions, no real files. It imitates the backend's
// checks (role + scope) so the UI's forbidden/error paths can be exercised,
// but it is NOT a security model — the real one lives in Supabase RLS.

import { ApiError } from './errors.js';
import { normalizeRoles, inScope, ASSIGNABLE_ROLES } from './roles.js';
import { normalizeScope } from './normalize-workspace.js';
import { canSubmit, canDecide, canPublish, isEditable, validateDecision, storageObjectPath } from './content-workflow.js';

const SESSION_KEY = 'nasu.mock.session';
const ROLES_KEY = 'nasu.mock.roles';
const DB_KEY = 'nasu.mock.workspace.v1';

const memory = new Map();
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return memory.get(k) ?? null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { memory.set(k, v); } },
};

const delay = (ms = 250) => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();
const ME = 'mock-user-0';

/* ---------- demo roles (dev only) ---------- */

const DEFAULT_ROLES = ['student', 'section_editor', 'content_manager', 'admin'];

export function getDemoRoles() {
  return normalizeRoles(store.get(ROLES_KEY) ?? DEFAULT_ROLES);
}
export async function setDemoRoles(roles) {
  store.set(ROLES_KEY, normalizeRoles(['student', ...roles]));
}

/* ---------- fake database ---------- */

const GROUPS = [
  { group_name: 'Group A (sample)', sections: ['Section 1', 'Section 2', 'Section 3'] },
  { group_name: 'Group B (sample)', sections: ['Section 4', 'Section 5', 'Section 6'] },
];
const GA = GROUPS[0].group_name;
const GB = GROUPS[1].group_name;

function seed() {
  const people = [
    { user_id: ME, full_name: 'Demo Student', student_id: 'demo.student', group_name: GA, section: 'Section 1' },
    ...Array.from({ length: 9 }, (_, i) => ({
      user_id: `mock-user-${i + 1}`,
      full_name: `Sample Student ${String(i + 1).padStart(2, '0')}`,
      student_id: `sample-${String(i + 1).padStart(4, '0')}`,
      group_name: i % 2 ? GB : GA,
      section: `Section ${(i % 6) + 1}`,
    })),
  ];
  const roles = { 'mock-user-2': ['section_editor'], 'mock-user-3': ['content_manager'], 'mock-user-5': ['section_editor'] };
  const scopes = {
    [ME]: [{ id: 'sc1', subject_id: 'math1', group_name: GA, section: 'Section 1' }, { id: 'sc2', subject_id: 'stat', group_name: GA, section: null }],
    'mock-user-2': [{ id: 'sc3', subject_id: 'chem', group_name: null, section: null }],
    'mock-user-5': [{ id: 'sc4', subject_id: 'draw', group_name: GB, section: 'Section 4' }],
  };
  const who = id => { const p = people.find(x => x.user_id === id); return { id, full_name: p.full_name, student_id: p.student_id }; };
  const reviewer = who('mock-user-3');
  const file = (name, size) => ({ storage_path: `mock/${name}`, file_name: name, file_size: size, file_mime_type: 'application/pdf' });

  const items = [
    { id: 'c1', title: 'Lecture 3 — Limits (draft)', description: 'Slides for week 3.', subject_id: 'math1', content_type: 'lecture', week: 3, group_name: GA, section: 'Section 1', status: 'draft', ...file('math1-lecture-3.pdf', 2_400_000), submitter: who(ME), created_at: daysAgo(1), updated_at: daysAgo(1) },
    { id: 'c2', title: 'Tutorial 2 — Free-body diagrams', description: '', subject_id: 'stat', content_type: 'tutorial', week: 2, group_name: GA, section: 'Section 2', status: 'pending_review', ...file('statics-tut-2.pdf', 880_000), submitter: who(ME), created_at: daysAgo(3), submitted_at: daysAgo(2) },
    { id: 'c3', title: 'Sheet 1 solutions', description: 'Model answers.', subject_id: 'math1', content_type: 'pdf', week: 1, group_name: GA, section: 'Section 1', status: 'rejected', ...file('sheet1-solutions.pdf', 1_200_000), submitter: who(ME), reviewer, review_note: 'Question 4 is missing and pages 3–4 are scanned upside down. Please re-upload the full sheet.', created_at: daysAgo(6), submitted_at: daysAgo(5), reviewed_at: daysAgo(4) },
    { id: 'c4', title: 'Board notes — Week 2', description: '', subject_id: 'stat', content_type: 'board', week: 2, group_name: GA, section: null, status: 'approved', ...file('statics-board-w2.pdf', 3_100_000), submitter: who(ME), reviewer, review_note: '', created_at: daysAgo(8), submitted_at: daysAgo(7), reviewed_at: daysAgo(6) },
    { id: 'c5', title: 'Lab safety handout', description: 'Read before the first lab.', subject_id: 'chem', content_type: 'pdf', week: 1, group_name: null, section: null, status: 'published', ...file('chem-safety.pdf', 640_000), submitter: who('mock-user-2'), reviewer, created_at: daysAgo(12), submitted_at: daysAgo(11), reviewed_at: daysAgo(10), published_at: daysAgo(10) },
    { id: 'c6', title: 'Assignment 2 — Stoichiometry', description: 'Due end of week 4.', subject_id: 'chem', content_type: 'assignment', week: 3, group_name: GB, section: 'Section 5', status: 'pending_review', ...file('chem-assignment-2.pdf', 410_000), submitter: who('mock-user-2'), created_at: daysAgo(2), submitted_at: daysAgo(1) },
    { id: 'c7', title: 'Projection exercises — Board 3', description: '', subject_id: 'draw', content_type: 'board', week: 3, group_name: GB, section: 'Section 4', status: 'pending_review', ...file('draw-board-3.pdf', 5_800_000), submitter: who('mock-user-5'), created_at: daysAgo(1), submitted_at: daysAgo(0.2) },
  ];
  const audit = [
    { id: 'l1', actor: reviewer, action: 'content.rejected', entity_type: 'content_item', entity_id: 'c3', created_at: daysAgo(4), metadata: { reason: items[2].review_note } },
    { id: 'l2', actor: reviewer, action: 'content.approved', entity_type: 'content_item', entity_id: 'c4', created_at: daysAgo(6), metadata: {} },
    { id: 'l3', actor: reviewer, action: 'content.published', entity_type: 'content_item', entity_id: 'c5', created_at: daysAgo(10), metadata: {} },
    { id: 'l4', actor: who(ME), action: 'role.granted', entity_type: 'user', entity_id: 'mock-user-3', created_at: daysAgo(14), metadata: { role: 'content_manager' } },
  ];
  return { people, roles, scopes, items, audit, seq: 100 };
}

function db() {
  let d = store.get(DB_KEY);
  if (!d) { d = seed(); store.set(DB_KEY, d); }
  return d;
}
const save = d => store.set(DB_KEY, d);

/* ---------- imitation of server-side checks ---------- */

function caller() {
  if (!store.get(SESSION_KEY)) throw new ApiError('unauthenticated');
  return { id: ME, roles: getDemoRoles() };
}
function requireRole(...roles) {
  const me = caller();
  if (!roles.some(r => me.roles.includes(r))) throw new ApiError('forbidden', `mock: needs ${roles.join(' or ')}`);
  return me;
}
const myScopes = d => (d.scopes[ME] || []).map(normalizeScope);
const person = (d, id) => { const p = d.people.find(x => x.user_id === id); return p && { id, full_name: p.full_name, student_id: p.student_id }; };
function log(d, action, entityType, entityId, metadata = {}) {
  d.audit.unshift({ id: `l${++d.seq}`, actor: person(d, ME), action, entity_type: entityType, entity_id: entityId, created_at: now(), metadata });
}
function page(list, { cursor, limit = 20 } = {}) {
  const start = Number(cursor) || 0;
  const items = list.slice(start, start + limit);
  return { items, next_cursor: start + limit < list.length ? String(start + limit) : null };
}
const newest = key => (a, b) => (b[key] || b.created_at || '').localeCompare(a[key] || a.created_at || '');
const memberRow = (d, p) => ({ ...p, roles: ['student', ...(p.user_id === ME ? getDemoRoles() : d.roles[p.user_id] || [])], scopes: d.scopes[p.user_id] || [] });

/* ---------- access ---------- */

export async function getMyAccess() {
  await delay(150);
  const me = caller();
  const d = db();
  return { roles: me.roles, scopes: me.roles.includes('section_editor') ? d.scopes[ME] || [] : [] };
}

export async function listGroups() {
  await delay(80);
  return GROUPS;
}

/* ---------- editor ---------- */

export async function listMyContent({ status } = {}) {
  await delay();
  requireRole('section_editor', 'admin');
  return db().items.filter(i => i.submitter?.id === ME && (!status || i.status === status)).sort(newest('updated_at'));
}

export async function getContentItem(id) {
  await delay(150);
  const me = caller();
  const item = db().items.find(i => i.id === id);
  const staff = me.roles.includes('content_manager') || me.roles.includes('admin');
  if (!item || (!staff && item.submitter?.id !== ME)) throw new ApiError('not_found');
  return item;
}

// Same shape as the real flow: save draft → "upload" → save with storage path.
export async function saveContentDraft({ id, values, file, onProgress }) {
  await delay(400);
  const me = requireRole('section_editor', 'admin');
  const d = db();
  const target = { subjectId: values.subjectId, group: values.group ?? null, section: values.section ?? null };
  // Admins may upload anywhere; editors only inside their scope.
  if (!me.roles.includes('admin') && !inScope(myScopes(d), target)) throw new ApiError('forbidden', 'mock: outside editor scope');
  let stored = null;
  if (file) {
    // No bytes are stored in mock mode — only the file's name and size.
    for (let p = 0; p < 1; p += 0.25) { onProgress?.(p); await delay(100); }
    onProgress?.(1);
    stored = { file_name: file.name, file_size: file.size, file_mime_type: file.type || '' };
  }
  const fields = {
    title: values.title.trim(), description: (values.description || '').trim(), subject_id: values.subjectId,
    content_type: values.contentType, week: values.week ? Number(values.week) : null,
    group_name: target.group, section: target.section, updated_at: now(),
    ...(stored || {}),
  };
  let item;
  if (id) {
    item = d.items.find(i => i.id === id && i.submitter?.id === ME);
    if (!item) throw new ApiError('not_found');
    if (!isEditable(item.status)) throw new ApiError('conflict', 'mock: not editable in this status');
    Object.assign(item, fields, { status: 'draft' });
  } else {
    item = { id: `c${++d.seq}`, status: 'draft', submitter: person(d, ME), created_at: now(), ...fields };
    d.items.unshift(item);
  }
  if (stored) item.storage_path = storageObjectPath(values.subjectId, item.id, file.name); // <subject>/<item id>/<unique name>
  log(d, id ? 'content.updated' : 'content.created', 'content_item', item.id, { title: item.title });
  save(d);
  return item;
}

export async function submitContentForReview(id) {
  await delay(300);
  requireRole('section_editor', 'admin');
  const d = db();
  const item = d.items.find(i => i.id === id && i.submitter?.id === ME);
  if (!item) throw new ApiError('not_found');
  if (!canSubmit(item.status)) throw new ApiError('conflict');
  if (!item.file_name) throw new ApiError('invalid', 'mock: file required');
  Object.assign(item, { status: 'pending_review', submitted_at: now(), updated_at: now() });
  log(d, 'content.submitted', 'content_item', id, { title: item.title });
  save(d);
  return item;
}

/* ---------- review ---------- */

export async function listReviewQueue({ status = 'pending_review', cursor, limit } = {}) {
  await delay();
  requireRole('content_manager', 'admin');
  const processed = ['approved', 'rejected', 'published'];
  const list = db().items
    .filter(i => (status === 'processed' ? processed.includes(i.status) : i.status === status))
    .sort(status === 'processed' ? newest('reviewed_at') : (a, b) => (a.submitted_at || '').localeCompare(b.submitted_at || ''));
  return page(list, { cursor, limit });
}

export async function getContentFileUrl() {
  await delay(150);
  requireRole('content_manager', 'admin', 'section_editor');
  throw new ApiError('preview_unavailable', 'mock: no real files');
}

export async function decideContent(id, { decision, note }) {
  await delay(400);
  requireRole('content_manager', 'admin');
  const check = validateDecision(decision, note);
  if (!check.ok) throw new ApiError('invalid', check.error);
  const d = db();
  const item = d.items.find(i => i.id === id);
  if (!item) throw new ApiError('not_found');
  if (!canDecide(item.status)) throw new ApiError('conflict');
  Object.assign(item, { status: decision === 'approve' ? 'approved' : 'rejected', review_note: (note || '').trim(), reviewer: person(d, ME), reviewed_at: now(), updated_at: now() });
  log(d, decision === 'approve' ? 'content.approved' : 'content.rejected', 'content_item', id, note ? { reason: note.trim() } : {});
  save(d);
  return item;
}

export async function publishContent(id) {
  await delay(300);
  requireRole('content_manager', 'admin');
  const d = db();
  const item = d.items.find(i => i.id === id);
  if (!item) throw new ApiError('not_found');
  if (!canPublish(item.status)) throw new ApiError('conflict');
  Object.assign(item, { status: 'published', published_at: now(), updated_at: now() });
  log(d, 'content.published', 'content_item', id, { title: item.title });
  save(d);
  return item;
}

/* ---------- admin ---------- */

export async function getAdminStats() {
  await delay();
  requireRole('admin');
  const d = db();
  const members = d.people.map(p => memberRow(d, p));
  return {
    total_students: members.length,
    section_editors: members.filter(m => m.roles.includes('section_editor')).length,
    content_managers: members.filter(m => m.roles.includes('content_manager')).length,
    pending_reviews: d.items.filter(i => i.status === 'pending_review').length,
    published_resources: d.items.filter(i => i.status === 'published').length,
    quizzes: null,     // module not built
    activities: null,  // module not built
  };
}

export async function listAllContent({ status, subjectId, query, cursor } = {}) {
  await delay();
  requireRole('admin');
  const q = (query || '').toLowerCase();
  const list = db().items
    .filter(i => (!status || i.status === status) && (!subjectId || i.subject_id === subjectId))
    .filter(i => !q || i.title.toLowerCase().includes(q) || i.submitter?.full_name.toLowerCase().includes(q))
    .sort(newest('updated_at'));
  return page(list, { cursor });
}

export async function searchMembers({ query, role, cursor } = {}) {
  await delay();
  requireRole('admin');
  const d = db();
  const q = (query || '').toLowerCase();
  const list = d.people.map(p => memberRow(d, p))
    .filter(m => !role || m.roles.includes(role))
    .filter(m => !q || m.full_name.toLowerCase().includes(q) || m.student_id.toLowerCase().includes(q));
  return page(list, { cursor });
}

function editMember(userId, fn) {
  requireRole('admin');
  const d = db();
  const p = d.people.find(x => x.user_id === userId);
  if (!p) throw new ApiError('not_found');
  if (userId === ME) throw new ApiError('forbidden', 'mock: use the demo role switcher for yourself');
  fn(d);
  save(d);
  return memberRow(d, p);
}

export async function grantRole(userId, role) {
  await delay(300);
  if (!ASSIGNABLE_ROLES.includes(role)) throw new ApiError('invalid');
  return editMember(userId, d => {
    const set = new Set(d.roles[userId] || []);
    set.add(role);
    d.roles[userId] = [...set];
    log(d, 'role.granted', 'user', userId, { role });
  });
}

export async function revokeRole(userId, role) {
  await delay(300);
  if (!ASSIGNABLE_ROLES.includes(role)) throw new ApiError('invalid');
  return editMember(userId, d => {
    d.roles[userId] = (d.roles[userId] || []).filter(r => r !== role);
    if (role === 'section_editor') delete d.scopes[userId];
    log(d, 'role.revoked', 'user', userId, { role });
  });
}

export async function setEditorScopes(userId, scopes) {
  await delay(300);
  return editMember(userId, d => {
    if (!(d.roles[userId] || []).includes('section_editor')) throw new ApiError('invalid', 'mock: not an editor');
    d.scopes[userId] = scopes.map((s, i) => ({ id: `sc${++d.seq}-${i}`, subject_id: s.subjectId, group_name: s.group ?? null, section: s.section ?? null }));
    log(d, 'scope.updated', 'user', userId, { scopes: d.scopes[userId].length });
  });
}

export async function listAuditLog({ cursor, action, limit } = {}) {
  await delay();
  requireRole('admin');
  const list = db().audit.filter(e => !action || e.action.startsWith(action));
  return page(list, { cursor, limit });
}
