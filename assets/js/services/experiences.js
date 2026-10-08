// The four products that share the NASU platform, and how a signed-in user
// moves between them. Pure functions (no DOM) so they can be unit-tested.
//
// UX ONLY — this decides which experience and navigation to SHOW. Every request
// is authorised by the backend (RLS / RPC role checks / Storage policies).

import { hasAnyRole } from './roles.js';

// Order = authority, lowest first. The last one a user holds is their default home.
export const EXPERIENCES = [
  { id: 'student', label: 'Student Hub',          short: 'Student',  icon: 'book',   home: '/dashboard', roles: null },
  { id: 'editor',  label: 'Content Studio',       short: 'Studio',   icon: 'upload', home: '/editor',    roles: ['section_editor', 'admin'] },
  { id: 'review',  label: 'Review Desk',          short: 'Review',   icon: 'inbox',  home: '/review',    roles: ['content_manager', 'admin'] },
  { id: 'admin',   label: 'Admin Control Center', short: 'Admin',    icon: 'shield', home: '/admin',     roles: ['admin'] },
];

export const experienceById = id => EXPERIENCES.find(e => e.id === id) || null;

/** Experiences a user may open. Everyone with a hub profile has the Student Hub. */
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

export const STUDENT_NAV = [
  { href: '/dashboard',     label: 'Home',     icon: 'home',   match: ['/dashboard'] },
  { href: '/subjects',      label: 'Subjects', icon: 'book',   match: ['/subjects', '/assignments'] },
  { href: '/resources',     label: 'Search',   icon: 'search', match: ['/resources', '/search'] },
  { href: '/announcements', label: 'Updates',  icon: 'bell',   match: ['/announcements'] },
  { href: '/profile',       label: 'Profile',  icon: 'user',   match: ['/profile'] },
];

export const WORKSPACE_NAV = {
  editor: [
    { href: '/editor',         label: 'Overview',   icon: 'grid' },
    { href: '/editor/upload',  label: 'Upload',     icon: 'upload' },
    { href: '/editor/uploads', label: 'My content', icon: 'list' },
    { href: '/editor/drafts',  label: 'Drafts',     icon: 'file' },
  ],
  review: [
    { href: '/review',           label: 'Review queue', icon: 'inbox' },
    { href: '/review/processed', label: 'Processed',    icon: 'check' },
    { href: '/review/history',   label: 'History',      icon: 'history' },
  ],
  admin: [
    { href: '/admin',            label: 'Overview',        icon: 'grid' },
    { href: '/admin/students',   label: 'Students',        icon: 'users' },
    { href: '/admin/team',       label: 'Staff & roles',   icon: 'shield' },
    { href: '/admin/content',    label: 'Content',         icon: 'list' },
    { href: '/admin/reviews',    label: 'Review activity', icon: 'history' },
    { href: '/admin/audit',      label: 'Audit log',       icon: 'clock' },
    { href: '/admin/analytics',  label: 'Analytics',       icon: 'chart' },
    { href: '/admin/simulator',  label: 'Role simulator',  icon: 'eye', hideInSimulation: true },
    // Planned modules (no backend yet) — kept visible, grouped last.
    { href: '/admin/activities',   label: 'Activities',   icon: 'flag',   planned: true },
    { href: '/admin/quizzes',      label: 'Quizzes',      icon: 'quiz',   planned: true },
    { href: '/admin/leaderboards', label: 'Leaderboards', icon: 'trophy', planned: true },
  ],
};

/** Navigation for one experience only. */
export function navFor(experienceId, { simulating = false } = {}) {
  if (experienceId === 'student') return STUDENT_NAV;
  return (WORKSPACE_NAV[experienceId] || []).filter(i => !(simulating && i.hideInSimulation));
}

/** The nav item that best matches `path` (longest matching prefix), or null. */
export function activeHref(items, path) {
  const hits = items.flatMap(i => (i.match || [i.href])
    .filter(m => path === m || path.startsWith(m + '/'))
    .map(m => ({ href: i.href, len: m.length })));
  hits.sort((a, b) => b.len - a.len);
  return hits[0]?.href ?? null;
}
