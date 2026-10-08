// XP, levels, leaderboards, quiz rules and the mock engagement backend.
// The rules are the design for the server-side implementation (docs/ENGAGEMENT.md);
// the mock uses the same functions. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.sessionStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
globalThis.location ??= { href: 'http://example.test/', hostname: 'example.test', origin: 'http://example.test', pathname: '/', search: '', hash: '' };
globalThis.fetch = async () => ({ ok: false });

const xp = await import('../assets/js/services/xp.js');
const quiz = await import('../assets/js/services/quiz.js');
const { api } = await import('../assets/js/services/api.js');

const DAY = '2026-10-09T10:00:00Z';
const ev = (type, sourceId, amount, extra = {}) => ({ userId: 'u1', type, sourceId, amount, at: DAY, ...extra });

/* ---------- XP rules ---------- */

test('XP: only listed actions earn XP; the same source is never rewarded twice', () => {
  let r = xp.applyXpEvent([], ev('page_view', 'dashboard', 5));
  assert.equal(r.reason, 'not_eligible', 'viewing or refreshing pages earns nothing');
  r = xp.applyXpEvent([], ev('quiz_completed', 'q1', 10));
  assert.equal(r.awarded, 10);
  const again = xp.applyXpEvent(r.ledger, ev('quiz_completed', 'q1', 10));
  assert.equal(again.reason, 'duplicate');
  assert.equal(again.ledger, r.ledger, 'ledger unchanged');
  assert.equal(xp.eventKey(ev('quiz_score', 'q1', 4, { variant: 'best-80' })), 'u1:quiz_score:q1:best-80');
});

test('XP: daily cap trims and then refuses awards; a new day starts fresh', () => {
  let ledger = [];
  for (let i = 0; i < 6; i++) ledger = xp.applyXpEvent(ledger, ev('activity_completed', `a${i}`, 40)).ledger;
  assert.equal(xp.totals(ledger).get('u1'), xp.DAILY_XP_CAP);
  assert.equal(xp.applyXpEvent(ledger, ev('activity_completed', 'a9', 10)).reason, 'daily_cap');
  assert.equal(xp.applyXpEvent(ledger, ev('activity_completed', 'a9', 10, { at: '2026-10-10T08:00:00Z' })).awarded, 10);
});

test('XP: quiz retakes pay only the improvement over the best score', () => {
  const first = xp.quizXpEvents({ userId: 'u1', quizId: 'q1', previousBestPercent: null, percent: 50, at: DAY });
  assert.deepEqual(first.map(e => [e.type, e.amount]), [['quiz_completed', 10], ['quiz_score', 10]]);
  const worse = xp.quizXpEvents({ userId: 'u1', quizId: 'q1', previousBestPercent: 50, percent: 40, at: DAY });
  assert.deepEqual(worse, [], 'no XP for a lower or equal score');
  const better = xp.quizXpEvents({ userId: 'u1', quizId: 'q1', previousBestPercent: 50, percent: 100, at: DAY });
  assert.deepEqual(better.map(e => [e.type, e.amount]), [['quiz_score', 10]]);
});

test('levels: thresholds 0, 50, 150, 300 and progress within a level', () => {
  assert.deepEqual([1, 2, 3, 4].map(xp.xpForLevel), [0, 50, 150, 300]);
  assert.equal(xp.levelFor(0).level, 1);
  assert.equal(xp.levelFor(49).level, 1);
  assert.equal(xp.levelFor(50).level, 2);
  assert.equal(xp.levelFor(100).progress, 0.5);
  assert.equal(xp.levelFor(-5).level, 1);
});

test('leaderboard: scoped, ties share a rank, opt-outs hidden, names shortened', () => {
  const P = (userId, fullName, xpv, group = 'A', section = '1', optOut = false) => ({ userId, fullName, xp: xpv, group, section, optOut });
  const players = [P('me', 'Sara Mostafa', 80), P('b', 'Ali Hassan', 100), P('c', 'Mona Adel', 80), P('d', 'Hidden One', 500, 'A', '1', true), P('e', 'Other Group', 300, 'B', '4')];
  const section = xp.leaderboard(players, { scope: 'section', me: 'me' });
  assert.deepEqual(section.rows.map(r => [r.rank, r.name]), [[1, 'Ali H.'], [2, 'Mona A.'], [2, 'Sara M.']]);
  assert.equal(section.me.rank, 2);
  assert.equal(xp.leaderboard(players, { scope: 'university', me: 'me' }).rows[0].name, 'Other G.');
  const top1 = xp.leaderboard(players, { scope: 'section', me: 'me', limit: 1 });
  assert.equal(top1.meOutsideTop, true);
  assert.ok(!JSON.stringify(section).includes('Mostafa'), 'full names never leave the leaderboard function');
});

/* ---------- quiz rules ---------- */

const Q = { id: 'q', maxAttempts: 2, opensAt: '2026-10-01T00:00:00Z', closesAt: '2026-10-20T00:00:00Z',
  questions: [{ id: 'a', answer: 'x', explanation: 'e1' }, { id: 'b', answer: 'y', explanation: 'e2' }] };

test('quiz: attempt window and attempt limit', () => {
  assert.equal(quiz.canAttempt(Q, 0, new Date('2026-09-30T00:00:00Z')).reason, 'not_open');
  assert.equal(quiz.canAttempt(Q, 0, new Date('2026-10-21T00:00:00Z')).reason, 'closed');
  assert.equal(quiz.canAttempt(Q, 1, new Date(DAY)).ok, true);
  assert.equal(quiz.canAttempt(Q, 2, new Date(DAY)).reason, 'limit');
  assert.equal(quiz.quizStatus(Q, new Date(DAY)), 'open');
});

test('quiz: scoring counts unanswered as wrong; answers are hidden before submission', () => {
  const r = quiz.scoreAttempt(Q, { a: 'x' });
  assert.deepEqual([r.correct, r.total, r.percent], [1, 2, 50]);
  assert.equal(r.review[1].chosen, null);
  const pub = quiz.publicQuiz(Q);
  assert.ok(pub.questions.every(q => !('answer' in q) && !('explanation' in q)));
});

/* ---------- mock engagement backend via api.js (simulator) ---------- */

const ADMIN = { roles: ['student', 'admin'], scopes: [], available: true };

test('mock: a student takes a quiz; XP, attempts and the leaderboard update consistently', async () => {
  await api.sim.enter('student', ADMIN);
  const before = await api.engage.progress();
  assert.equal(before.xp, 44, 'seeded: chemistry 75% (10 + 14) and the safety talk (20)');
  const list = await api.engage.quizzes();
  const open = list.find(q => q.id === 'q-math1-w1');
  assert.equal(open.status, 'open');
  const full = await api.engage.quiz('q-math1-w1');
  assert.ok(full.questions.every(q => !('answer' in q)), 'mock never sends answers before submission');

  const r1 = await api.engage.submitQuiz('q-math1-w1', { q1: 'c', q2: 'b' }); // 50%
  assert.equal(r1.percent, 50);
  assert.equal(r1.xpAwarded, 20);
  assert.equal(r1.attemptsLeft, 1);
  const r2 = await api.engage.submitQuiz('q-math1-w1', { q1: 'c' }); // 25%: worse
  assert.equal(r2.xpAwarded, 0, 'no XP for a worse retake');
  await assert.rejects(api.engage.submitQuiz('q-math1-w1', {}), { code: 'conflict' }, 'attempt limit enforced');
  await assert.rejects(api.engage.submitQuiz('q-chem-w1', {}), { code: 'conflict' }, 'closed quiz refused');

  const after = await api.engage.progress();
  assert.equal(after.xp, 64);
  const board = await api.engage.leaderboard({ scope: 'section' });
  assert.equal(board.me.xp, 64);
  await api.sim.exit();
});

test('mock: activities join/leave; full and past activities refuse new joins', async () => {
  await api.sim.enter('student', ADMIN);
  const list = await api.engage.activities();
  const full = list.find(a => a.id === 'act-robotics');
  assert.equal(full.full, true);
  await assert.rejects(api.engage.joinActivity('act-robotics'), { code: 'conflict' });
  await assert.rejects(api.engage.joinActivity('act-safety'), { code: 'conflict' }, 'past activity');
  await api.engage.joinActivity('act-cad');
  assert.equal((await api.engage.activities()).find(a => a.id === 'act-cad').completion, 'registered', 'joining earns no XP until attendance is confirmed');
  await api.engage.leaveActivity('act-cad');
  assert.equal((await api.engage.activities()).find(a => a.id === 'act-cad').joined, false);
  await api.sim.exit();
});

test('production engagement adapter is honest: every call answers backend_required', async () => {
  const live = await import('../assets/js/services/supabase-engage.js');
  for (const [name, fn] of Object.entries(live)) {
    if (typeof fn !== 'function') continue;
    await assert.rejects(fn(), { code: 'backend_required' }, name);
  }
  const src = readFileSync(new URL('../assets/js/services/supabase-engage.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.rpc\(|\.from\(/, 'no engagement tables or RPCs are called before they exist');
});
