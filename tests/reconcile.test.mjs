// Reconciliation tool (tools/reconcile) on SYNTHETIC data only — no real
// student data is ever committed. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, normalizePhone, normalizeCode, codeRef, reconcile, shareableReport, privateDetailsCsv } from '../tools/reconcile/lib.mjs';

const SALT = 'test-salt-not-a-secret-1234';

test('CSV parser: quotes, escaped quotes, embedded commas/newlines, BOM, blank lines', () => {
  const rows = parseCsv('﻿Timestamp,Student Code,Note\r\n2026-09-01,"20250001","a, ""quoted""\nline"\n\n2026-09-02, 20250002 ,x\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['Student Code'], '20250001');
  assert.equal(rows[0].Note, 'a, "quoted"\nline');
  assert.equal(rows[1]['Student Code'], '20250002');
  assert.equal(rows[1].__row, 4, 'spreadsheet row numbers are kept for provenance');
});

test('phone normalisation to E.164 text, including numbers that lost their leading zero in bigint', () => {
  const ok = v => normalizePhone(v).e164;
  assert.equal(ok('01012345678'), '+201012345678');
  assert.equal(ok('1012345678'), '+201012345678', 'bigint dropped the leading 0');
  assert.equal(ok('201112345678'), '+201112345678');
  assert.equal(ok('+20 122 345 6789'), '+201223456789');
  assert.equal(ok('00201512345678'), '+201512345678');
  assert.equal(ok('٠١٠١٢٣٤٥٦٧٨'), '+201012345678', 'Arabic-Indic digits');
  assert.equal(ok('010-1234-5678'), '+201012345678');
  for (const bad of ['0101234567', '01312345678', '1.01234568e+10', '01012345678x', '12345']) {
    assert.equal(normalizePhone(bad).status, 'review', bad);
  }
  assert.equal(normalizePhone('+966501234567').reason.startsWith('non-Egyptian'), true);
  assert.equal(normalizePhone('').status, 'blank');
  assert.equal(normalizePhone(null).status, 'blank');
});

test('student codes normalise digits/spacing; references are salted and stable', () => {
  assert.equal(normalizeCode(' ٢٠٢٥ 0001 '), '20250001');
  assert.equal(codeRef('20250001', SALT), codeRef('20250001', SALT));
  assert.notEqual(codeRef('20250001', SALT), codeRef('20250001', SALT + 'x'));
  assert.match(codeRef('20250001', SALT), /^S-[0-9a-f]{8}$/);
  assert.throws(() => codeRef('20250001', 'short'));
});

// Synthetic fixture: 6 responses (1 blank, 1 duplicate), applications for 4 codes (+1 not in the form),
// approved for 4 students (all phones NULL), roster without one code.
const responses = [
  { __row: 2, code: '1001', phone: '01011111111' },
  { __row: 3, code: '1002', phone: '01122222222' },
  { __row: 4, code: '1002', phone: '01122222222' },  // duplicate submission
  { __row: 5, code: '', phone: '' },                 // blank code
  { __row: 6, code: '1003', phone: '01233333333' },
  { __row: 7, code: '9999', phone: '01544444444' },  // not in applications, not in roster
];
const applications = [
  { id: 'a1', student_code: '1001', whatsapp: '1011111111' },     // bigint lost 0 — recoverable
  { id: 'a2', student_code: '1002', whatsapp: '01122222222' },
  { id: 'a3', student_code: '1003', whatsapp: '0123333' },        // too short — review
  { id: 'a4', student_code: '1004', whatsapp: '+966501234567' },  // foreign — review
  { id: 'a5', student_code: '5555', whatsapp: '01000000000' },    // not in the form export
];
const approved = [
  { id: 'p1', student_code: '1001', whatsapp_number: '', application_id: 'a1' },
  { id: 'p2', student_code: '1002', whatsapp_number: '', application_id: 'a2' },
  { id: 'p3', student_code: '1003', whatsapp_number: '', application_id: 'a3' },
  { id: 'p4', student_code: '1004', whatsapp_number: '', application_id: 'a4' },
];
const roster = ['1001', '1002', '1003', '1004', '5555'].map(c => ({ student_code: c }));
const cols = {
  responseCode: 'code', responsePhone: 'phone', appId: 'id', appCode: 'student_code', appPhone: 'whatsapp',
  approvedId: 'id', approvedCode: 'student_code', approvedPhone: 'whatsapp_number', approvedAppId: 'application_id', rosterCode: 'student_code',
};

test('reconciliation counts match the fixture', () => {
  const { counts, lists } = reconcile({ responses, applications, approved, roster }, cols);
  assert.equal(counts.responses, 6);
  assert.equal(counts.responsesBlankCode, 1);
  assert.equal(counts.responsesUniqueCodes, 4);
  assert.equal(counts.responseCodesWithDuplicates, 1);
  assert.equal(counts.csvCodesMissingFromApplications, 1);
  assert.equal(counts.csvCodesMissingFromApplicationsButInRoster, 0);
  assert.equal(counts.applicationsMissingFromCsv, 2, '1004 and 5555 have applications but no form response');
  assert.equal(counts.approvedPhoneBackfillable, 2);
  assert.equal(counts.approvedPhoneNeedsReview, 2);
  assert.equal(counts.approvedWithoutApplication, 0);
  assert.deepEqual(lists.phoneBackfill.map(x => x.e164), ['+201011111111', '+201122222222']);
  assert.deepEqual(lists.phoneReview.map(x => x.code), ['1003', '1004']);
});

test('nothing unmatched is treated as approvable; link mismatches are flagged', () => {
  const broken = approved.map(p => (p.id === 'p2' ? { ...p, application_id: 'a5' } : p));
  const { counts, lists } = reconcile({ responses, applications, approved: broken, roster }, cols);
  assert.equal(counts.approvedLinkCodeMismatch, 1);
  assert.equal(lists.linkCodeMismatch[0].applicationCode, '5555');
  const orphan = reconcile({ responses, applications, approved: [...approved, { id: 'p9', student_code: '7777', whatsapp_number: '', application_id: 'zz' }], roster }, cols);
  assert.equal(orphan.counts.approvedWithoutApplication, 1);
  assert.equal(orphan.counts.approvedNotInRoster, 1);
});

test('shareable report never contains codes or phone numbers; private file masks phones', () => {
  const result = reconcile({ responses, applications, approved, roster }, cols);
  const md = shareableReport(result, SALT, { generatedAt: 'fixed' });
  for (const secret of ['1001', '1002', '1003', '9999', '5555', '01011111111', '1011111111', '+2010', '966']) {
    assert.equal(md.includes(secret), false, `report leaks ${secret}`);
  }
  assert.match(md, /S-[0-9a-f]{8}/);
  const csv = privateDetailsCsv(result, SALT);
  assert.equal(/\+20\d{10}|01\d{9}/.test(csv), false, 'private file masks phones too');
  assert.match(csv, /phone_backfill_candidate/);
});
