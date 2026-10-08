// Role-based experiences: navigation isolation, post-login routing, multi-role
// accounts, forbidden routes and mobile navigation. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPERIENCES, experiencesFor, experienceForPath, defaultHome, navFor, activeHref, STUDENT_NAV, WORKSPACE_NAV,
} from '../assets/js/services/experiences.js';
import { routeAllowed } from '../assets/js/services/roles.js';

const STAFF_PREFIXES = ['/editor', '/review', '/admin'];
const isStaffPath = p => STAFF_PREFIXES.some(x => p === x || p.startsWith(x + '/'));
const ids = roles => experiencesFor(roles).map(e => e.id);

test('a student-only account has exactly one experience: the Student Hub', () => {
  assert.deepEqual(ids(['student']), ['student']);
  assert.deepEqual(ids([]), ['student'], 'unknown/no roles still get the student hub, nothing more');
});

test('student navigation never contains Admin, Editor or Reviewer destinations', () => {
  assert.deepEqual(STUDENT_NAV.map(n => n.label), ['Home', 'Subjects', 'Search', 'Updates', 'Profile']);
  for (const item of STUDENT_NAV) {
    assert.equal(isStaffPath(item.href), false, item.href);
    for (const m of item.match || []) assert.equal(isStaffPath(m), false, m);
  }
  assert.deepEqual(navFor('student'), STUDENT_NAV);
});

test('each staff workspace shows only its own navigation (never mixed)', () => {
  assert.deepEqual(navFor('editor').map(n => n.label), ['Overview', 'Upload', 'My content', 'Drafts']);
  assert.deepEqual(navFor('review').map(n => n.label), ['Review queue', 'Processed', 'History']);
  const admin = navFor('admin').filter(n => !n.planned).map(n => n.label);
  assert.deepEqual(admin, ['Overview', 'Students', 'Staff & roles', 'Content', 'Review activity', 'Audit log', 'Analytics', 'Role simulator']);
  for (const [id, items] of Object.entries(WORKSPACE_NAV)) {
    const prefix = EXPERIENCES.find(e => e.id === id).home;
    for (const item of items) assert.ok(item.href === prefix || item.href.startsWith(prefix + '/'), `${id} nav leaks ${item.href}`);
  }
});

test('the simulator entry is hidden inside a running simulation', () => {
  assert.ok(navFor('admin').some(n => n.href === '/admin/simulator'));
  assert.ok(!navFor('admin', { simulating: true }).some(n => n.href === '/admin/simulator'));
});

test('routes map to exactly one experience', () => {
  assert.equal(experienceForPath('/dashboard'), 'student');
  assert.equal(experienceForPath('/subjects/math1'), 'student');
  assert.equal(experienceForPath('/announcements'), 'student');
  assert.equal(experienceForPath('/editor'), 'editor');
  assert.equal(experienceForPath('/editor/uploads/c1'), 'editor');
  assert.equal(experienceForPath('/review/processed'), 'review');
  assert.equal(experienceForPath('/admin/content/42'), 'admin');
  assert.equal(experienceForPath('/editorial'), 'student', 'prefix match is per path segment');
  assert.equal(experienceForPath('/administrator'), 'student');
});

test('default post-login routing lands on the most authoritative workspace', () => {
  assert.equal(defaultHome(['student']), '/dashboard');
  assert.equal(defaultHome([]), '/dashboard');
  assert.equal(defaultHome(['student', 'section_editor']), '/editor');
  assert.equal(defaultHome(['student', 'content_manager']), '/review');
  assert.equal(defaultHome(['student', 'admin']), '/admin');
  assert.equal(defaultHome(['section_editor', 'content_manager']), '/review');
});

test('multiple-role accounts: remembered workspace is used only while still authorised', () => {
  const roles = ['student', 'section_editor', 'admin'];
  assert.deepEqual(ids(roles), ['student', 'editor', 'review', 'admin'], 'admins may also upload and review');
  assert.equal(defaultHome(roles, { last: 'student' }), '/dashboard');
  assert.equal(defaultHome(roles, { last: 'editor' }), '/editor');
  assert.equal(defaultHome(['student', 'section_editor'], { last: 'admin' }), '/editor', 'a stale "admin" memory is ignored');
  assert.equal(defaultHome(['student'], { last: 'review' }), '/dashboard');
  assert.equal(defaultHome(['student'], { last: 'nonsense' }), '/dashboard');
});

test('forbidden routes: the router role sets match each workspace, so no nav item is ever forbidden', () => {
  const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  const roleSet = name => JSON.parse(app.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));
  const sets = { editor: roleSet('EDITOR'), review: roleSet('REVIEWER'), admin: roleSet('ADMIN') };
  for (const e of EXPERIENCES.filter(x => x.roles)) assert.deepEqual([...sets[e.id]].sort(), [...e.roles].sort(), e.id);
  // a student opening a staff URL directly is refused (UX); the backend refuses the data anyway
  for (const set of Object.values(sets)) assert.equal(routeAllowed(set, ['student']), false);
  assert.equal(routeAllowed(sets.admin, ['student', 'section_editor']), false);
  assert.equal(routeAllowed(sets.review, ['student', 'section_editor']), false);
  assert.equal(routeAllowed(sets.editor, ['content_manager']), false);
});

test('mobile navigation: the student bottom bar is the student nav; active item follows the route', () => {
  const layout = readFileSync(new URL('../assets/js/ui/layout.js', import.meta.url), 'utf8');
  assert.match(layout, /mount\(bottomnav, html`\$\{STUDENT_NAV\.map/, 'bottom bar renders STUDENT_NAV only');
  assert.match(layout, /if \(staff\) \{[\s\S]*?bottomnav\.hidden = true;/, 'staff shells hide the student bottom bar');
  assert.equal(activeHref(STUDENT_NAV, '/subjects/math1'), '/subjects');
  assert.equal(activeHref(STUDENT_NAV, '/assignments'), '/subjects', 'assignments live under the academic flow');
  assert.equal(activeHref(STUDENT_NAV, '/search'), '/resources');
  assert.equal(activeHref(navFor('editor'), '/editor/uploads/c1'), '/editor/uploads');
  assert.equal(activeHref(navFor('editor'), '/editor/upload'), '/editor/upload');
  assert.equal(activeHref(navFor('review'), '/review/c9'), '/review');
  assert.equal(activeHref(navFor('admin'), '/admin/content/7'), '/admin/content');
  assert.equal(activeHref(navFor('admin'), '/dashboard'), null);
});
