// Normalisers for workspace rows + the access fail-closed behaviour of api.js.
// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAccess, normalizeContentItem, normalizeAuditEntry, normalizeMember,
  normalizeStats, normalizeGroups, normalizePage,
} from '../assets/js/services/normalize-workspace.js';

test('normalizeAccess drops unknown roles and malformed scopes', () => {
  const a = normalizeAccess({
    roles: ['student', 'admin', 'root'],
    scopes: [{ id: 1, subject_id: 'math1', group_name: 'G1', section: '' }, { group_name: 'G2' }, null],
  });
  assert.deepEqual(a.roles, ['student', 'admin']);
  assert.deepEqual(a.scopes, [{ id: '1', subjectId: 'math1', group: 'G1', section: null }]);
  assert.equal(a.available, true);
  assert.deepEqual(normalizeAccess(null), { roles: [], scopes: [], available: true });
});

test('normalizeContentItem maps the proposed row shape and defends against bad values', () => {
  const it = normalizeContentItem({
    id: 7, title: 'T', subject_id: 'stat', content_type: 'tutorial', week: '4', group_name: null, section: 'S1',
    status: 'rejected', review_note: 'Fix page 2', file_name: 'a.pdf', file_size: 10,
    submitter: { id: 'u1', full_name: 'A B', student_id: '2025' }, submitted_at: '2026-10-01T00:00:00Z',
  });
  assert.equal(it.id, '7');
  assert.equal(it.week, 4);
  assert.equal(it.group, null);
  assert.equal(it.status, 'rejected');
  assert.equal(it.reviewNote, 'Fix page 2');
  assert.deepEqual(it.file, { name: 'a.pdf', size: 10, mimeType: '' });
  assert.deepEqual(it.submitter, { id: 'u1', fullName: 'A B', studentId: '2025' });
  const odd = normalizeContentItem({ id: 'x', status: 'hacked', content_type: '<script>', week: 'abc' });
  assert.equal(odd.status, 'draft');
  assert.equal(odd.contentType, 'pdf');
  assert.equal(odd.week, null);
  assert.equal(odd.file, null);
  assert.equal(normalizeContentItem(null), null);
});

test('audit entries, members, stats, groups, pages', () => {
  const e = normalizeAuditEntry({ id: 1, action: 'role.granted', entity_type: 'user', entity_id: 9, metadata: 'raw', actor: { user_id: 'a', full_name: 'X' } });
  assert.deepEqual(e.metadata, { value: 'raw' });
  assert.equal(e.entityId, '9');
  assert.equal(e.actor.id, 'a');

  const m = normalizeMember({ user_id: 'u', full_name: 'N', student_id: 's', roles: ['section_editor', 'student', 'bogus'], scopes: [{ subject_id: 'chem' }] });
  assert.deepEqual(m.roles, ['student', 'section_editor']);
  assert.deepEqual(m.scopes, [{ id: null, subjectId: 'chem', group: null, section: null }]);

  const s = normalizeStats({ total_students: '120', quizzes: null, pending_reviews: 'n/a' });
  assert.equal(s.total_students, 120);
  assert.equal(s.quizzes, null);
  assert.equal(s.pending_reviews, null);
  assert.equal(s.activities, null, 'missing metrics are null, never invented');

  assert.deepEqual(normalizeGroups([{ group_name: 'G1', sections: ['S1', 2] }, { sections: [] }]), [{ name: 'G1', sections: ['S1', '2'] }]);

  const page = normalizePage({ items: [{ id: 1, action: 'a' }, null], next_cursor: 'c2' }, normalizeAuditEntry);
  assert.equal(page.items.length, 1);
  assert.equal(page.nextCursor, 'c2');
  assert.deepEqual(normalizePage([{ id: 1 }], normalizeAuditEntry).nextCursor, null);
});

test('api.access fails closed while the backend has no roles API', async () => {
  // Minimal browser globals for importing the service layer under Node.
  globalThis.location ??= { href: 'http://example.test/', hostname: 'example.test', origin: 'http://example.test', pathname: '/', search: '', hash: '' };
  globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const { api, NO_ACCESS, isDemoMode } = await import('../assets/js/services/api.js');

  assert.equal(isDemoMode, false, 'shipped config must use the real backend');
  assert.equal(api.dev, null, 'demo role switcher must not exist outside the mock backend');
  assert.deepEqual(await api.access.getMine(null), NO_ACCESS);
  const access = await api.access.getMine({ email: '2025@nasu.edu.eg' });
  assert.deepEqual(access.roles, []);
  assert.equal(access.available, false);

  // Privileged calls surface 'backend_required' rather than pretending to succeed.
  for (const call of [() => api.admin.grantRole('u', 'section_editor'), () => api.review.approve('c1'), () => api.editor.listMine()]) {
    await assert.rejects(call, err => err.code === 'backend_required');
  }
});
