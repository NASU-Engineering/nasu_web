// The four products that share the NASU platform, and how a signed-in user
// moves between them. Pure functions (no DOM) so they can be unit-tested.
//
// Roles are permissions, not identities: a Section Editor, Content Reviewer or
// Admin with a student profile is still a student and keeps the Student Hub.
//
// UX ONLY — this decides which experience and navigation to SHOW. Every request
// is authorised by the backend (RLS / RPC role checks / Storage policies).

import { hasAnyRole } from './roles.js';
import { t } from '../i18n/index.js';

const exp = (id, icon, home, roles) => ({
  id, icon, home, roles,
  get label() { return t(`experience.${id}`); },
});

// Order = authority, lowest first. The last one a user holds is their default home.
export const EXPERIENCES = [
  exp('student', 'book',   '/dashboard', null),
  exp('editor',  'upload', '/editor',    ['section_editor', 'admin']),
  exp('review',  'inbox',  '/review',    ['content_manager', 'admin']),
  exp('admin',   'shield', '/admin',     ['admin']),
];

export const experienceById = id => EXPERIENCES.find(e => e.id === id) || null;

/** Experiences a user may open. Everyone with a hub profile keeps the Student Hub. */
export function experiencesFor(roles) {
  return EXPERIENCES.filter(e => !e.roles || hasAnyRole(roles || [], e.roles));
}

const PREFIX = { '/editor': 'editor', '/review': 'review', '/admin': 'admin' };

/** Which experience a route belongs to. Anything outside a staff prefix is the Student Hub. */
export function experienceForPath(path) {
  for (const [prefix, id] of Object.entries(PREFIX)) {
    if (path === prefix || path.startsWith(prefix + '/')) return id;
  }
  return 'student';
}

/**
 * Where to land after sign-in: the last experience used (if still authorised),
 * otherwise the most authoritative one the user holds.
 */
export function defaultHome(roles, { last = null } = {}) {
  const mine = experiencesFor(roles);
  const remembered = mine.find(e => e.id === last);
  return (remembered || mine[mine.length - 1]).home;
}

/* ---------- navigation, one set per experience (never mixed) ---------- */

const item = (key, href, icon, extra = {}) => ({
  key, href, icon, ...extra,
  get label() { return t(`nav.${key}`); },
});

// Student Hub: five grouped destinations (no competing tabs). Each groups related pages.
export const STUDENT_NAV = [
  item('home',     '/dashboard',     'home',   { match: ['/dashboard'] }),
  item('learn',    '/learn',         'book',   { match: ['/learn', '/subjects', '/resources', '/search', '/assignments'] }),
  item('updates',  '/announcements', 'bell',   { match: ['/announcements'] }),
  item('progress', '/progress',      'trophy', { match: ['/progress', '/quizzes', '/activities', '/leaderboard'] }),
  item('profile',  '/profile',       'user',   { match: ['/profile'] }),
];

export const WORKSPACE_NAV = {
  editor: [
    item('studioOverview', '/editor',         'grid'),
    item('upload',         '/editor/upload',  'upload'),
    item('myContent',      '/editor/uploads', 'list'),
  ],
  review: [
    item('reviewQueue',   '/review',         'inbox'),
    item('reviewHistory', '/review/history', 'history'),
  ],
  // Four destinations. Detailed analytics, the audit log and the role simulator
  // are contextual pages opened from Overview / Settings, not extra tabs.
  admin: [
    item('adminOverview', '/admin',          'grid',     { match: ['/admin', '/admin/analytics'] }),
    item('studentsTeam',  '/admin/people',   'users'),
    item('content',       '/admin/content',  'list'),
    item('settings',      '/admin/settings', 'settings', { match: ['/admin/settings', '/admin/audit', '/admin/simulator'] }),
  ],
};

// In-page section tabs. None today: every workspace's pages are reachable from
// its own navigation in at most two steps (filters and dialogs, not more tabs).
export const SUBNAV = {};

/** Navigation for one experience only. */
export function navFor(experienceId) {
  return experienceId === 'student' ? STUDENT_NAV : (WORKSPACE_NAV[experienceId] || []);
}

/** In-page section tabs for the destination `path` belongs to ([] if none). */
export function subnavFor(path, { simulating = false } = {}) {
  const key = Object.keys(SUBNAV).find(k => path === k || path.startsWith(k + '/'));
  return key ? SUBNAV[key].filter(i => !(simulating && i.hideInSimulation)) : [];
}

/** The nav item that best matches `path` (longest matching prefix), or null. */
export function activeHref(items, path) {
  const hits = items.flatMap(i => (i.match || [i.href])
    .filter(m => path === m || path.startsWith(m + '/'))
    .map(m => ({ href: i.href, len: m.length })));
  hits.sort((a, b) => b.len - a.len);
  return hits[0]?.href ?? null;
}

/** Old addresses → their new home (kept so bookmarks and shared links keep working). */
export const REDIRECTS = {
  '/editor/drafts': '/editor/uploads?status=draft',
  '/review/processed': '/review/history',
  '/admin/students': '/admin/people',
  '/admin/team': '/admin/people?view=staff',
  '/admin/people/staff': '/admin/people?view=staff',
  '/admin/applications': '/admin/people?view=applications',
  '/admin/review': '/admin/content?status=pending_review',
  '/admin/content/review': '/admin/content?status=pending_review',
  '/admin/content/quizzes': '/admin/content?type=quiz',
  '/admin/content/activities': '/admin/content?type=activity',
  '/admin/quizzes': '/admin/content?type=quiz',
  '/admin/activities': '/admin/content?type=activity',
  '/admin/insights': '/admin/analytics',
  '/admin/insights/engagement': '/admin/analytics',
  '/admin/insights/reviews': '/admin/analytics',
  '/admin/reviews': '/admin/analytics',
  '/admin/leaderboards': '/admin/analytics',
  '/admin/insights/audit': '/admin/audit',
  '/admin/settings/simulator': '/admin/simulator',
};
