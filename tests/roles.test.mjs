// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoles, hasRole, workspacesFor, isStaff, primaryWorkspace, routeAllowed,
  consoleNav, activeConsoleHref, inScope, scopeOptions, scopeLabel,
} from '../assets/js/services/roles.js';

test('normalizeRoles keeps only known roles, de-duplicated, in a stable order', () => {
  assert.deepEqual(normalizeRoles(['admin', 'ADMIN', ' student ', 'superuser', null, 7]), ['student', 'admin']);
  assert.deepEqual(normalizeRoles([{ role: 'content_manager' }, { role: 'section_editor' }]), ['section_editor', 'content_manager']);
  assert.deepEqual(normalizeRoles(undefined), []);
  assert.deepEqual(normalizeRoles('admin'), [], 'a bare string is not a role list');
});

test('workspaces per role combination', () => {
  const ids = roles => workspacesFor(roles).map(w => w.id);
  assert.deepEqual(ids([]), []);
  assert.deepEqual(ids(['student']), []);
  assert.deepEqual(ids(['student', 'section_editor']), ['editor']);
  assert.deepEqual(ids(['content_manager']), ['review']);
  assert.deepEqual(ids(['student', 'admin']), ['review', 'admin'], 'admins review too');
  assert.deepEqual(ids(['section_editor', 'content_manager', 'admin']), ['editor', 'review', 'admin']);
  assert.equal(isStaff(['student']), false);
  assert.equal(isStaff(['section_editor']), true);
  assert.equal(primaryWorkspace(['student', 'admin']).id, 'admin');
  assert.equal(primaryWorkspace(['student']), null);
});

test('route guard (UX): open routes, role routes, unknown roles', () => {
  assert.equal(routeAllowed(undefined, []), true);
  assert.equal(routeAllowed([], ['student']), true);
  assert.equal(routeAllowed(['admin'], ['student']), false);
  assert.equal(routeAllowed(['admin'], ['student', 'admin']), true);
  assert.equal(routeAllowed(['content_manager', 'admin'], ['admin']), true);
  assert.equal(routeAllowed(['section_editor'], ['content_manager', 'admin']), false, 'admin is not implicitly an editor');
  assert.equal(routeAllowed(['admin'], normalizeRoles(['Admin '])), true);
  assert.equal(hasRole(null, 'admin'), false);
});

test('console nav lists only the groups the user has; active item is the longest prefix', () => {
  assert.deepEqual(consoleNav(['student']), []);
  const nav = consoleNav(['section_editor', 'admin']);
  assert.deepEqual(nav.map(g => g.id), ['editor', 'review', 'admin']);
  assert.equal(activeConsoleHref(nav, '/editor/uploads/c1'), '/editor/uploads');
  assert.equal(activeConsoleHref(nav, '/editor/upload'), '/editor/upload');
  assert.equal(activeConsoleHref(nav, '/admin'), '/admin');
  assert.equal(activeConsoleHref(nav, '/admin/team'), '/admin/team');
  assert.equal(activeConsoleHref(nav, '/review/c9'), '/review');
  assert.equal(activeConsoleHref(nav, '/dashboard'), null);
});

const scopes = [
  { subjectId: 'math1', group: 'G1', section: 'S1' },
  { subjectId: 'stat', group: 'G1', section: null },
  { subjectId: 'chem', group: null, section: null },
];

test('inScope: exact, wildcard section, wildcard group, and outside', () => {
  assert.equal(inScope(scopes, { subjectId: 'math1', group: 'G1', section: 'S1' }), true);
  assert.equal(inScope(scopes, { subjectId: 'math1', group: 'G1', section: 'S2' }), false);
  assert.equal(inScope(scopes, { subjectId: 'math1', group: 'G1', section: null }), false, 'all sections needs a section wildcard');
  assert.equal(inScope(scopes, { subjectId: 'stat', group: 'G1', section: 'S7' }), true);
  assert.equal(inScope(scopes, { subjectId: 'stat', group: 'G1', section: null }), true);
  assert.equal(inScope(scopes, { subjectId: 'stat', group: 'G2', section: 'S1' }), false);
  assert.equal(inScope(scopes, { subjectId: 'chem', group: null, section: null }), true);
  assert.equal(inScope(scopes, { subjectId: 'draw', group: 'G1', section: 'S1' }), false);
  assert.equal(inScope([], { subjectId: 'math1', group: 'G1', section: 'S1' }), false);
  assert.equal(inScope(undefined, { subjectId: 'math1' }), false);
});

test('scopeOptions limits the upload form to the editor’s scope', () => {
  const groups = [{ name: 'G1', sections: ['S1', 'S2'] }, { name: 'G2', sections: ['S3'] }];
  const o = scopeOptions(scopes, groups);
  assert.deepEqual(o.subjects, ['math1', 'stat', 'chem']);
  assert.deepEqual(o.groupsFor('math1'), [{ value: 'G1', label: 'G1' }]);
  assert.deepEqual(o.sectionsFor('math1', 'G1'), [{ value: 'S1', label: 'S1' }]);
  assert.deepEqual(o.sectionsFor('stat', 'G1').map(x => x.value), [null, 'S1', 'S2']);
  assert.deepEqual(o.groupsFor('chem').map(x => x.value), [null, 'G1', 'G2']);
  assert.deepEqual(o.sectionsFor('chem', null).map(x => x.value), [null]);
  assert.deepEqual(o.sectionsFor('chem', 'G2').map(x => x.value), [null, 'S3']);
  assert.deepEqual(o.groupsFor('draw'), []);
  // every option offered is inside the scope
  for (const s of o.subjects) for (const g of o.groupsFor(s)) for (const sec of o.sectionsFor(s, g.value)) {
    assert.ok(inScope(scopes, { subjectId: s, group: g.value, section: sec.value }), `${s}/${g.value}/${sec.value}`);
  }
  assert.equal(scopeLabel({ group: null, section: null }), 'All groups · All sections');
});
