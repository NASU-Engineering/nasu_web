#!/usr/bin/env node
// Read-only reconciliation CLI. Works ONLY on local CSV exports supplied by an
// authorised operator; it never connects to Supabase or Google.
//
//   RECONCILE_SALT='<random secret, 16+ chars>' node tools/reconcile/cli.mjs \
//     --responses tools/reconcile/data/form_responses.csv \
//     --applications tools/reconcile/data/applications.csv \
//     --approved tools/reconcile/data/approved_students.csv \
//     --roster tools/reconcile/data/university_students.csv \
//     [--link-column application_id] [--col responseCode="Student Code"] …
//
// Writes:
//   tools/reconcile/out/report.md            shareable — counts + salted references only
//   tools/reconcile/out/private/details.csv  operator only — codes, record ids, masked phones
// Both data/ and out/ are git-ignored. Nothing is printed except counts.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, pickColumn, reconcile, shareableReport, privateDetailsCsv } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const colOverrides = Object.fromEntries(args.flatMap((a, i) => (a === '--col' ? [args[i + 1].split('=')] : [])).map(([k, ...v]) => [k, v.join('=').replace(/^"|"$/g, '')]));

const salt = process.env.RECONCILE_SALT;
if (!salt || salt.length < 16) { console.error('Set RECONCILE_SALT to a random secret of at least 16 characters.'); process.exit(2); }
for (const f of ['responses', 'applications', 'approved', 'roster']) {
  if (!opt(f)) { console.error(`Missing --${f} <file.csv>`); process.exit(2); }
}

const load = f => parseCsv(readFileSync(opt(f), 'utf8'));
const data = { responses: load('responses'), applications: load('applications'), approved: load('approved'), roster: load('roster') };

// Header detection (override any with --col key="Header"). Verify against the real exports.
const cols = {
  responseCode:  pickColumn(data.responses, colOverrides.responseCode, [/student.*code/i, /^code$/i, /كود/]),
  responsePhone: pickColumn(data.responses, colOverrides.responsePhone, [/whats ?app/i, /phone|mobile/i, /رقم/]),
  appId:         pickColumn(data.applications, colOverrides.appId, [/^id$/i]),
  appCode:       pickColumn(data.applications, colOverrides.appCode, [/student_?code/i, /^code$/i]),
  appPhone:      pickColumn(data.applications, colOverrides.appPhone, [/whats_?app/i, /phone|mobile/i]),
  approvedId:    pickColumn(data.approved, colOverrides.approvedId, [/^id$/i]),
  approvedCode:  pickColumn(data.approved, colOverrides.approvedCode, [/student_?code/i, /^code$/i]),
  approvedPhone: pickColumn(data.approved, colOverrides.approvedPhone, [/whats_?app/i, /phone|mobile/i]),
  approvedAppId: opt('link-column') ? pickColumn(data.approved, opt('link-column'), []) : null,
  rosterCode:    pickColumn(data.roster, colOverrides.rosterCode, [/student_?code/i, /^code$/i]),
};
const missing = Object.entries(cols).filter(([k, v]) => !v && k !== 'approvedAppId').map(([k]) => k);
if (missing.length) { console.error(`Could not detect columns: ${missing.join(', ')}. Pass --col <key>="<header>".`); process.exit(2); }

const result = reconcile(data, cols);
const out = join(here, 'out');
mkdirSync(join(out, 'private'), { recursive: true });
writeFileSync(join(out, 'report.md'), shareableReport(result, salt, { inputs: 'form responses, applications, approved_students, university_students (local CSV exports)' }));
writeFileSync(join(out, 'private', 'details.csv'), privateDetailsCsv(result, salt));

console.log('Columns used:', Object.fromEntries(Object.entries(cols).filter(([, v]) => v)));
console.table(result.counts);
console.log(`Wrote ${join('tools/reconcile/out', 'report.md')} (shareable) and out/private/details.csv (operator only).`);
