// Supabase adapter for Quizzes, Activities, XP and Leaderboards.
//
// The RPCs are PREPARED, NOT APPLIED: supabase/prepared/20261010_03_engagement.sql
// (design: docs/ENGAGEMENT.md). Production keeps CONFIG.features.engagement = false,
// so every call answers 'backend_required' without a request and the UI shows
// "not live yet". With the flag on (staging), a missing RPC (PGRST202) also maps
// to 'backend_required'. Nothing is ever invented or taken from the mock.
//
// The server decides everything that matters: attempt windows and limits,
// scores (answers never reach the browser before submission), XP and ranks.
// Re-exported by supabase-backend.js.

import { CONFIG } from '../config.js';
import { ApiError } from './errors.js';
import { getSupabase } from './supabase-client.js';
import { toWorkspaceError } from './supabase-workspace.js';
import { subjectCodeFor, subjectIdFrom } from '../data/catalog.js';

export const ENGAGE_RPC = {
  progress: 'get_my_progress',
  listQuizzes: 'list_quizzes',
  getQuiz: 'get_quiz',
  startQuiz: 'start_quiz_attempt',
  submitQuiz: 'submit_quiz_attempt',
  listActivities: 'list_activities',
  joinActivity: 'join_activity',
  leaveActivity: 'leave_activity',
  leaderboard: 'get_leaderboard',
  adminQuizzes: 'admin_list_quizzes',
  adminActivities: 'admin_list_activities',
  adminStats: 'admin_engagement_stats',
};

export const engagementEnabled = () => CONFIG.features?.engagement === true;

async function rpc(name, args) {
  if (!engagementEnabled()) throw new ApiError('backend_required', name);
  const sb = await getSupabase();
  const { data, error } = args === undefined ? await sb.rpc(name) : await sb.rpc(name, args);
  if (error) throw toWorkspaceError(error, name);
  return data;
}

/* ---------- row mapping (snake_case jsonb → the shapes the views use) ---------- */

const subjectOf = code => subjectIdFrom(code) || code || '';

export const mapQuiz = q => q && ({
  id: q.id, subjectId: subjectOf(q.subject_id), week: q.week, title: q.title,
  timeLimitMin: q.time_limit_min, maxAttempts: q.max_attempts, opensAt: q.opens_at, closesAt: q.closes_at,
  questionCount: q.question_count, status: q.status, attemptsUsed: q.attempts_used ?? 0,
  bestPercent: q.best_percent ?? null, canAttempt: q.can_attempt || 'ok', xpAvailable: q.xp_available ?? null,
});
const mapQuestion = q => ({ id: q.id, text: q.text, options: q.options || [] });
const mapReview = r => ({ questionId: r.question_id, chosen: r.chosen ?? null, correctOptionId: r.correct_option_id, isCorrect: Boolean(r.is_correct), explanation: r.explanation || '' });
export const mapResult = r => r && ({
  at: r.submitted_at, correct: r.correct, total: r.total, percent: r.percent, xpAwarded: r.xp_awarded ?? 0,
  review: Array.isArray(r.review) ? r.review.map(mapReview) : null,
  attemptNumber: r.attempt_no ?? null, attemptsLeft: r.attempts_left ?? null,
});
const mapActivity = a => ({
  id: a.id, kind: a.kind, title: a.title, startsAt: a.starts_at, location: a.location || '', capacity: a.capacity,
  participants: a.participants, xp: a.xp, joined: Boolean(a.joined), past: Boolean(a.past),
  completion: a.completion || null, full: Boolean(a.full),
});
const mapBoardRow = r => r && ({ rank: r.rank, name: r.name, xp: r.xp, level: r.level, isMe: Boolean(r.is_me) });

/* ---------- student ---------- */

export async function getProgress() {
  const p = await rpc(ENGAGE_RPC.progress);
  return {
    xp: p.xp, level: p.level, floor: p.floor, next: p.next, progress: p.progress,
    ranks: p.ranks || { section: null, group: null, university: null },
    quizzesCompleted: p.quizzes_completed ?? 0, activitiesCompleted: p.activities_completed ?? 0,
    recent: (p.recent || []).map(e => ({ type: e.type, sourceId: e.source_id, title: e.title, amount: e.amount, at: e.at })),
  };
}

export async function listQuizzes({ subjectId } = {}) {
  return ((await rpc(ENGAGE_RPC.listQuizzes, { p_subject_id: subjectId ? subjectCodeFor(subjectId) : null })) || []).map(mapQuiz);
}

export async function getQuiz(id) {
  const q = await rpc(ENGAGE_RPC.getQuiz, { p_quiz_id: id });
  if (!q) throw new ApiError('not_found');
  return { ...mapQuiz(q), questions: (q.questions || []).map(mapQuestion), lastResult: mapResult(q.last_result) };
}

export async function startQuiz(id) {
  const a = await rpc(ENGAGE_RPC.startQuiz, { p_quiz_id: id });
  return { attemptId: a.attempt_id, startedAt: a.started_at, timeLimitMin: a.time_limit_min, questions: (a.questions || []).map(mapQuestion) };
}

export async function submitQuiz(attemptId, answers) {
  return mapResult(await rpc(ENGAGE_RPC.submitQuiz, { p_attempt_id: attemptId, p_answers: answers || {} }));
}

export async function listActivities() {
  return ((await rpc(ENGAGE_RPC.listActivities)) || []).map(mapActivity);
}
export const joinActivity = id => rpc(ENGAGE_RPC.joinActivity, { p_activity_id: id });
export const leaveActivity = id => rpc(ENGAGE_RPC.leaveActivity, { p_activity_id: id });

export async function getLeaderboard({ scope = 'section' } = {}) {
  const b = await rpc(ENGAGE_RPC.leaderboard, { p_scope: scope });
  return { rows: (b.rows || []).map(mapBoardRow), me: mapBoardRow(b.me), meOutsideTop: Boolean(b.me_outside_top), size: b.size ?? 0 };
}

/* ---------- admin ---------- */

export async function adminListQuizzes() {
  return ((await rpc(ENGAGE_RPC.adminQuizzes)) || []).map(mapQuiz);
}
export async function adminListActivities() {
  return ((await rpc(ENGAGE_RPC.adminActivities)) || []).map(mapActivity);
}
export async function adminEngagementStats() {
  const s = await rpc(ENGAGE_RPC.adminStats);
  return { ...s, top: (s.top || []).map(mapBoardRow) };
}
