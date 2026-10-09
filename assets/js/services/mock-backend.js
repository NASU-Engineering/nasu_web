// DEV ONLY — mock backend for frontend development (CONFIG.backend = 'mock').
//
// No real accounts and no real student data. "Continue with Microsoft" signs
// in a fake demo student immediately, without contacting Microsoft or Supabase.

import { CONFIG } from '../config.js';
import { SUBJECTS, subjectById } from '../data/catalog.js';
import { ApiError } from './errors.js';
import { studentIdFromEmail } from './identity.js';
import { normalizeResource, normalizeAnnouncement, matchesQuery } from './normalize.js';
import { publishedFor } from './mock-workspace.js';

const SESSION_KEY = 'nasu.mock.session';

// sessionStorage can throw (private mode, blocked storage) — fall back to memory.
const memory = new Map();
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return memory.get(k) ?? null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { memory.set(k, v); } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } memory.delete(k); },
};

const delay = (ms = 350) => new Promise(r => setTimeout(r, ms));
const sessionFor = email => ({ email, studentId: studentIdFromEmail(email, CONFIG.auth.emailDomain), mock: true });

/* ---------- auth (mock) ---------- */

export async function getSession() {
  return store.get(SESSION_KEY);
}

// MOCK: no Microsoft round-trip — pretends the provider redirected straight back.
export async function startSignIn({ redirectTo }) {
  await delay();
  const url = new URL(redirectTo);
  url.searchParams.set('code', 'mock');
  location.assign(url.href);
}

export async function completeSignIn() {
  await delay();
  const session = sessionFor(`demo.student@${CONFIG.auth.emailDomain}`);
  store.set(SESSION_KEY, session);
  return session;
}

export async function signOut() {
  store.del(SESSION_KEY);
}

// Used by the role simulator (api.sim) to sign a mock persona in and to put the
// previous mock session back afterwards. Never touches a real Supabase session.
export const mockSessionSnapshot = () => store.get(SESSION_KEY);
export function setMockSession(session) { store.set(SESSION_KEY, session); }
export function restoreMockSession(raw) {
  if (raw == null) store.del(SESSION_KEY);
  else store.set(SESSION_KEY, raw);
}

/* ---------- profile (mock) ---------- */

export async function getMyProfile() {
  await delay(200);
  const session = await getSession();
  if (!session) throw new ApiError('unauthenticated');
  return {
    fullName: session.fullName || 'Demo Student',
    studentId: session.studentId || '—',
    group: session.group || 'Group A (sample)',
    section: session.section || 'Section 1',
  };
}

/* ---------- subjects ---------- */

export async function listSubjects({ includeStudio = true } = {}) {
  const all = await visibleResources({ includeStudio });
  return SUBJECTS.map(s => ({ ...s, resourceCount: all.filter(r => r.subjectId === s.id).length }));
}

export async function getSubject(id) {
  const s = subjectById(id);
  if (!s) throw new ApiError('not_found', 'Subject not found.');
  return s;
}

/* ---------- resources ---------- */

const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();
const daysAhead = n => new Date(Date.now() + n * 864e5).toISOString();

// Placeholder items so every category has something to show. No real URLs.
function sampleResources() {
  const out = [];
  SUBJECTS.forEach((s, i) => {
    const base = i * 2;
    out.push(
      { id: `${s.id}-l1`, subjectId: s.id, category: 'lecture', title: 'Lecture 1 — Introduction', week: 1, addedAt: daysAgo(20 + base) },
      { id: `${s.id}-l2`, subjectId: s.id, category: 'lecture', title: 'Lecture 2', week: 2, addedAt: daysAgo(3 + base) },
      { id: `${s.id}-t1`, subjectId: s.id, category: 'tutorial', title: 'Tutorial 1 — Problem set walkthrough', week: 1, addedAt: daysAgo(18 + base) },
      { id: `${s.id}-b1`, subjectId: s.id, category: 'board', title: 'Board notes — Week 1', week: 1, addedAt: daysAgo(17 + base) },
      { id: `${s.id}-p1`, subjectId: s.id, category: 'pdf', title: 'Sheet 1', format: 'pdf', addedAt: daysAgo(15 + base) },
      { id: `${s.id}-a1`, subjectId: s.id, category: 'assignment', title: 'Assignment 1', addedAt: daysAgo(6 + base), dueAt: daysAhead(4 + i) },
    );
  });
  return out.map(r => ({ ...r, placeholder: true }));
}

let resourceCache = null;
async function allResources() {
  if (!resourceCache) {
    resourceCache = (async () => {
      let legacy = [];
      try {
        const res = await fetch(`${CONFIG.legacyResourcesUrl}?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) legacy = data;
        }
      } catch { /* demo mode: legacy file is optional */ }
      return [...legacy, ...sampleResources()]
        .map(normalizeResource)
        .filter(r => r && subjectById(r.subjectId));
    })();
  }
  return resourceCache;
}

// Content published through the mock Content Studio / Review Desk, limited to the
// signed-in mock student's group and section (imitating the backend rule).
async function studioResources() {
  const session = await getSession();
  const profile = { group: session?.group || 'Group A (sample)', section: session?.section || 'Section 1' };
  return publishedFor(profile).map(i => normalizeResource({
    id: i.id, subjectId: i.subject_id, category: i.content_type, title: i.title,
    week: i.week ?? undefined, addedAt: i.published_at, format: 'pdf', placeholder: true,
  })).filter(Boolean);
}

async function visibleResources({ includeStudio = true } = {}) {
  const base = await allResources();
  return includeStudio ? [...await studioResources(), ...base] : base;
}

const newestFirst = (a, b) => (b.addedAt || '').localeCompare(a.addedAt || '');

export async function listResources({ subjectId, limit, includeStudio = true } = {}) {
  await delay(200);
  let list = await visibleResources({ includeStudio });
  if (subjectId) list = list.filter(r => r.subjectId === subjectId);
  list = [...list].sort(newestFirst);
  return limit ? list.slice(0, limit) : list;
}

export async function searchResources({ query, subjectId, category, includeStudio = true }) {
  await delay(120);
  const list = await visibleResources({ includeStudio });
  return list
    .filter(r => !subjectId || r.subjectId === subjectId)
    .filter(r => !category || r.category === category)
    .filter(r => matchesQuery(r, subjectById(r.subjectId), query))
    .sort(newestFirst);
}

/* ---------- announcements ---------- */

function sampleAnnouncements() {
  return [
    { id: 'a1', pinned: true, title: 'Welcome to the Freshmen Hub', body: 'This is a placeholder announcement. Real announcements from the faculty will appear here once the hub is connected.', publishedAt: daysAgo(1), author: 'Prep-Year Office' },
    { id: 'a2', subjectId: 'math1', title: 'Tutorial room change (sample)', body: 'Sample text: this week’s tutorial moves to another hall. Check your group schedule.', publishedAt: daysAgo(2), author: 'Mathematics I team', link_type: 'resource', link_id: 'math1-t1', link_subject_id: 'math1', link_category: 'tutorial' },
    { id: 'a3', subjectId: 'draw', title: 'Bring your drawing tools (sample)', body: 'Sample text: the next board session needs set squares, compass and A3 sheets.', publishedAt: daysAgo(4), author: 'Drawing team', link_type: 'resource', link_id: 'draw-b1', link_subject_id: 'draw', link_category: 'board' },
    { id: 'a4', subjectId: 'chem', title: 'Lab safety briefing (sample)', body: 'Sample text: attendance at the safety briefing is required before the first lab.', publishedAt: daysAgo(7), author: 'Chemistry team' },
    { id: 'a5', subjectId: 'chem', title: 'Assignment 1 due this week (sample)', body: 'Sample text: submit before the deadline shown on the assignment.', publishedAt: daysAgo(0.1), author: 'Chemistry team', link_type: 'assignment', link_id: 'chem-a1', link_subject_id: 'chem' },
    { id: 'a6', title: 'Engineering workshop sign-ups (sample)', body: 'Sample text: a hands-on workshop for prep-year students. Places are limited.', publishedAt: daysAgo(3), author: 'Student activities', link_type: 'activity', link_id: 'workshop-1' },
    { id: 'a7', subjectId: 'stat', title: 'Week 2 practice quiz (sample)', body: 'Sample text: a short practice quiz on free-body diagrams.', publishedAt: daysAgo(5), author: 'Statics team', link_type: 'quiz', link_id: 'quiz-1' },
  ].map(a => normalizeAnnouncement({ ...a, placeholder: true }));
}

export async function listAnnouncements({ subjectId, limit } = {}) {
  await delay(200);
  let list = sampleAnnouncements()
    .filter(a => !subjectId || a.subjectId === subjectId)
    .sort((a, b) => (b.pinned - a.pinned) || (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  return limit ? list.slice(0, limit) : list;
}

/* ---------- staff workspaces (mock) ---------- */

export * from './mock-workspace.js';

/* ---------- engagement (mock) ---------- */

export * from './mock-engage.js';
export * from './mock-ops.js';
