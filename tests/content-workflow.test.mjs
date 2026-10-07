// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_IDS, statusMeta, isEditable, canSubmit, canDecide, canPublish,
  validateSubmission, validateDecision, countByStatus, formatBytes, MIN_REASON_LENGTH,
} from '../assets/js/services/content-workflow.js';

test('workflow statuses and the actions the UI offers for each', () => {
  assert.deepEqual(STATUS_IDS, ['draft', 'pending_review', 'approved', 'rejected', 'published', 'archived']);
  const table = Object.fromEntries(STATUS_IDS.map(s => [s, [isEditable(s), canSubmit(s), canDecide(s), canPublish(s)]]));
  assert.deepEqual(table, {
    draft:          [true, true, false, false],
    pending_review: [false, false, true, false],
    approved:       [false, false, false, true],
    rejected:       [true, true, false, false],
    published:      [false, false, false, false],
    archived:       [false, false, false, false],
  });
  assert.equal(statusMeta('rejected').tone, 'bad');
  assert.equal(statusMeta('weird').label, 'weird');
});

const base = { subjectId: 'math1', contentType: 'lecture', week: '3', title: 'Lecture 3', description: '' };
const rules = { maxBytes: 10 * 1048576, accept: ['.pdf', '.pptx'] };
const file = (name, size) => ({ name, size });

test('validateSubmission: a complete draft passes; missing fields are reported', () => {
  assert.deepEqual(validateSubmission(base, rules), { ok: true, errors: {} });
  const r = validateSubmission({ ...base, subjectId: '', contentType: 'video', title: '   ' }, rules);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['contentType', 'subjectId', 'title']);
});

test('validateSubmission: week is optional but must be 1–16', () => {
  assert.equal(validateSubmission({ ...base, week: '' }, rules).ok, true);
  for (const w of ['0', '17', '2.5', 'abc', '-1']) assert.ok(validateSubmission({ ...base, week: w }, rules).errors.week, w);
});

test('validateSubmission: file type, size, empty file, and file required to submit', () => {
  assert.equal(validateSubmission({ ...base, file: file('a.pdf', 1000) }, rules).ok, true);
  assert.equal(validateSubmission({ ...base, file: file('A.PDF', 1000) }, rules).ok, true, 'extension is case-insensitive');
  assert.ok(validateSubmission({ ...base, file: file('a.exe', 1000) }, rules).errors.file);
  assert.ok(validateSubmission({ ...base, file: file('noext', 1000) }, rules).errors.file);
  assert.ok(validateSubmission({ ...base, file: file('big.pdf', 11 * 1048576) }, rules).errors.file);
  assert.ok(validateSubmission({ ...base, file: file('empty.pdf', 0) }, rules).errors.file);
  // saving a draft without a file is fine; submitting needs one (new or already attached)
  assert.equal(validateSubmission(base, { ...rules, requireFile: false }).ok, true);
  assert.ok(validateSubmission(base, { ...rules, requireFile: true }).errors.file);
  assert.equal(validateSubmission({ ...base, existingFile: { name: 'x.pdf' } }, { ...rules, requireFile: true }).ok, true);
});

test('validateDecision: rejection needs a usable reason; approval note is optional', () => {
  assert.equal(validateDecision('approve', '').ok, true);
  assert.equal(validateDecision('reject', '').ok, false);
  assert.equal(validateDecision('reject', '  bad  ').ok, false, 'trimmed length counts');
  assert.equal(validateDecision('reject', 'x'.repeat(MIN_REASON_LENGTH)).ok, true);
  assert.equal(validateDecision('approve', 'x'.repeat(1001)).ok, false);
});

test('countByStatus and formatBytes', () => {
  const c = countByStatus([{ status: 'draft' }, { status: 'draft' }, { status: 'rejected' }, { status: 'nope' }]);
  assert.equal(c.draft, 2);
  assert.equal(c.rejected, 1);
  assert.equal(c.published, 0);
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1048576), '5.0 MB');
  assert.equal(formatBytes(undefined), '');
});
