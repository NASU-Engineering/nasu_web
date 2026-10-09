// Migration 01 (WhatsApp) against the isolated PGlite database. Synthetic data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPGlite, freshDb, migrate, val, MIGRATIONS } from './harness.mjs';

const PGlite = await loadPGlite();
const skip = PGlite ? false : 'PGlite not installed (npm install)';
const sql01 = readFileSync(new URL('../prepared/20261010_01_whatsapp_text_and_sync.sql', import.meta.url), 'utf8');
const rollback01 = readFileSync(new URL('../prepared/20261010_01_rollback.sql', import.meta.url), 'utf8');

const counts = async db => ({
  total: Number(await val(db, 'select count(*) from public.approved_students')),
  withNumber: Number(await val(db, 'select count(*) from public.approved_students where whatsapp_number is not null')),
});

test('before: reproduces the verified finding — 59 approved, all without a phone', { skip }, async () => {
  const db = await freshDb(PGlite);
  assert.deepEqual(await counts(db), { total: 59, withNumber: 0 });
});

test('dry run (no hub.apply) changes nothing', { skip }, async () => {
  const db = await freshDb(PGlite);
  await migrate(db, { only: [MIGRATIONS[0]] });
  await db.exec("reset hub.apply; set hub.expected_backfill = '57';");
  await assert.rejects(db.transaction(tx => tx.exec(sql01)), /DRY RUN complete/);
  assert.deepEqual(await counts(db), { total: 59, withNumber: 0 });
  assert.equal(await val(db, "select data_type from information_schema.columns where table_name = 'approved_students' and column_name = 'whatsapp_number'"), 'bigint');
  assert.equal(await val(db, "select count(*) from information_schema.columns where table_name = 'approved_students' and column_name = 'whatsapp_e164'"), 0);
});

test('guard: an unexpected candidate count aborts everything', { skip }, async () => {
  const db = await freshDb(PGlite);
  await migrate(db, { only: [MIGRATIONS[0]] });
  await assert.rejects(migrate(db, { only: [MIGRATIONS[1]], expectedBackfill: 50 }), /guard: 57 recoverable rows, expected 50/);
  assert.deepEqual(await counts(db), { total: 59, withNumber: 0 });
  assert.equal(await val(db, "select data_type from information_schema.columns where table_name = 'approved_students' and column_name = 'whatsapp_number'"), 'bigint', 'type change rolled back too');
});

test('apply: 57 backfilled as text (exact source value), 2 left for review, nothing invented', { skip }, async () => {
  const db = await freshDb(PGlite);
  await migrate(db, { only: MIGRATIONS.slice(0, 2) });
  assert.deepEqual(await counts(db), { total: 59, withNumber: 57 });
  assert.equal(Number(await val(db, 'select count(*) from public.approved_students where whatsapp_e164 is not null')), 57);
  assert.equal(await val(db, "select data_type from information_schema.columns where table_name = 'approved_students' and column_name = 'whatsapp_number'"), 'text');
  // exact copy of the application's value, no reformatting
  assert.equal(Number(await val(db, `select count(*) from public.approved_students p join public.applications a on a.id = p.application_id
                                      where p.whatsapp_number is not null and p.whatsapp_number <> a.whatsapp_number`)), 0);
  // the two review cases stay empty — not guessed
  assert.deepEqual((await db.query('select application_id from public.approved_students where whatsapp_number is null order by 1')).rows.map(r => Number(r.application_id)), [58, 59]);
  // E.164 is well-formed and the constraint is validated
  assert.equal(Number(await val(db, "select count(*) from public.approved_students where whatsapp_e164 !~ '^\\+201[0125][0-9]{8}$'")), 0);
  assert.equal(await val(db, "select convalidated from pg_constraint where conname = 'approved_students_whatsapp_e164_format'"), true);
});

test('re-running is safe: nothing left to backfill means the guard stops it (no double work)', { skip }, async () => {
  const db = await freshDb(PGlite);
  await migrate(db, { only: MIGRATIONS.slice(0, 2) });
  await assert.rejects(migrate(db, { only: [MIGRATIONS[1]] }), /guard: 0 recoverable rows/);
  assert.equal((await counts(db)).withNumber, 57);
});

test('future approvals copy the phone (the sync bug is fixed without editing the function)', { skip }, async () => {
  const db = await freshDb(PGlite);
  await migrate(db, { only: MIGRATIONS.slice(0, 2) });
  await db.exec("update public.applications set status = 'approved' where id = 60");
  const row = (await db.query('select p.whatsapp_number, p.whatsapp_e164, a.whatsapp_number as src from public.approved_students p join public.applications a on a.id = p.application_id where a.id = 60')).rows[0];
  assert.equal(row.whatsapp_number, row.src);
  assert.match(row.whatsapp_e164, /^\+201/);
});

test('corrections flow through only while the approved copy is untouched; verified values are never overwritten', { skip }, async () => {
  const db = await freshDb(PGlite);
  await migrate(db, { only: MIGRATIONS.slice(0, 2) });
  // row 1: untouched copy → follows the corrected application
  await db.exec("update public.applications set whatsapp_number = '01012345670' where id = 1");
  assert.equal(await val(db, 'select whatsapp_number from public.approved_students where application_id = 1'), '01012345670');
  assert.equal(await val(db, 'select whatsapp_e164 from public.approved_students where application_id = 1'), '+201012345670');
  // row 3: staff verified a different number → an application edit must not overwrite it
  await db.exec("update public.approved_students set whatsapp_number = '01112223334', whatsapp_e164 = '+201112223334' where application_id = 3");
  await db.exec("update public.applications set whatsapp_number = '01099998888' where id = 3");
  assert.equal(await val(db, 'select whatsapp_number from public.approved_students where application_id = 3'), '01112223334');
  // a manual review case resolved by hand stays as set
  await db.exec("update public.approved_students set whatsapp_number = '+966501234567', whatsapp_e164 = '+966501234567' where application_id = 59");
  assert.equal(await val(db, 'select whatsapp_e164 from public.approved_students where application_id = 59'), '+966501234567');
});

test('rollback restores the pre-migration state from the backup', { skip }, async () => {
  const db = await freshDb(PGlite);
  await migrate(db, { only: MIGRATIONS.slice(0, 2) });
  await db.exec("reset role; set hub.apply = 'yes';");
  await db.transaction(tx => tx.exec(rollback01));
  assert.deepEqual(await counts(db), { total: 59, withNumber: 0 });
  assert.equal(await val(db, "select data_type from information_schema.columns where table_name = 'approved_students' and column_name = 'whatsapp_number'"), 'bigint');
  assert.equal(await val(db, "select data_type from information_schema.columns where table_name = 'applications' and column_name = 'whatsapp_number'"), 'bigint');
  assert.equal(Number(await val(db, "select count(*) from information_schema.columns where table_name = 'approved_students' and column_name = 'whatsapp_e164'")), 0);
  assert.equal(Number(await val(db, "select count(*) from pg_trigger where tgname in ('approved_students_fill_whatsapp', 'applications_propagate_whatsapp')")), 0);
  assert.equal(Number(await val(db, 'select count(*) from public.applications where whatsapp_number is null')), 0, 'source phones untouched');
});

test('the migration never prints or selects phone values (counts only)', () => {
  // No RAISE passes a phone column as a format argument (messages may mention names, never values).
  const raises = sql01.replace(/\s+/g, ' ').match(/raise (notice|warning|exception) '[^']*(?:''[^']*)*'[^;]*;/g) || [];
  assert.ok(raises.length > 3);
  for (const r of raises) {
    const args = r.replace(/^raise \w+ '[^']*(?:''[^']*)*'/, '');
    assert.doesNotMatch(args, /whatsapp_number|whatsapp_e164|e164\s*\(/i, r);
  }
  for (const f of ['20261010_01_rollback.sql']) {
    const text = readFileSync(new URL(`../prepared/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /select[^;]*whatsapp_number[^;]*from[^;]*;\s*$/im, `${f} never returns phone values`);
  }
});
