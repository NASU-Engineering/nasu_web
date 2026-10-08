// Supabase adapter for Quizzes, Activities, XP and Leaderboards — NOT LIVE.
// No engagement tables or RPCs exist yet (proposal: docs/ENGAGEMENT.md).
// Every call answers 'backend_required' so the UI shows "not live yet" instead
// of pretending; nothing is invented. Re-exported by supabase-backend.js.

import { ApiError } from './errors.js';

const notLive = contract => async () => { throw new ApiError('backend_required', contract); };

export const getProgress = notLive('get_my_progress');
export const listQuizzes = notLive('list_quizzes');
export const getQuiz = notLive('get_quiz');
export const submitQuiz = notLive('submit_quiz_attempt');
export const listActivities = notLive('list_activities');
export const joinActivity = notLive('join_activity');
export const leaveActivity = notLive('leave_activity');
export const getLeaderboard = notLive('get_leaderboard');
export const adminListQuizzes = notLive('admin_list_quizzes');
export const adminListActivities = notLive('admin_list_activities');
export const adminEngagementStats = notLive('admin_engagement_stats');
