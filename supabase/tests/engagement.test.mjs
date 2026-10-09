// Migration 03 (engagement) — security and rules, against the isolated PGlite database.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPGlite, freshDb, migrate, as, asRole, uid, ADMIN } from './harness.mjs';

const PGlite = await loadPGlite();
const skip = PGlite ? false : 'PGlite not installed (npm install)';

const A = uid(3);      // approved student, Group B? (application 1 → Group A, Section 2)
const B = uid(4);      // another approved student
const NOPROFILE = uid(65); // signed in with Microsoft, but NOT an approved student
const QUIZ = '11111111-1111-4111-8111-111111111111';
const HIDDEN = '22222222-2222-4222-8222-222222222222';
const ACT = '33333333-3333-4333-8333-333333333333';
const PAST = '44444444-4444-4444-8444-444444444444';

let db;
const rpc = (sql, params) => db.query(sql, params).then(r => Object.values(r.rows[0] ?? {})[0]);

before(async () => {
  if (!PGlite) return;
  db = await freshDb(PGlite);
  await migrate(db);
  await db.exec(`
    insert into engage.quizzes (id, subject_id, week, title, time_limit_min, max_attempts, opens_at, closes_at, status)
    values ('${QUIZ}', 'BSC111', 1, 'Limits', 10, 2, now() - interval '1 day', now() + interval '1 day', 'published'),
           ('${HIDDEN}', 'BSC111', 2, 'Other group only', 10, 2, now() - interval '1 day', now() + interval '1 day', 'published');
    update engage.quizzes set audience_group = 'Group Z' where id = '${HIDDEN}';
    insert into engage.quiz_questions (quiz_id, position, text, options, answer, explanation) values
      ('${QUIZ}', 1, 'Q1', '[{"id":"a","text":"0"},{"id":"b","text":"4"}]', 'b', 'why 1'),
      ('${QUIZ}', 2, 'Q2', '[{"id":"a","text":"1"},{"id":"b","text":"0"}]', 'a', 'why 2'),
      ('${QUIZ}', 3, 'Q3', '[{"id":"a","text":"x"},{"id":"b","text":"y"}]', 'a', null),
      ('${QUIZ}', 4, 'Q4', '[{"id":"a","text":"x"},{"id":"b","text":"y"}]', 'b', null);
    insert into engage.activities (id, kind, title, starts_at, capacity, xp, status) values
      ('${ACT}', 'workshop', 'CAD workshop', now() + interval '3 days', 1, 30, 'published'),
      ('${PAST}', 'event', 'Safety talk', now() - interval '2 days', 50, 20, 'published');
    insert into engage.activity_participants (activity_id, user_id) values ('${PAST}', '${A}'), ('${PAST}', '${B}');`);
});

const qids = async () => (await db.query(`select id, answer from engage.quiz_questions where quiz_id = '${QUIZ}' order by position`)).rows;

test('only approved students take part; signed-in non-students and anon are refused', { skip }, async () => {
  await assert.rejects(as(db, NOPROFILE, () => db.query('select public.list_quizzes()')), /no approved student profile/);
  await assert.rejects(asRole(db, 'anon', () => db.query('select public.list_quizzes()')), /permission denied/);
});

test('answer keys never leave the database before submission', { skip }, async () => {
  const quiz = await as(db, A, () => rpc(`select public.get_quiz('${QUIZ}')`));
  assert.equal(JSON.stringify(quiz).includes('"answer"'), false);
  assert.equal(JSON.stringify(quiz).includes('why 1'), false, 'no explanations before submission');
  await assert.rejects(as(db, A, () => db.query('select * from engage.quiz_questions')), /permission denied/);
  const list = await as(db, A, () => rpc('select public.list_quizzes()'));
  assert.deepEqual(list.map(q => q.id), [QUIZ], 'a quiz for another group is not listed');
  await assert.rejects(as(db, A, () => rpc(`select public.get_quiz('${HIDDEN}')`)), /quiz not found/);
});

test('scoring is server-side; first finish + improvement only; replay and limit are refused', { skip }, async () => {
  const ids = await qids();
  const half = { [ids[0].id]: ids[0].answer, [ids[1].id]: ids[1].answer, [ids[2].id]: 'b', [ids[3].id]: 'a' };   // 50%
  const a1 = await as(db, A, () => rpc(`select public.start_quiz_attempt('${QUIZ}')`));
  assert.equal(JSON.stringify(a1).includes('"answer"'), false);
  const r1 = await as(db, A, () => rpc('select public.submit_quiz_attempt($1, $2)', [a1.attempt_id, JSON.stringify(half)]));
  assert.deepEqual([r1.percent, r1.xp_awarded, r1.attempts_left], [50, 10 + 10, 1]);
  assert.equal(r1.review.length, 4, 'review is available after submission');
  // replaying the same attempt (even with better answers) is refused
  const all = Object.fromEntries(ids.map(q => [q.id, q.answer]));
  await assert.rejects(as(db, A, () => rpc('select public.submit_quiz_attempt($1, $2)', [a1.attempt_id, JSON.stringify(all)])), /already submitted/);
  // the browser can't hand in a score: unknown keys are ignored, only answers count
  const a2 = await as(db, A, () => rpc(`select public.start_quiz_attempt('${QUIZ}')`));
  const r2 = await as(db, A, () => rpc('select public.submit_quiz_attempt($1, $2)', [a2.attempt_id, JSON.stringify({ ...all, percent: 100, xp: 999 })]));
  assert.deepEqual([r2.percent, r2.xp_awarded], [100, 10], 'only the improvement (50% → 100%) is paid');
  await assert.rejects(as(db, A, () => rpc(`select public.start_quiz_attempt('${QUIZ}')`)), /attempt limit reached/);
  const p = await as(db, A, () => rpc('select public.get_my_progress()'));
  assert.equal(Number(p.xp), 30);
});

test("a student can't touch another student's attempt", { skip }, async () => {
  const b1 = await as(db, B, () => rpc(`select public.start_quiz_attempt('${QUIZ}')`));
  await assert.rejects(as(db, A, () => rpc('select public.submit_quiz_attempt($1, $2)', [b1.attempt_id, '{}'])), /attempt not found/);
  await assert.rejects(as(db, A, () => db.query('select * from engage.quiz_attempts')), /permission denied/);
});

test('late submissions are refused (deadline is the server clock)', { skip }, async () => {
  const C = uid(5);
  const c1 = await as(db, C, () => rpc(`select public.start_quiz_attempt('${QUIZ}')`));
  await db.exec(`update engage.quiz_attempts set deadline_at = now() - interval '5 minutes' where id = '${c1.attempt_id}'`);
  await assert.rejects(as(db, C, () => rpc('select public.submit_quiz_attempt($1, $2)', [c1.attempt_id, '{}'])), /time limit passed/);
});

test('XP cannot be created or changed from the client', { skip }, async () => {
  await assert.rejects(as(db, A, () => db.query(`insert into engage.xp_events (user_id, type, amount, idempotency_key) values ('${A}', 'adjustment', 200, 'x')`)), /permission denied/);
  await assert.rejects(as(db, A, () => db.query(`update engage.xp_events set amount = 200`)), /permission denied/);
  await assert.rejects(as(db, A, () => db.query(`select engage.award('${A}', 'quiz_completed', null, null, 200)`)), /permission denied/);
  await assert.rejects(as(db, A, () => db.query(`select public.admin_adjust_xp('${A}', 200, 'free xp please')`)), /requires role/);
  await assert.rejects(as(db, A, () => db.query(`select public.confirm_attendance('${PAST}', array['${A}'::uuid])`)), /requires role/);
});

test('activity XP is paid once, only after the organiser confirms', { skip }, async () => {
  const before = Number((await as(db, B, () => rpc('select public.get_my_progress()'))).xp);
  assert.equal(await as(db, ADMIN, () => rpc(`select public.confirm_attendance('${PAST}', array['${B}'::uuid])`)), 1);
  assert.equal(await as(db, ADMIN, () => rpc(`select public.confirm_attendance('${PAST}', array['${B}'::uuid])`)), 0, 'second confirmation is a no-op');
  const after = Number((await as(db, B, () => rpc('select public.get_my_progress()'))).xp);
  assert.equal(after - before, 20);
});

test('activities: capacity and start time enforced; joining earns nothing', { skip }, async () => {
  await as(db, A, () => db.query(`select public.join_activity('${ACT}')`));
  await as(db, A, () => db.query(`select public.join_activity('${ACT}')`));        // idempotent
  await assert.rejects(as(db, B, () => db.query(`select public.join_activity('${ACT}')`)), /activity is full/);
  await assert.rejects(as(db, B, () => db.query(`select public.join_activity('${PAST}')`)), /already started/);
  const list = await as(db, A, () => rpc('select public.list_activities()'));
  assert.equal(list.find(a => a.id === ACT).completion, 'registered');
});

test('daily cap: at most 200 XP per student per day', { skip }, async () => {
  const D = uid(6);
  await as(db, D, () => db.query('select public.get_my_progress()'));               // registers as participant
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(await rpc(`select engage.award('${D}', 'activity_completed', gen_random_uuid(), null, 30)`));
  assert.equal(total, 200);
});

test('leaderboard: verified XP, shared ranks, short names only, opt-out respected', { skip }, async () => {
  const board = await as(db, A, () => rpc(`select public.get_leaderboard('university')`));
  const text = JSON.stringify(board);
  assert.doesNotMatch(text, /Example"|user_id|student_code|@|T00/, 'no full names, ids, codes or emails');
  assert.ok(board.rows.every(r => /^[^ ]+( [A-Z]\.)?$/.test(r.name)));
  const xs = board.rows.map(r => Number(r.xp));
  assert.deepEqual(xs, [...xs].sort((a, b) => b - a));
  for (let i = 1; i < board.rows.length; i++) if (xs[i] === xs[i - 1]) assert.equal(board.rows[i].rank, board.rows[i - 1].rank);
  await as(db, A, () => db.query('select public.set_leaderboard_opt_out(true)'));
  const after = await as(db, B, () => rpc(`select public.get_leaderboard('university')`));
  assert.ok(!after.rows.some(r => r.name === board.me.name && Number(r.xp) === Number(board.me.xp)) || after.size < board.size);
  assert.equal(after.size, board.size - 1);
});

test('levels match the frontend rule (25·(n−1)·n)', { skip }, async () => {
  for (const [xp, level] of [[0, 1], [49, 1], [50, 2], [149, 2], [150, 3], [300, 4]]) {
    assert.equal((await rpc(`select engage.level_info(${xp})`)).level, level, `xp ${xp}`);
  }
});

test('admin engagement RPCs are admin-only', { skip }, async () => {
  await assert.rejects(as(db, A, () => db.query('select public.admin_engagement_stats()')), /requires role/);
  const s = await as(db, ADMIN, () => rpc('select public.admin_engagement_stats()'));
  assert.ok(Number(s.quiz_attempts) >= 2);
  assert.doesNotMatch(JSON.stringify(s.top), /Example"/);
});
