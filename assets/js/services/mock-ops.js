// DEV/PREVIEW ONLY — mock admin operations: applications review, activity and
// presence metrics, recent activity, data-integrity summary.
// Re-exported by mock-backend.js. Production uses supabase-ops.js, whose RPCs
// are proposed in supabase/prepared/ (not applied). All data here is fictional.

import { ApiError } from './errors.js';

const SESSION_KEY = 'nasu.mock.session';
const ROLES_KEY = 'nasu.mock.roles';
const KEY = 'nasu.mock.ops.v1';
const memory = new Map();
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return memory.get(k) ?? null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { memory.set(k, v); } },
};
const delay = (ms = 200) => new Promise(r => setTimeout(r, ms));
const ago = mins => new Date(Date.now() - mins * 6e4).toISOString();

function requireAdmin() {
  if (!store.get(SESSION_KEY)) throw new ApiError('unauthenticated');
  const roles = store.get(ROLES_KEY) ?? ['student', 'section_editor', 'content_manager', 'admin'];
  if (!roles.includes('admin')) throw new ApiError('forbidden', 'mock: needs admin');
}

// Fictional applications. Codes are invented (no real student codes).
function seed() {
  const app = (n, name, status, extra = {}) => ({
    id: `app-${n}`, student_code: `S-${String(1000 + n)}`, full_name: name, status,
    submitted_at: ago(60 * 24 * (20 - n) + n * 7), source: 'google_form', source_row: n + 1,
    roster_match: true, duplicate_count: 0, review_note: null, reviewed_at: null, ...extra,
  });
  return {
    applications: [
      app(1, 'Nadine Fouad', 'pending'),
      app(2, 'Adel Khaled', 'pending'),
      app(3, 'Yara Sameh', 'pending', { duplicate_count: 1 }),
      app(4, 'Tamer Ashraf', 'needs_review', { roster_match: false, review_note: 'Student code not in the university roster' }),
      app(5, 'Laila Hossam', 'needs_review', { roster_match: false, review_note: 'Student code not in the university roster' }),
      app(6, 'Hana Mostafa', 'approved', { reviewed_at: ago(60 * 30) }),
      app(7, 'Karim Adel', 'approved', { reviewed_at: ago(60 * 50) }),
      app(8, 'Mohamed Ehab', 'approved', { reviewed_at: ago(60 * 70) }),
      app(9, 'Sara Nabil', 'rejected', { reviewed_at: ago(60 * 90), review_note: 'Not a prep-year student' }),
      app(10, 'Ali Samir', 'pending', { source: 'manual', source_row: null }),
    ],
    log: [],
  };
}
const db = () => { let d = store.get(KEY); if (!d) { d = seed(); store.set(KEY, d); } return d; };
const save = d => store.set(KEY, d);

/* ---------- presence & activity ---------- */

/** Heartbeat from an open, visible tab. The real RPC dedupes per user (many tabs = one user). */
export async function recordPresence() {
  if (!store.get(SESSION_KEY)) throw new ApiError('unauthenticated');
  return { ok: true };
}

export async function getActivitySummary() {
  await delay();
  requireAdmin();
  return { online_now: 7, active_24h: 41, sign_ins_24h: 38, online_window_seconds: 120, generated_at: new Date().toISOString() };
}

export async function listRecentActivity({ limit = 8 } = {}) {
  await delay();
  requireAdmin();
  const d = db();
  const base = [
    { at: ago(3), type: 'auth.sign_in', actor: 'Sample Student 04', entity: null },
    { at: ago(9), type: 'content.submitted', actor: 'Sample Student 02', entity: 'Sheet 3 — limits' },
    { at: ago(22), type: 'quiz.completed', actor: 'Sample Student 07', entity: 'Limits — warm-up' },
    { at: ago(41), type: 'content.approved', actor: 'Demo Student', entity: 'Lecture 4 notes' },
    { at: ago(65), type: 'role.granted', actor: 'Demo Student', entity: 'Sample Student 05' },
    { at: ago(120), type: 'activity.completed', actor: 'Sample Student 01', entity: 'Lab safety talk' },
    { at: ago(180), type: 'content.published', actor: 'Demo Student', entity: 'Tutorial 2 solutions' },
  ];
  return { items: [...d.log, ...base].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit) };
}

/* ---------- applications ---------- */

const counts = list => ({
  pending: list.filter(a => a.status === 'pending').length,
  needs_review: list.filter(a => a.status === 'needs_review').length,
  approved: list.filter(a => a.status === 'approved').length,
  rejected: list.filter(a => a.status === 'rejected').length,
});

export async function getApplicationSummary() {
  await delay();
  requireAdmin();
  return counts(db().applications);
}

export async function listApplications({ status = '', query = '' } = {}) {
  await delay();
  requireAdmin();
  const q = query.trim().toLowerCase();
  const items = db().applications
    .filter(a => !status || a.status === status)
    .filter(a => !q || a.full_name.toLowerCase().includes(q) || a.student_code.toLowerCase().includes(q))
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return { items, next_cursor: null };
}

/**
 * decision: 'approve' | 'reject' | 'needs_review'. Approval is always an explicit
 * admin action; an application whose code isn't in the roster can't be approved here.
 */
export async function reviewApplication(id, { decision, note = '' }) {
  await delay(300);
  requireAdmin();
  const d = db();
  const a = d.applications.find(x => x.id === id);
  if (!a) throw new ApiError('not_found');
  if (!['approve', 'reject', 'needs_review'].includes(decision)) throw new ApiError('invalid');
  if (a.status === 'approved' || a.status === 'rejected') throw new ApiError('conflict', 'mock: already decided');
  if (decision === 'approve' && !a.roster_match) throw new ApiError('conflict', 'mock: code not in roster');
  if (decision !== 'approve' && note.trim().length < 3) throw new ApiError('invalid', 'mock: note required');
  a.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_review';
  a.review_note = note || a.review_note;
  if (decision !== 'needs_review') a.reviewed_at = new Date().toISOString();
  d.log.unshift({ at: new Date().toISOString(), type: `application.${a.status}`, actor: 'Demo Student', entity: a.full_name });
  save(d);
  return a;
}

/* ---------- data integrity ---------- */

export async function getDataIntegritySummary() {
  await delay();
  requireAdmin();
  const d = db();
  return {
    approved_missing_phone: 2,
    applications_not_in_roster: d.applications.filter(a => !a.roster_match && a.status !== 'rejected').length,
    duplicate_submissions: d.applications.filter(a => a.duplicate_count > 0).length,
    intake_errors: 0,
  };
}

export function resetMockOps() {
  try { sessionStorage.removeItem(KEY); } catch { /* memory only */ }
  memory.delete(KEY);
}
