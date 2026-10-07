// Contract mapping of the real Supabase workspace adapter, against a fake client.
// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkspaceAdapter, toWorkspaceError, BUCKET, SIGNED_URL_SECONDS, SAVE_DRAFT_CONTRACT_CONFIRMED, RPC,
} from '../assets/js/services/supabase-workspace.js';
import { normalizeContentItem } from '../assets/js/services/normalize-workspace.js';
import { storageObjectPath, safeFileName } from '../assets/js/services/content-workflow.js';

/** Fake supabase-js client: records every call, answers from `responses`. */
function fakeClient(responses = {}, { uploadError = null, signError = null } = {}) {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ kind: 'rpc', name, args, argc: arguments.length });
      const r = responses[name];
      const value = typeof r === 'function' ? r(args) : r;
      return Promise.resolve(value?.error ? value : { data: value ?? null, error: null });
    },
    storage: {
      from(bucket) {
        return {
          upload(path, file, opts) {
            calls.push({ kind: 'upload', bucket, path, file, opts });
            return Promise.resolve(uploadError ? { data: null, error: uploadError } : { data: { path }, error: null });
          },
          createSignedUrl(path, secs) {
            calls.push({ kind: 'sign', bucket, path, secs });
            return Promise.resolve(signError ? { data: null, error: signError } : { data: { signedUrl: `https://x.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null });
          },
        };
      },
    },
  };
  return { client, calls, adapter: (opts) => createWorkspaceAdapter(async () => client, opts) };
}

const rpcCalls = calls => calls.filter(c => c.kind === 'rpc');

test('access: get_my_access / list_groups take no arguments', async () => {
  const { calls, adapter } = fakeClient({
    get_my_access: [{ roles: ['student', 'admin'], scopes: [] }],
    list_groups: [{ group_name: 'G1', sections: ['S1', 'S2', 'S3', 'S4'] }],
  });
  const a = adapter();
  assert.deepEqual(await a.getMyAccess(), { roles: ['student', 'admin'], scopes: [] }, 'single-row result unwrapped');
  assert.equal((await a.listGroups()).length, 1);
  assert.deepEqual(rpcCalls(calls).map(c => [c.name, c.argc]), [['get_my_access', 1], ['list_groups', 1]]);
});

test('editor: list_my_content(), get_content_item(p_id), submit_content_for_review(p_id)', async () => {
  const { calls, adapter } = fakeClient({ list_my_content: [], get_content_item: [{ id: 'c1' }], submit_content_for_review: { id: 'c1', status: 'pending' } });
  const a = adapter();
  await a.listMyContent({ status: 'draft' });
  assert.deepEqual(await a.getContentItem('c1'), { id: 'c1' });
  await a.submitContentForReview('c1');
  assert.deepEqual(rpcCalls(calls).map(c => [c.name, c.args]), [
    ['list_my_content', undefined], ['get_content_item', { p_id: 'c1' }], ['submit_content_for_review', { p_id: 'c1' }],
  ]);
  const { adapter: empty } = fakeClient({ get_content_item: [] });
  await assert.rejects(empty().getContentItem('x'), e => e.code === 'not_found');
});

test('save_content_draft stays blocked until its parameter list is confirmed', async () => {
  assert.equal(SAVE_DRAFT_CONTRACT_CONFIRMED, false);
  const { calls, adapter } = fakeClient();
  await assert.rejects(adapter().saveContentDraft({ values: { subjectId: 'math1', title: 'x' }, file: { name: 'a.pdf', size: 1 } }),
    e => e.code === 'backend_required');
  assert.equal(calls.length, 0, 'nothing is sent and nothing is uploaded');
});

const values = { subjectId: 'stat', contentType: 'pdf', week: '2', group: 'G1', section: 'S2', title: 'Sheet 2', description: '' };
const pdf = { name: 'Sheet 2 (final).PDF', size: 1234, type: 'application/pdf' };

test('upload architecture: save draft → upload to <subject>/<item>/<unique-name> (no upsert) → save with storage path', async () => {
  let n = 0;
  const { calls, adapter } = fakeClient({ save_content_draft: args => ({ id: 'item-9', status: 'draft', storage_path: args.p_storage_path, n: ++n }) });
  const row = await adapter({ saveDraftConfirmed: true }).saveContentDraft({ id: null, values, file: pdf });
  const [first, upload, second] = calls;
  assert.equal(first.kind, 'rpc');
  assert.equal(first.name, 'save_content_draft');
  assert.equal(first.args.p_storage_path, null, 'first save has no file yet');
  assert.equal(upload.kind, 'upload');
  assert.equal(upload.bucket, BUCKET);
  assert.match(upload.path, /^stat\/item-9\/[a-z0-9]+-[A-Za-z0-9_-]+-sheet-2-final\.pdf$/);
  assert.equal(upload.opts.upsert, false);
  assert.equal(upload.file, pdf);
  assert.equal(second.name, 'save_content_draft');
  assert.equal(second.args.p_id, 'item-9');
  assert.equal(second.args.p_storage_path, upload.path);
  assert.equal(row.storage_path, upload.path);
  assert.equal(calls.length, 3);
});

test('upload failure reports the created draft id and skips the second save', async () => {
  const { calls, adapter } = fakeClient({ save_content_draft: { id: 'item-1' } }, { uploadError: { statusCode: '409', message: 'Duplicate' } });
  await assert.rejects(adapter({ saveDraftConfirmed: true }).saveContentDraft({ values, file: pdf }),
    e => e.code === 'conflict' && e.contentItemId === 'item-1');
  assert.deepEqual(calls.map(c => c.kind), ['rpc', 'upload']);
});

test('updating an existing draft without a new file makes one save call', async () => {
  const { calls, adapter } = fakeClient({ save_content_draft: { id: 'c5' } });
  await adapter({ saveDraftConfirmed: true }).saveContentDraft({ id: 'c5', values });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_id, 'c5');
});

test('review queue: pending maps to backend "pending"; processed merges approved/rejected/published', async () => {
  const { calls, adapter } = fakeClient({
    list_review_queue: args => ({
      pending: { items: [{ id: 'p1', status: 'pending' }], next_cursor: 'c2' },
      approved: { items: [{ id: 'a1', status: 'approved', reviewed_at: '2026-10-02' }], next_cursor: null },
      rejected: { items: [{ id: 'r1', status: 'rejected', reviewed_at: '2026-10-05' }], next_cursor: null },
      published: [{ id: 'u1', status: 'published', reviewed_at: '2026-10-01' }],
    })[args.p_status],
  });
  const a = adapter();
  const pending = await a.listReviewQueue({ status: 'pending_review', cursor: 'c1', limit: 10 });
  assert.deepEqual(rpcCalls(calls)[0].args, { p_status: 'pending', p_cursor: 'c1', p_limit: 10 });
  assert.equal(pending.next_cursor, 'c2');
  assert.equal(normalizeContentItem(pending.items[0]).status, 'pending_review');

  const processed = await a.listReviewQueue({ status: 'processed' });
  assert.deepEqual(rpcCalls(calls).slice(1).map(c => c.args.p_status), ['approved', 'rejected', 'published']);
  assert.deepEqual(processed.items.map(i => i.id), ['r1', 'a1', 'u1'], 'newest decision first');
  assert.equal(processed.next_cursor, null);
});

test('decisions: review_content(p_id, p_decision, p_note) and publish_content(p_id)', async () => {
  const { calls, adapter } = fakeClient({ review_content: { id: 'c1', status: 'rejected' }, publish_content: { id: 'c1', status: 'published' } });
  const a = adapter();
  await a.decideContent('c1', { decision: 'approve', note: '' });
  await a.decideContent('c1', { decision: 'reject', note: 'Fix page 2' });
  await a.publishContent('c1');
  assert.deepEqual(rpcCalls(calls).map(c => [c.name, c.args]), [
    ['review_content', { p_id: 'c1', p_decision: 'approve', p_note: '' }],
    ['review_content', { p_id: 'c1', p_decision: 'reject', p_note: 'Fix page 2' }],
    ['publish_content', { p_id: 'c1' }],
  ]);
});

test('signed preview: createSignedUrl on content-files for ≤300s; never a public URL', async () => {
  const { calls, adapter } = fakeClient({ get_content_item: { id: 'c1', storage_path: 'math1/c1/x-file.pdf' } });
  const a = adapter();
  const direct = await a.getContentFileUrl({ id: 'c1', storagePath: 'math1/c1/a.pdf' });
  assert.match(direct.url, /^https:\/\/.*\/object\/sign\//);
  assert.deepEqual(calls[0], { kind: 'sign', bucket: 'content-files', path: 'math1/c1/a.pdf', secs: SIGNED_URL_SECONDS });
  assert.ok(SIGNED_URL_SECONDS <= 300);
  await a.getContentFileUrl({ id: 'c1' });
  assert.deepEqual(calls.slice(1).map(c => c.kind), ['rpc', 'sign'], 'path looked up via get_content_item when not known');
  const { adapter: none } = fakeClient({ get_content_item: { id: 'c2', storage_path: null } });
  await assert.rejects(none().getContentFileUrl({ id: 'c2' }), e => e.code === 'preview_unavailable');
  const { adapter: denied } = fakeClient({}, { signError: { statusCode: '403', message: 'denied' } });
  await assert.rejects(denied().getContentFileUrl({ id: 'c1', storagePath: 'p' }), e => e.code === 'forbidden');
});

test('admin RPC arguments match the contract exactly', async () => {
  const { calls, adapter } = fakeClient({ get_admin_stats: [{ total_students: 3 }] });
  const a = adapter();
  assert.deepEqual(await a.getAdminStats(), { total_students: 3 });
  await a.listAllContent({ status: 'pending_review', subjectId: 'math1', query: 'x', cursor: 'k' });
  await a.listAllContent({});
  await a.searchMembers({ query: '2025', role: 'section_editor', cursor: 'ignored' });
  await a.grantRole('u1', 'section_editor');
  await a.revokeRole('u1', 'content_manager');
  await a.setEditorScopes('u1', [{ subjectId: 'math1', group: 'G1', section: null }, { subjectId: 'chem', group: null, section: null }]);
  await a.listAuditLog({ cursor: 'z', action: 'role.' });
  assert.deepEqual(rpcCalls(calls).map(c => [c.name, c.args]), [
    ['get_admin_stats', undefined],
    ['admin_list_content', { p_status: 'pending', p_cursor: 'k', p_limit: 50 }],
    ['admin_list_content', { p_status: null, p_cursor: null, p_limit: 50 }],
    ['admin_search_members', { p_query: '2025', p_limit: 50 }],
    ['admin_grant_role', { p_user_id: 'u1', p_role: 'section_editor' }],
    ['admin_revoke_role', { p_user_id: 'u1', p_role: 'content_manager' }],
    ['admin_set_editor_scopes', { p_user_id: 'u1', p_scopes: [
      { subject_id: 'math1', group_name: 'G1', section: null },
      { subject_id: 'chem', group_name: null, section: null },
    ] }],
    ['admin_list_audit_log', { p_cursor: 'z', p_limit: 50 }],
  ]);
});

test('the admin role can never be granted or revoked through the adapter', async () => {
  const { calls, adapter } = fakeClient();
  for (const fn of ['grantRole', 'revokeRole']) {
    for (const role of ['admin', 'ADMIN', 'student', 'owner']) {
      await assert.rejects(adapter()[fn]('u1', role), e => e.code === 'forbidden', `${fn}(${role})`);
    }
  }
  assert.equal(calls.length, 0, 'refused before any request');
});

test('error mapping: server text never leaks, codes map to UI states', () => {
  const cases = [
    [{ code: '42501', message: 'permission denied for table content_items' }, 'forbidden'],
    [{ code: 'PGRST301' }, 'unauthenticated'],
    [{ code: 'P0001', message: 'Rejection note must be at least 5 characters' }, 'invalid'],
    [{ code: '23505' }, 'conflict'],
    [{ code: 'PGRST202' }, 'backend_required'],
    [{ code: 'PGRST116' }, 'not_found'],
    [{ statusCode: '413' }, 'invalid'],
    [{ statusCode: '403' }, 'forbidden'],
    [new TypeError('Failed to fetch'), 'network'],
    [{ code: 'XX000', message: 'internal' }, 'unknown'],
  ];
  for (const [err, code] of cases) {
    const e = toWorkspaceError(err, 'test');
    assert.equal(e.code, code, JSON.stringify(err));
    assert.doesNotMatch(e.message, /content_items|Rejection note|internal/, 'UI message comes from errors.js');
  }
});

test('storage object paths are unique, scoped and safe', () => {
  const a = storageObjectPath('math1', 'c-1', 'Lecture 1.pdf', 'tok1');
  const b = storageObjectPath('math1', 'c-1', 'Lecture 1.pdf', 'tok2');
  assert.notEqual(a, b, 'a replacement never reuses an object path');
  assert.match(a, /^math1\/c-1\/[a-z0-9]+-tok1-lecture-1\.pdf$/);
  assert.equal(storageObjectPath('../x', 'c/../1', 'a.pdf', 't').split('/').length, 3, 'no path traversal');
  assert.equal(safeFileName('../../etc/passwd'), 'etc-passwd');
  assert.equal(safeFileName('Résumé Été.DOCX'), 'resume-ete.docx');
  assert.equal(safeFileName(''), 'file');
  assert.ok(safeFileName('x'.repeat(300) + '.pdf').length <= 80);
  assert.throws(() => storageObjectPath('', 'c1', 'a.pdf'));
  assert.ok(Object.values(RPC).every(n => /^[a-z_]+$/.test(n)));
});
