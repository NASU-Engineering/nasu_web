// Contract test: the REAL frontend adapters (supabase-engage.js, supabase-ops.js)
// against the REAL prepared RPCs in the isolated PGlite database. Proves the
// browser ↔ database shapes match, with real (synthetic) data — not mocks.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPGlite, freshDb, migrate, uid, ADMIN } from './harness.mjs';

globalThis.location ??= { href: 'http://example.test/', hostname: 'example.test', origin: 'http://example.test', pathname: '/', search: '', hash: '' };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const PGlite = await loadPGlite();
const skip = PGlite ? false : 'PGlite not installed (npm install)';
const A = uid(3);
const QUIZ = '11111111-1111-4111-8111-111111111111';

let db;
let caller = null;
const client = {
  async rpc(name, args = {}) {
    const keys = Object.keys(args);
    const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    const params = keys.map(k => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${caller || ''}', false); set role authenticated;`);
    try { return { data: (await db.query(sql, params)).rows[0]?.r ?? null, error: null }; }
    catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    finally { await db.exec('reset role;'); }
  },
};

let engage, ops, CONFIG;
before(async () => {
  if (!PGlite) return;
  db = await freshDb(PGlite);
  await migrate(db);
  await db.exec(`
    insert into engage.quizzes (id, subject_id, week, title, time_limit_min, max_attempts, opens_at, closes_at, status)
    values ('${QUIZ}', 'BSC111', 1, 'Limits', 10, 2, now() - interval '1 day', now() + interval '1 day', 'published');
    insert into engage.quiz_questions (quiz_id, position, text, options, answer) values
      ('${QUIZ}', 1, 'Q1', '[{"id":"a","text":"0"},{"id":"b","text":"4"}]', 'b'),
      ('${QUIZ}', 2, 'Q2', '[{"id":"a","text":"1"},{"id":"b","text":"0"}]', 'a');
    insert into engage.activities (kind, title, starts_at, capacity, xp, status) values ('workshop', 'CAD', now() + interval '2 days', 10, 30, 'published');`);
  ({ CONFIG } = await import('../../assets/js/config.js'));
  (await import('../../assets/js/services/supabase-client.js')).setSupabaseClientForTests(client);
  engage = await import('../../assets/js/services/supabase-engage.js');
  ops = await import('../../assets/js/services/supabase-ops.js');
});

test('engagement adapter ↔ RPCs: list, start, submit, progress, leaderboard', { skip }, async () => {
  CONFIG.features.engagement = true;
  caller = A;
  const quizzes = await engage.listQuizzes({ subjectId: 'math1' });
  assert.equal(quizzes.length, 1);
  assert.equal(quizzes[0].subjectId, 'math1', 'BSC111 maps back to the subject id');
  assert.equal(quizzes[0].canAttempt, 'ok');
  const quiz = await engage.getQuiz(QUIZ);
  assert.equal(quiz.questions.length, 2);
  const attempt = await engage.startQuiz(QUIZ);
  assert.ok(attempt.attemptId && attempt.startedAt && attempt.questions.length === 2);
  const answers = { [attempt.questions[0].id]: 'b', [attempt.questions[1].id]: 'b' };
  const result = await engage.submitQuiz(attempt.attemptId, answers);
  assert.deepEqual([result.correct, result.total, result.percent, result.xpAwarded, result.attemptsLeft], [1, 2, 50, 20, 1]);
  assert.equal(result.review[0].isCorrect, true);
  await assert.rejects(engage.submitQuiz(attempt.attemptId, answers), { code: 'conflict' }, 'replay → conflict in the UI');
  const progress = await engage.getProgress();
  assert.equal(progress.xp, 20);
  assert.equal(progress.quizzesCompleted, 1);
  assert.equal(progress.recent[0].title, 'Limits');
  const board = await engage.getLeaderboard({ scope: 'section' });
  assert.equal(board.me.xp, 20);
  assert.equal(board.me.isMe, true);
  const acts = await engage.listActivities();
  await engage.joinActivity(acts[0].id);
  assert.equal((await engage.listActivities())[0].completion, 'registered');
});

test('errors map to the UI codes (forbidden / backend_required)', { skip }, async () => {
  caller = uid(65);                                         // signed in, not an approved student
  await assert.rejects(engage.listQuizzes(), { code: 'forbidden' });
  caller = A;
  await assert.rejects(ops.getActivitySummary(), { code: 'forbidden' });
  CONFIG.features.engagement = false;
  await assert.rejects(engage.listQuizzes(), { code: 'backend_required' }, 'flag off → not live, no request');
});

test('ops adapter ↔ RPCs: presence, activity summary, applications review, integrity', { skip }, async () => {
  caller = A;
  await ops.recordPresence();
  caller = ADMIN;
  const s = await ops.getActivitySummary();
  assert.equal(Number(s.online_now), 1);
  const page = await ops.listApplications({ status: 'pending' });
  assert.ok(page.items.length >= 1 && page.items.every(a => a.status === 'pending'));
  const reviewed = await ops.reviewApplication(page.items.find(a => a.roster_match).id, { decision: 'approve' });
  assert.equal(reviewed.status, 'approved');
  const sum = await ops.getApplicationSummary();
  assert.equal(Number(sum.approved_total), 60);
  const integrity = await ops.getDataIntegritySummary();
  assert.equal(Number(integrity.approved_missing_phone), 2);
  const feed = await ops.listRecentActivity({ limit: 5 });
  assert.ok(feed.items.some(e => e.type === 'application.approved'));
});
