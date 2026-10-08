// Mock content workflow through the real api.js + simulator:
//   Section Editor uploads → Content Reviewer approves & publishes → Student sees it.
// MOCK ONLY — this proves the frontend flow and the mock's rule imitation, not the
// production backend. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.sessionStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
globalThis.location ??= { href: 'http://example.test/', hostname: 'example.test', origin: 'http://example.test', pathname: '/', search: '', hash: '' };
globalThis.fetch = async () => ({ ok: false }); // no legacy resources.json under Node

const { api } = await import('../assets/js/services/api.js');
const { publishedFor } = await import('../assets/js/services/mock-workspace.js');

const ADMIN = { roles: ['student', 'admin'], scopes: [], available: true };
const TITLE = 'Board 9 — workflow test';
const values = { subjectId: 'math1', contentType: 'board', week: '4', group: 'Group A (sample)', section: 'Section 1', title: TITLE, description: '' };
const file = { name: 'Board 9.pdf', size: 2048, type: 'application/pdf' };
let id;

test('editor: uploads a draft in scope and submits it; out-of-scope is refused', async () => {
  await api.sim.enter('editor', ADMIN);
  const item = await api.editor.saveDraft({ values, file });
  id = item.id;
  assert.equal(item.status, 'draft');
  assert.match(item.file.storagePath, /^math1\/c\d+\/[a-z0-9]+-[A-Za-z0-9_-]+-board-9\.pdf$/, 'mock mirrors <subject>/<item id>/<unique name>');
  await api.editor.submit(id);
  assert.equal((await api.editor.get(id)).status, 'pending_review');
  await assert.rejects(api.editor.saveDraft({ values: { ...values, subjectId: 'chem' } }), e => e.code === 'forbidden');
  await assert.rejects(api.review.approve(id), e => e.code === 'forbidden', 'editors cannot approve');
});

test('student: cannot see it before publication', async () => {
  await api.sim.enter('student');
  const list = await api.resources.listBySubject('math1');
  assert.equal(list.some(r => r.title === TITLE), false);
});

test('reviewer: finds it in the queue, approves, then publishes', async () => {
  await api.sim.enter('reviewer');
  const queue = await api.review.listQueue();
  assert.ok(queue.items.some(i => i.id === id));
  await api.review.approve(id, { note: 'Looks good' });
  assert.equal((await api.review.get(id)).status, 'approved');
  await api.review.publish(id);
  const done = await api.review.get(id);
  assert.equal(done.status, 'published');
  assert.equal(done.reviewer.fullName, 'Sample Student 03', 'decision attributed to the reviewer persona');
});

test('student: now sees it under the subject; other sections do not', async () => {
  await api.sim.enter('student');
  const list = await api.resources.listBySubject('math1');
  assert.ok(list.some(r => r.title === TITLE && r.category === 'board'));
  assert.ok((await api.subjects.list()).find(s => s.id === 'math1').resourceCount > 0);
  assert.equal(publishedFor({ group: 'Group B (sample)', section: 'Section 4' }).some(i => i.id === id), false);
  assert.equal(publishedFor({ group: 'Group A (sample)', section: 'Section 2' }).some(i => i.id === id), false);
  await assert.rejects(api.editor.listMine(), e => e.code === 'forbidden', 'students have no studio access');
});

test('admin: the audit trail shows every step, attributed to each persona', async () => {
  await api.sim.enter('admin');
  const page = await api.admin.listAuditLog();
  const forItem = page.items.filter(e => e.entityId === id).map(e => e.action);
  assert.deepEqual(forItem, ['content.published', 'content.approved', 'content.submitted', 'content.created']);
  api.sim.exit();
});
