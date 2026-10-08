// Role-based experiences: navigation isolation, post-login routing, multi-role
// accounts, forbidden routes and mobile navigation. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPERIENCES, experiencesFor, experienceForPath, defaultHome, navFor, subnavFor, activeHref,
  STUDENT_NAV, WORKSPACE_NAV, SUBNAV, REDIRECTS,
} from '../assets/js/services/experiences.js';
import { routeAllowed } from '../assets/js/services/roles.js';

const STAFF_PREFIXES = ['/editor', '/review', '/admin'];
const isStaffPath = p => STAFF_PREFIXES.some(x => p === x || p.startsWith(x + '/'));
const ids = roles => experiencesFor(roles).map(e => e.id);
const keys = items => items.map(n => n.key);

const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const roleSet = name => JSON.parse(app.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));
const SETS = { editor: roleSet('EDITOR'), review: roleSet('REVIEWER'), admin: roleSet('ADMIN') };
// Which workspaces a role set can open, as the router would decide it (UX only).
const openable = roles => Object.entries(SETS).filter(([, set]) => routeAllowed(set, roles)).map(([id]) => id);

/* ---------- multi-role matrix (roles are permissions, not identities) ---------- */

test('student only: Student Hub, nothing else; every staff route refused', () => {
  const roles = ['student'];
  assert.deepEqual(ids(roles), ['student']);
  assert.deepEqual(openable(roles), []);
  assert.equal(defaultHome(roles), '/dashboard');
  assert.deepEqual(ids([]), ['student'], 'unknown/no roles still get the student hub, nothing more');
});

test('student + section editor: Student Hub and Content Studio only', () => {
  const roles = ['student', 'section_editor'];
  assert.deepEqual(ids(roles), ['student', 'editor']);
  assert.deepEqual(openable(roles), ['editor']);
  assert.equal(defaultHome(roles), '/editor');
});

test('student + content reviewer: Student Hub and Review Desk only', () => {
  const roles = ['student', 'content_manager'];
  assert.deepEqual(ids(roles), ['student', 'review']);
  assert.deepEqual(openable(roles), ['review']);
  assert.equal(defaultHome(roles), '/review');
});

test('student + several staff roles: each granted workspace, no admin', () => {
  const roles = ['student', 'section_editor', 'content_manager'];
  assert.deepEqual(ids(roles), ['student', 'editor', 'review']);
  assert.deepEqual(openable(roles), ['editor', 'review']);
  assert.equal(defaultHome(roles), '/review', 'most authoritative workspace by default');
});

test('admin: all four workspaces (admins may also upload and review) and still a student', () => {
  const roles = ['student', 'admin'];
  assert.deepEqual(ids(roles), ['student', 'editor', 'review', 'admin']);
  assert.deepEqual(openable(roles), ['editor', 'review', 'admin']);
  assert.equal(defaultHome(roles), '/admin');
});

test('unauthorized route: staff URLs opened directly are refused for roles that lack them', () => {
  for (const set of Object.values(SETS)) assert.equal(routeAllowed(set, ['student']), false);
  assert.equal(routeAllowed(SETS.admin, ['student', 'section_editor']), false);
  assert.equal(routeAllowed(SETS.review, ['student', 'section_editor']), false);
  assert.equal(routeAllowed(SETS.editor, ['content_manager']), false);
  assert.equal(routeAllowed(SETS.admin, ['section_editor', 'content_manager']), false);
});

test('switching: the remembered workspace is used only while still authorised', () => {
  const roles = ['student', 'section_editor', 'admin'];
  assert.equal(defaultHome(roles, { last: 'student' }), '/dashboard', 'staff can switch to the Student Hub and stay there');
  assert.equal(defaultHome(roles, { last: 'editor' }), '/editor');
  assert.equal(defaultHome(roles, { last: 'review' }), '/review');
  assert.equal(defaultHome(['student', 'section_editor'], { last: 'admin' }), '/editor', 'a stale "admin" memory is ignored');
  assert.equal(defaultHome(['student'], { last: 'review' }), '/dashboard');
  assert.equal(defaultHome(['student'], { last: 'nonsense' }), '/dashboard');
  // the switcher offers exactly the user's experiences, each landing on its own home
  for (const e of experiencesFor(roles)) assert.equal(experienceForPath(e.home), e.id);
});

test('the router role sets match each workspace, so no offered workspace is ever forbidden', () => {
  for (const e of EXPERIENCES.filter(x => x.roles)) assert.deepEqual([...SETS[e.id]].sort(), [...e.roles].sort(), e.id);
});

/* ---------- navigation ---------- */

test('student navigation: five grouped destinations, never a staff destination', () => {
  assert.deepEqual(keys(STUDENT_NAV), ['home', 'learn', 'updates', 'progress', 'profile']);
  for (const item of STUDENT_NAV) {
    assert.equal(isStaffPath(item.href), false, item.href);
    for (const m of item.match || []) assert.equal(isStaffPath(m), false, m);
  }
  assert.deepEqual(navFor('student'), STUDENT_NAV);
});

test('each staff workspace shows only its own navigation (never mixed)', () => {
  assert.deepEqual(keys(navFor('editor')), ['studioOverview', 'upload', 'myContent']);
  assert.deepEqual(keys(navFor('review')), ['reviewQueue', 'reviewHistory']);
  assert.deepEqual(keys(navFor('admin')), ['adminOverview', 'people', 'content', 'insights', 'settings'], 'five admin destinations');
  for (const [id, items] of Object.entries(WORKSPACE_NAV)) {
    const prefix = EXPERIENCES.find(e => e.id === id).home;
    for (const item of items) assert.ok(item.href === prefix || item.href.startsWith(prefix + '/'), `${id} nav leaks ${item.href}`);
  }
});

test('admin sections live inside their destination, not as extra top-level tabs', () => {
  const top = new Set(navFor('admin').map(n => n.href));
  for (const [dest, items] of Object.entries(SUBNAV)) {
    assert.ok(top.has(dest), `${dest} is a top-level destination`);
    for (const i of items) assert.ok(i.href === dest || i.href.startsWith(dest + '/'), i.href);
  }
  assert.deepEqual(keys(subnavFor('/admin/content/quizzes')), ['library', 'reviewQueue', 'quizzes', 'activities']);
  assert.deepEqual(subnavFor('/admin'), []);
});

test('the simulator entry is hidden inside a running simulation', () => {
  assert.ok(subnavFor('/admin/settings').some(n => n.href === '/admin/settings/simulator'));
  assert.ok(!subnavFor('/admin/settings', { simulating: true }).some(n => n.href === '/admin/settings/simulator'));
});

test('routes map to exactly one experience', () => {
  assert.equal(experienceForPath('/dashboard'), 'student');
  assert.equal(experienceForPath('/subjects/math1'), 'student');
  assert.equal(experienceForPath('/quizzes/q1'), 'student');
  assert.equal(experienceForPath('/editor'), 'editor');
  assert.equal(experienceForPath('/editor/uploads/c1'), 'editor');
  assert.equal(experienceForPath('/review/history'), 'review');
  assert.equal(experienceForPath('/admin/content/42'), 'admin');
  assert.equal(experienceForPath('/editorial'), 'student', 'prefix match is per path segment');
  assert.equal(experienceForPath('/administrator'), 'student');
});

test('old addresses redirect inside the same experience', () => {
  for (const [from, to] of Object.entries(REDIRECTS)) {
    assert.equal(experienceForPath(to.split('?')[0]), experienceForPath(from), `${from} → ${to}`);
    assert.match(app, /\.\.\.Object\.entries\(REDIRECTS\)/);
  }
});

test('mobile navigation: the student bottom bar is the student nav; active item follows the route', () => {
  const layout = readFileSync(new URL('../assets/js/ui/layout.js', import.meta.url), 'utf8');
  assert.match(layout, /mount\(bottomnav, html`\$\{STUDENT_NAV\.map/, 'bottom bar renders STUDENT_NAV only');
  assert.match(layout, /if \(staff\) \{[\s\S]*?bottomnav\.hidden = true;/, 'staff shells hide the student bottom bar');
  assert.equal(activeHref(STUDENT_NAV, '/subjects/math1'), '/learn');
  assert.equal(activeHref(STUDENT_NAV, '/assignments'), '/learn');
  assert.equal(activeHref(STUDENT_NAV, '/search'), '/learn');
  assert.equal(activeHref(STUDENT_NAV, '/quizzes/q1'), '/progress');
  assert.equal(activeHref(STUDENT_NAV, '/leaderboard'), '/progress');
  assert.equal(activeHref(navFor('editor'), '/editor/uploads/c1'), '/editor/uploads');
  assert.equal(activeHref(navFor('editor'), '/editor/upload'), '/editor/upload');
  assert.equal(activeHref(navFor('review'), '/review/c9'), '/review');
  assert.equal(activeHref(navFor('admin'), '/admin/content/7'), '/admin/content');
  assert.equal(activeHref(navFor('admin'), '/admin/insights/audit'), '/admin/insights');
  assert.equal(activeHref(navFor('admin'), '/dashboard'), null);
});
