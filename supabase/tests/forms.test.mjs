// Google Forms reconciliation, end to end, on SYNTHETIC data shaped like the
// verified production findings:
//   74 responses · 72 with a code · 69 distinct codes · 7 codes missing from
//   applications (none in the roster) · 4 applications not in the export ·
//   Google Sheet with 71 rows (3 missing).
// Then the generated intake SQL is loaded into the isolated database twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, compareSources, responseIssues, intakeSql, shareableReport, shareableExtras } from '../../tools/reconcile/lib.mjs';
import { loadPGlite, freshDb, migrate, val } from './harness.mjs';

const PGlite = await loadPGlite();
const SALT = 'synthetic-test-salt-0123456789';
const pad = n => String(n).padStart(4, '0');

function dataset() {
  const cols = { responseCode: 'Student Code', responsePhone: 'WhatsApp', responseTime: 'Timestamp', responseName: 'Full name',
    appId: 'id', appCode: 'student_code', appPhone: 'whatsapp_number', appName: 'full_name',
    approvedId: 'id', approvedCode: 'student_code', approvedPhone: 'whatsapp_number', approvedAppId: 'application_id', rosterCode: 'student_code' };
  const responses = [];
  const add = (code, name, i) => responses.push({ __row: responses.length + 2, Timestamp: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T10:${pad(i).slice(2)}:00Z`,
    'Student Code': code, 'Full name': name, WhatsApp: `010${String(10000000 + i)}` });
  for (let i = 1; i <= 62; i++) add(`T${pad(i)}`, `Student ${i}`, i);                 // 62 codes that have applications
  for (let i = 1; i <= 7; i++) add(i === 7 ? 'T-7' : `X${pad(i)}`, `Unmatched ${i}`, 100 + i); // 7 codes with no application (one badly formatted)
  add('T0005', 'Student 5', 200);                                                     // duplicates: 3 codes twice
  add('T0006', 'Student Six Different', 201);                                         //   … one with a different name
  add('X0001', 'Unmatched 1', 202);
  add('', 'Blank One', 300); add('  ', 'Blank Two', 301);                             // 2 blank codes
  const applications = [];
  for (let i = 1; i <= 62; i++) applications.push({ id: String(i), student_code: `T${pad(i)}`, full_name: `Student ${i}`, whatsapp_number: '' });
  for (let i = 63; i <= 66; i++) applications.push({ id: String(i), student_code: `T${pad(i)}`, full_name: `Student ${i}`, whatsapp_number: '' }); // 4 not in the export
  const approved = applications.slice(0, 59).map((a, i) => ({ id: String(i + 1), application_id: a.id, student_code: a.student_code, whatsapp_number: '' }));
  const roster = Array.from({ length: 66 }, (_, i) => ({ student_code: `T${pad(i + 1)}` }));
  const sheet = responses.filter((_, i) => ![10, 20, 30].includes(i));                // the Sheet lost 3 rows
  return { cols, responses, applications, approved, roster, sheet };
}

test('reconciliation reproduces the verified counts (synthetic data)', () => {
  const d = dataset();
  const r = reconcile(d, d.cols);
  assert.equal(d.responses.length, 74);
  assert.equal(r.counts.responsesBlankCode, 2);
  assert.equal(d.responses.length - r.counts.responsesBlankCode, 72);
  assert.equal(r.counts.responsesUniqueCodes, 69);
  assert.equal(r.counts.responseCodesWithDuplicates, 3);
  assert.equal(r.counts.csvCodesMissingFromApplications, 7);
  assert.equal(r.counts.csvCodesMissingFromApplicationsButInRoster, 0);
  assert.equal(r.counts.applicationsMissingFromCsv, 4);
  const s = compareSources(d.responses, d.sheet, d.cols);
  assert.deepEqual(s.counts, { csvRows: 74, sheetRows: 71, missingFromSheet: 3, missingFromCsv: 0 });
  assert.ok(s.lists.missingFromSheet.every(x => x.row && x.time), 'source rows and timestamps are preserved');
  const issues = responseIssues(d.responses, d.cols, { applications: d.applications, appCols: { appCode: 'student_code', appName: 'full_name' } });
  assert.equal(issues.counts.invalidCodes, 1);
  // T0006 was submitted twice with a different name (and phone); the other duplicates agree.
  const conflict = issues.lists.conflicts.find(c => c.code === 'T0006');
  assert.ok(conflict, 'conflicting resubmission is flagged');
  assert.ok(conflict.kinds.includes('name differs between responses'));
  assert.ok(!issues.lists.conflicts.some(c => c.code === 'T0005' && c.kinds.includes('name differs between responses')));
});

test('the shareable report has counts and salted references only — no codes, names or phones', () => {
  const d = dataset();
  const r = reconcile(d, d.cols);
  const report = shareableReport(r, SALT, { generatedAt: 'test' }) + shareableExtras({
    sources: compareSources(d.responses, d.sheet, d.cols),
    issues: responseIssues(d.responses, d.cols, { applications: d.applications, appCols: { appCode: 'student_code', appName: 'full_name' } }),
  }, SALT);
  assert.doesNotMatch(report, /T00\d\d|X000\d|Student \d|Unmatched|010\d{8}/);
  assert.match(report, /S-[0-9a-f]{8}/);
  assert.match(report, /In the export but missing from the Sheet \| 3/);
});

test('the 7 missing submissions load into review idempotently — never approved', { skip: PGlite ? false : 'PGlite not installed' }, async () => {
  const d = dataset();
  const r = reconcile(d, d.cols);
  const missing = new Set(r.lists.csvNotInApplications.map(x => x.code));
  const sql = intakeSql(d.responses.filter(x => missing.has(String(x['Student Code']).replace(/\s+/g, '').toUpperCase())), d.cols);
  assert.equal((sql.match(/ingest_form_response/g) || []).length, 8, '7 codes, one of them submitted twice');
  const db = await freshDb(PGlite);
  await migrate(db);
  const approvedBefore = Number(await val(db, 'select count(*) from public.approved_students'));
  await db.exec('reset role;');
  await db.exec(sql);
  await db.exec(sql);                                                                   // re-run: no-op
  assert.equal(Number(await val(db, 'select count(*) from intake.form_responses')), 8);
  assert.equal(Number(await val(db, "select count(*) from intake.form_responses where review_state = 'needs_review'")), 8);
  assert.equal(Number(await val(db, "select count(*) from intake.form_responses where review_reason = 'not_in_roster'")), 8);
  assert.equal(Number(await val(db, 'select count(*) from public.approved_students')), approvedBefore, 'nothing approved');
  assert.equal(Number(await val(db, "select count(*) from intake.form_responses where source = 'csv_reconcile' and source_row is not null and submitted_at is not null")), 8, 'provenance kept');
});
