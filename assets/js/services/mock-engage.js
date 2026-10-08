// DEV/PREVIEW ONLY — mock Quizzes, Activities, XP and Leaderboards.
// Re-exported by mock-backend.js. The production backend has no engagement
// tables yet: supabase-engage.js answers 'backend_required' and the UI says
// "not live yet". All people and content here are fictional samples.

import { ApiError } from './errors.js';
import { applyXpEvent, quizXpEvents, levelFor, leaderboard, totals, XP_RULES } from './xp.js';
import { canAttempt, quizStatus, scoreAttempt, publicQuiz } from './quiz.js';

const SESSION_KEY = 'nasu.mock.session';
const ROLES_KEY = 'nasu.mock.roles';
const KEY = 'nasu.mock.engage.v1';
const memory = new Map();
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return memory.get(k) ?? null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { memory.set(k, v); } },
};
const delay = (ms = 200) => new Promise(r => setTimeout(r, ms));
const DAY = 864e5;
const at = days => new Date(Date.now() + days * DAY).toISOString();

function me() {
  const s = store.get(SESSION_KEY);
  if (!s) throw new ApiError('unauthenticated');
  return { id: s.userId || 'mock-user-0', fullName: s.fullName || 'Demo Student', group: s.group || 'Group A (sample)', section: s.section || 'Section 1' };
}

/* ---------- sample content ---------- */

const QUIZZES = [
  {
    id: 'q-math1-w1', subjectId: 'math1', week: 1, title: 'Limits — warm-up', timeLimitMin: 10, maxAttempts: 2,
    opensAt: at(-5), closesAt: at(6),
    questions: [
      { id: 'q1', text: 'lim (x→2) of (x² − 4)/(x − 2) equals…', options: [{ id: 'a', text: '0' }, { id: 'b', text: '2' }, { id: 'c', text: '4' }, { id: 'd', text: 'It does not exist' }], answer: 'c', explanation: 'Factor x² − 4 = (x − 2)(x + 2), cancel, then substitute x = 2.' },
      { id: 'q2', text: 'lim (x→0) of sin(x)/x equals…', options: [{ id: 'a', text: '0' }, { id: 'b', text: '1' }, { id: 'c', text: '∞' }, { id: 'd', text: 'π' }], answer: 'b', explanation: 'A standard limit; it follows from the squeeze theorem.' },
      { id: 'q3', text: 'lim (x→∞) of (3x + 1)/(x − 5) equals…', options: [{ id: 'a', text: '3' }, { id: 'b', text: '−1/5' }, { id: 'c', text: '0' }, { id: 'd', text: '∞' }], answer: 'a', explanation: 'Divide numerator and denominator by x; the ratio of leading coefficients is 3.' },
      { id: 'q4', text: 'A function is continuous at a point when…', options: [{ id: 'a', text: 'It is defined there' }, { id: 'b', text: 'The limit exists there' }, { id: 'c', text: 'The limit exists and equals the function value' }, { id: 'd', text: 'It is differentiable there' }], answer: 'c', explanation: 'All three: defined, the limit exists, and they are equal.' },
    ],
  },
  {
    id: 'q-stat-w2', subjectId: 'stat', week: 2, title: 'Free-body diagrams', timeLimitMin: 12, maxAttempts: 3,
    opensAt: at(-3), closesAt: at(9),
    questions: [
      { id: 'q1', text: 'A body is in equilibrium when…', options: [{ id: 'a', text: 'ΣF = 0 only' }, { id: 'b', text: 'ΣM = 0 only' }, { id: 'c', text: 'ΣF = 0 and ΣM = 0' }, { id: 'd', text: 'It is not moving' }], answer: 'c', explanation: 'Both the resultant force and the resultant moment must vanish.' },
      { id: 'q2', text: 'A smooth surface exerts a force that is…', options: [{ id: 'a', text: 'Parallel to the surface' }, { id: 'b', text: 'Normal to the surface' }, { id: 'c', text: 'At 45°' }, { id: 'd', text: 'Zero' }], answer: 'b', explanation: 'With no friction only the normal reaction remains.' },
      { id: 'q3', text: 'A fixed support in 2D provides how many reactions?', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }, { id: 'c', text: '3' }, { id: 'd', text: '4' }], answer: 'c', explanation: 'Two force components and one moment.' },
      { id: 'q4', text: 'A pin support in 2D provides…', options: [{ id: 'a', text: 'Two force components' }, { id: 'b', text: 'One force and one moment' }, { id: 'c', text: 'Only a moment' }, { id: 'd', text: 'Nothing' }], answer: 'a', explanation: 'A pin resists translation in both directions but not rotation.' },
    ],
  },
  {
    id: 'q-chem-w1', subjectId: 'chem', week: 1, title: 'Stoichiometry check', timeLimitMin: 8, maxAttempts: 1,
    opensAt: at(-9), closesAt: at(-1),
    questions: [
      { id: 'q1', text: 'Moles in 18 g of water (M = 18 g/mol)?', options: [{ id: 'a', text: '0.5' }, { id: 'b', text: '1' }, { id: 'c', text: '2' }, { id: 'd', text: '18' }], answer: 'b', explanation: 'n = m / M = 18 / 18 = 1 mol.' },
      { id: 'q2', text: 'Avogadro’s number is approximately…', options: [{ id: 'a', text: '6.02 × 10²³' }, { id: 'b', text: '3.00 × 10⁸' }, { id: 'c', text: '9.81' }, { id: 'd', text: '1.60 × 10⁻¹⁹' }], answer: 'a', explanation: 'Particles per mole.' },
      { id: 'q3', text: 'In 2H₂ + O₂ → 2H₂O, the H₂ : O₂ mole ratio is…', options: [{ id: 'a', text: '1 : 1' }, { id: 'b', text: '1 : 2' }, { id: 'c', text: '2 : 1' }, { id: 'd', text: '2 : 2' }], answer: 'c', explanation: 'Read it from the balanced coefficients.' },
      { id: 'q4', text: 'The limiting reagent is the reactant that…', options: [{ id: 'a', text: 'Is in excess' }, { id: 'b', text: 'Runs out first' }, { id: 'c', text: 'Has the largest mass' }, { id: 'd', text: 'Is a catalyst' }], answer: 'b', explanation: 'It limits how much product can form.' },
    ],
  },
  {
    id: 'q-vib-w3', subjectId: 'vib', week: 3, title: 'Simple harmonic motion', timeLimitMin: 10, maxAttempts: 2,
    opensAt: at(2), closesAt: at(12),
    questions: [
      { id: 'q1', text: 'The period of a mass–spring system depends on…', options: [{ id: 'a', text: 'Amplitude' }, { id: 'b', text: 'Mass and spring constant' }, { id: 'c', text: 'Gravity' }, { id: 'd', text: 'Phase' }], answer: 'b', explanation: 'T = 2π√(m/k).' },
    ],
  },
];

const ACTIVITIES = [
  { id: 'act-cad', kind: 'workshop', title: 'Intro to CAD workshop', startsAt: at(6), location: 'Lab B2', capacity: 30, participants: 18, xp: 30 },
  { id: 'act-bridge', kind: 'competition', title: 'Spaghetti bridge challenge', startsAt: at(14), location: 'Main hall', capacity: 60, participants: 41, xp: 50 },
  { id: 'act-robotics', kind: 'club', title: 'Robotics club open day', startsAt: at(3), location: 'Workshop 1', capacity: 40, participants: 40, xp: 20 },
  { id: 'act-safety', kind: 'event', title: 'Lab safety talk', startsAt: at(-4), location: 'Lecture hall 3', capacity: 120, participants: 96, xp: 20 },
  { id: 'act-orientation', kind: 'event', title: 'Freshmen orientation volunteers', startsAt: at(-10), location: 'Campus', capacity: 25, participants: 25, xp: 40 },
];

// Classmates for the leaderboard (fictional). XP is a starting total.
const PLAYERS = [
  ['p01', 'Mariam Adel', 'Group A (sample)', 'Section 1', 212], ['p02', 'Youssef Hany', 'Group A (sample)', 'Section 1', 188],
  ['p03', 'Nour Samir', 'Group A (sample)', 'Section 1', 160], ['p04', 'Karim Tarek', 'Group A (sample)', 'Section 1', 96],
  ['p05', 'Salma Ihab', 'Group A (sample)', 'Section 1', 44], ['p06', 'Karim Fathy', 'Group A (sample)', 'Section 2', 240],
  ['p07', 'Habiba Walid', 'Group A (sample)', 'Section 2', 131], ['p08', 'Ziad Ashraf', 'Group A (sample)', 'Section 3', 175],
  ['p09', 'Malak Hesham', 'Group B (sample)', 'Section 4', 305], ['p10', 'Adham Reda', 'Group B (sample)', 'Section 4', 150],
  ['p11', 'Farida Nabil', 'Group B (sample)', 'Section 5', 260], ['p12', 'Hassan Magdy', 'Group B (sample)', 'Section 6', 90],
].map(([userId, fullName, group, section, xp]) => ({ userId, fullName, group, section, baseXp: xp, optOut: false }));

/* ---------- per-tab state ---------- */

function seed(user) {
  // The current student already took the closed chemistry quiz and attended the safety talk.
  let ledger = [];
  for (const e of quizXpEvents({ userId: user.id, quizId: 'q-chem-w1', previousBestPercent: null, percent: 75, at: at(-2) })) ledger = applyXpEvent(ledger, e).ledger;
  ledger = applyXpEvent(ledger, { userId: user.id, type: 'activity_completed', sourceId: 'act-safety', amount: 20, at: at(-4) }).ledger;
  return {
    user: user.id,
    attempts: { 'q-chem-w1': [{ at: at(-2), correct: 3, total: 4, percent: 75, xpAwarded: 24, review: null }] },
    ledger,
    joined: { 'act-safety': true, 'act-orientation': true },
    confirmed: { 'act-safety': true }, // attendance confirmed by the organiser
  };
}

function state() {
  const user = me();
  // One slot per mock user, so switching simulator personas keeps each one's progress.
  let s = store.get(`${KEY}:${user.id}`);
  if (!s) { s = seed(user); store.set(`${KEY}:${user.id}`, s); }
  return { s, user };
}
const save = s => store.set(`${KEY}:${s.user}`, s);

const quizById = id => { const q = QUIZZES.find(x => x.id === id); if (!q) throw new ApiError('not_found'); return q; };
const titleOf = e => (QUIZZES.find(q => q.id === e.sourceId) || ACTIVITIES.find(a => a.id === e.sourceId))?.title || e.sourceId;

function quizSummary(q, s) {
  const attempts = s.attempts[q.id] || [];
  const best = attempts.length ? Math.max(...attempts.map(a => a.percent)) : null;
  return {
    id: q.id, subjectId: q.subjectId, week: q.week, title: q.title, timeLimitMin: q.timeLimitMin, maxAttempts: q.maxAttempts,
    opensAt: q.opensAt, closesAt: q.closesAt, questionCount: q.questions.length,
    status: quizStatus(q), attemptsUsed: attempts.length, bestPercent: best,
    canAttempt: canAttempt(q, attempts.length).reason,
    xpAvailable: XP_RULES.quiz_completed.amount + 10 * XP_RULES.quiz_score.perTenPercent,
  };
}

function players(s, user) {
  const mine = totals(s.ledger).get(user.id) || 0;
  return [...PLAYERS.map(p => ({ ...p, xp: p.baseXp })), { userId: user.id, fullName: user.fullName, group: user.group, section: user.section, xp: mine }];
}

/* ---------- student API ---------- */

export async function getProgress() {
  await delay();
  const { s, user } = state();
  const xp = totals(s.ledger).get(user.id) || 0;
  const all = players(s, user);
  const rank = scope => leaderboard(all, { scope, me: user.id }).me?.rank ?? null;
  return {
    xp, ...levelFor(xp),
    ranks: { section: rank('section'), group: rank('group'), university: rank('university') },
    quizzesCompleted: Object.keys(s.attempts).length,
    activitiesCompleted: Object.keys(s.confirmed).length,
    recent: [...s.ledger].filter(e => e.userId === user.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
      .map(e => ({ type: e.type, sourceId: e.sourceId, title: titleOf(e), amount: e.amount, at: e.at })),
  };
}

export async function listQuizzes({ subjectId } = {}) {
  await delay();
  const { s } = state();
  return QUIZZES.filter(q => !subjectId || q.subjectId === subjectId).map(q => quizSummary(q, s));
}

export async function getQuiz(id) {
  await delay();
  const { s } = state();
  const q = quizById(id);
  const attempts = s.attempts[id] || [];
  return { ...quizSummary(q, s), questions: publicQuiz(q).questions, attempts: attempts.map(({ review, ...a }) => a), lastResult: attempts.at(-1) || null };
}

export async function submitQuiz(id, answers) {
  await delay(400);
  const { s, user } = state();
  const q = quizById(id);
  const attempts = s.attempts[id] || [];
  const gate = canAttempt(q, attempts.length);
  if (!gate.ok) throw new ApiError('conflict', `mock: ${gate.reason}`);
  const result = scoreAttempt(q, answers);
  const previousBest = attempts.length ? Math.max(...attempts.map(a => a.percent)) : null;
  const now = new Date().toISOString();
  let xpAwarded = 0;
  for (const e of quizXpEvents({ userId: user.id, quizId: id, previousBestPercent: previousBest, percent: result.percent, at: now })) {
    const r = applyXpEvent(s.ledger, e);
    s.ledger = r.ledger;
    xpAwarded += r.awarded;
  }
  const attempt = { at: now, correct: result.correct, total: result.total, percent: result.percent, xpAwarded, review: result.review };
  s.attempts[id] = [...attempts, attempt];
  save(s);
  return { ...attempt, attemptNumber: attempts.length + 1, attemptsLeft: Math.max(0, q.maxAttempts - attempts.length - 1), questions: publicQuiz(q).questions };
}

export async function listActivities() {
  await delay();
  const { s } = state();
  const now = Date.now();
  return ACTIVITIES.map(a => {
    const past = Date.parse(a.startsAt) < now;
    const joined = Boolean(s.joined[a.id]);
    return {
      ...a, participants: a.participants + (joined && !past ? 1 : 0), joined, past,
      completion: !joined ? null : s.confirmed[a.id] ? 'completed' : past ? 'not_confirmed' : 'registered',
      full: !joined && a.participants >= a.capacity,
    };
  }).sort((x, y) => (x.past - y.past) || (x.past ? y.startsAt.localeCompare(x.startsAt) : x.startsAt.localeCompare(y.startsAt)));
}

export async function joinActivity(id) {
  await delay(300);
  const { s } = state();
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a) throw new ApiError('not_found');
  if (Date.parse(a.startsAt) < Date.now()) throw new ApiError('conflict', 'mock: activity already happened');
  if (a.participants >= a.capacity && !s.joined[id]) throw new ApiError('conflict', 'mock: full');
  s.joined[id] = true;
  save(s);
}

export async function leaveActivity(id) {
  await delay(300);
  const { s } = state();
  const a = ACTIVITIES.find(x => x.id === id);
  if (!a || Date.parse(a.startsAt) < Date.now()) throw new ApiError('conflict');
  delete s.joined[id];
  save(s);
}

export async function getLeaderboard({ scope = 'section' } = {}) {
  await delay();
  const { s, user } = state();
  return leaderboard(players(s, user), { scope, me: user.id, limit: 10 });
}

/* ---------- admin (mock) ---------- */

function requireAdmin() {
  me();
  const roles = store.get(ROLES_KEY) ?? ['student', 'section_editor', 'content_manager', 'admin'];
  if (!roles.includes('admin')) throw new ApiError('forbidden');
}

export async function adminListQuizzes() {
  await delay();
  requireAdmin();
  return QUIZZES.map(q => ({ id: q.id, subjectId: q.subjectId, week: q.week, title: q.title, status: quizStatus(q), questionCount: q.questions.length, maxAttempts: q.maxAttempts, opensAt: q.opensAt, closesAt: q.closesAt }));
}

export async function adminListActivities() {
  await delay();
  requireAdmin();
  return ACTIVITIES.map(a => ({ ...a, past: Date.parse(a.startsAt) < Date.now() }));
}

export async function adminEngagementStats() {
  await delay();
  requireAdmin();
  const { s, user } = state();
  const all = players(s, user);
  return {
    students_with_xp: all.filter(p => p.xp > 0).length,
    xp_total: all.reduce((n, p) => n + p.xp, 0),
    quiz_attempts: Object.values(s.attempts).reduce((n, a) => n + a.length, 0) + 37,
    activity_participants: ACTIVITIES.reduce((n, a) => n + a.participants, 0),
    top: leaderboard(all, { scope: 'university', limit: 5 }).rows,
  };
}

export function resetMockEngagement() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(KEY)) sessionStorage.removeItem(k);
    }
  } catch { /* memory only */ }
  for (const k of [...memory.keys()]) if (k.startsWith(KEY)) memory.delete(k);
}
