// Migrations 02 (activity & presence) and 04 (Forms intake & applications review)
// against the isolated PGlite database. Synthetic data only.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPGlite, freshDb, migrate, as, asRole, uid, ADMIN, EDITOR, val } from './harness.mjs';

const PGlite = await loadPGlite();
const skip = PGlite ? false : 'PGlite not installed (npm install)';
const A = uid(3);
const B = uid(4);

let db;
const rpc = (sql, params) => db.query(sql, params).then(r => Object.values(r.rows[0] ?? {})[0]);

before(async () => {
  if (!PGlite) return;
  db = await freshDb(PGlite);
  await migrate(db);
});

/* ---------- presence & activity ---------- */

test('presence: many tabs / repeated beats = one person; server time; rate limited', { skip }, async () => {
  for (let i = 0; i < 5; i++) await as(db, A, () => db.query('select public.record_presence()'));
  await as(db, B, () => db.query('select public.record_presence()'));
  assert.equal(Number(await val(db, 'select count(*) from hub_activity.presence')), 2);
  const first = await val(db, `select last_seen_at from hub_activity.presence where user_id = '${A}'`);
  await as(db, A, () => db.query('select public.record_presence()'));
  assert.equal(String(await val(db, `select last_seen_at from hub_activity.presence where user_id = '${A}'`)), String(first), 'a beat within 20 s is ignored');
  const s = await as(db, ADMIN, () => rpc('select public.admin_activity_summary()'));
  assert.equal(Number(s.online_now), 2);
  // someone last seen 5 minutes ago is no longer online, but still active today
  await db.exec(`update hub_activity.presence set last_seen_at = now() - interval '5 minutes' where user_id = '${B}'`);
  const s2 = await as(db, ADMIN, () => rpc('select public.admin_activity_summary()'));
  assert.equal(Number(s2.online_now), 1);
  assert.ok(Number(s2.active_24h) >= 2);
});

test('presence and activity are not readable or writable directly', { skip }, async () => {
  await assert.rejects(as(db, A, () => db.query('select * from hub_activity.presence')), /permission denied/);
  await assert.rejects(as(db, A, () => db.query(`insert into hub_activity.events (user_id, type) values ('${A}', 'auth.sign_in')`)), /permission denied/);
  await assert.rejects(asRole(db, 'anon', () => db.query('select public.record_presence()')), /permission denied/);
  await assert.rejects(as(db, A, () => db.query('select public.admin_activity_summary()')), /requires role/);
  await assert.rejects(as(db, EDITOR, () => db.query('select public.admin_recent_activity(5)')), /requires role/);
});

test('sign-ins and audited actions become events (server side); feed shows short names only', { skip }, async () => {
  await db.exec(`update auth.users set last_sign_in_at = now() where id = '${A}'`);
  await db.exec(`insert into public.audit_logs (actor_id, action, metadata) values ('${ADMIN}', 'content.approved', '{"title":"Sheet 3"}'),
                 ('${ADMIN}', 'role.granted', '{}'), ('${ADMIN}', 'something.else', '{}')`);
  const s = await as(db, ADMIN, () => rpc('select public.admin_activity_summary()'));
  assert.ok(Number(s.sign_ins_24h) >= 1);
  const feed = await as(db, ADMIN, () => rpc('select public.admin_recent_activity(10)'));
  const types = feed.map(e => e.type);
  assert.ok(types.includes('auth.sign_in') && types.includes('content.approved') && types.includes('role.granted'));
  assert.ok(!types.includes('something.else'), 'unknown actions are not invented into events');
  assert.doesNotMatch(JSON.stringify(feed), /Example"|@example/, 'no full names or emails');
});

test('a broken audit row never blocks the audited action', { skip }, async () => {
  await db.exec(`insert into public.audit_logs (actor_id, action) values (null, 'content.published')`);
  assert.ok(Number(await val(db, `select count(*) from public.audit_logs where action = 'content.published'`)) >= 1);
});

test('retention purge removes old activity', { skip }, async () => {
  await db.exec(`insert into hub_activity.events (user_id, type, occurred_at) values ('${A}', 'auth.sign_in', now() - interval '200 days')`);
  await db.exec('select hub_activity.purge()');
  assert.equal(Number(await val(db, `select count(*) from hub_activity.events where occurred_at < now() - interval '180 days'`)), 0);
});

/* ---------- Google Forms intake ---------- */

const ingest = (id, payload, row = null) => asRole(db, 'service_role', () =>
  rpc('select public.ingest_form_response($1, $2, now(), $3, $4, $5)', [id, 'form-1', JSON.stringify(payload), 'trigger', row]));

test('intake is idempotent by response id; edits are kept as revisions', { skip }, async () => {
  assert.equal((await ingest('r-1', { student_code: 'T0060', full_name: 'Student 60 Example' }, 2)).result, 'inserted');
  assert.equal((await ingest('r-1', { student_code: 'T0060', full_name: 'Student 60 Example' }, 2)).result, 'duplicate');
  assert.equal((await ingest('r-1', { student_code: 'T0060', full_name: 'Student Sixty Example' }, 2)).result, 'revised');
  assert.equal(Number(await val(db, `select count(*) from intake.form_responses where response_id = 'r-1'`)), 1);
  assert.equal(Number(await val(db, `select count(*) from intake.response_revisions where response_id = 'r-1'`)), 2);
  assert.equal(await val(db, `select review_state from intake.form_responses where response_id = 'r-1'`), 'linked');
});

test('unmatched / invalid submissions go to review — never into approved_students', { skip }, async () => {
  const approvedBefore = Number(await val(db, 'select count(*) from public.approved_students'));
  await ingest('r-2', { student_code: 'X9999', full_name: 'Not In Roster' }, 3);
  await ingest('r-3', { student_code: '  ', full_name: 'Blank Code' }, 4);
  await db.exec("insert into public.university_students values ('T0099')");
  await ingest('r-4', { student_code: 'T0099', full_name: 'Roster But No Application' }, 5);
  const states = (await db.query(`select response_id, review_state, review_reason from intake.form_responses where response_id in ('r-2','r-3','r-4') order by 1`)).rows;
  assert.deepEqual(states.map(s => [s.review_state, s.review_reason]), [['needs_review', 'not_in_roster'], ['needs_review', 'blank_code'], ['needs_review', 'no_application']]);
  assert.equal(Number(await val(db, 'select count(*) from public.approved_students')), approvedBefore);
  assert.equal(Number(await val(db, 'select count(*) from public.applications where student_code in (\'X9999\', \'T0099\')')), 0, 'no application is created automatically');
});

test('intake functions are not callable from the browser (anon or signed-in, even admins)', { skip }, async () => {
  await assert.rejects(asRole(db, 'anon', () => db.query(`select public.ingest_form_response('x', 'f', now(), '{}')`)), /permission denied/);
  await assert.rejects(as(db, ADMIN, () => db.query(`select public.ingest_form_response('x', 'f', now(), '{}')`)), /permission denied/);
  await assert.rejects(as(db, A, () => db.query('select * from intake.form_responses')), /permission denied/);
});

test('bad payloads are recorded as intake errors (codes only) and retried safely', { skip }, async () => {
  await assert.rejects(asRole(db, 'service_role', () => db.query(`select public.ingest_form_response('r-bad', 'f', now(), '[1,2]')`)), /must be a json object/);
  await asRole(db, 'service_role', () => db.query(`select public.record_intake_error('r-sig', 'signature', 'bad_hmac')`));
  await asRole(db, 'service_role', () => db.query(`select public.record_intake_error('r-sig', 'signature', 'bad_hmac')`));
  assert.equal(Number(await val(db, `select attempts from intake.errors where response_id = 'r-sig'`)), 2);
});

/* ---------- applications review ---------- */

test('applications list: only admins; unions applications and form-only items', { skip }, async () => {
  await assert.rejects(as(db, A, () => db.query('select public.admin_list_applications()')), /requires role/);
  const page = await as(db, ADMIN, () => rpc(`select public.admin_list_applications('needs_review', null, null, 100)`));
  const ids = page.items.map(i => i.id);
  assert.ok(ids.includes('65') && ids.includes('66'), 'pending applications outside the roster need review');
  assert.ok(ids.includes('form:r-2') && ids.includes('form:r-3'), 'form responses without an application need review');
  const sum = await as(db, ADMIN, () => rpc('select public.admin_application_summary()'));
  assert.equal(Number(sum.approved), 59);
  assert.equal(Number(sum.approved_total), 59);
});

test('approval: explicit, roster-checked, copies the phone, logged; decisions are final', { skip }, async () => {
  const row = await as(db, ADMIN, () => rpc(`select public.admin_review_application('60', 'approve', null)`));
  assert.equal(row.status, 'approved');
  const approved = (await db.query(`select whatsapp_number, whatsapp_e164 from public.approved_students where application_id = 60`)).rows[0];
  assert.ok(approved.whatsapp_number && /^\+201/.test(approved.whatsapp_e164), 'migration 01 trigger copied the phone');
  await assert.rejects(as(db, ADMIN, () => db.query(`select public.admin_review_application('60', 'reject', 'changed my mind')`)), /already decided/);
  await assert.rejects(as(db, ADMIN, () => db.query(`select public.admin_review_application('65', 'approve', null)`)), /not in the university roster/);
  assert.equal(await val(db, `select status from public.applications where id = 65`), 'pending');
  await assert.rejects(as(db, ADMIN, () => db.query(`select public.admin_review_application('form:r-4', 'approve', null)`)), /cannot be approved here/);
  await assert.rejects(as(db, ADMIN, () => db.query(`select public.admin_review_application('61', 'reject', '')`)), /a note is required/);
  const rej = await as(db, ADMIN, () => rpc(`select public.admin_review_application('61', 'reject', 'Not a prep-year student')`));
  assert.equal(rej.status, 'rejected');
  assert.equal(Number(await val(db, `select count(*) from intake.review_log`)), 2);
  await assert.rejects(as(db, EDITOR, () => db.query(`select public.admin_review_application('62', 'approve', null)`)), /requires role/);
});

test('integrity summary reflects the real state (2 phones need review after migration 01)', { skip }, async () => {
  const s = await as(db, ADMIN, () => rpc('select public.admin_data_integrity_summary()'));
  assert.equal(Number(s.approved_missing_phone), 2);
  assert.ok(Number(s.applications_not_in_roster) >= 2);
  assert.ok(Number(s.intake_errors) >= 1);
});
