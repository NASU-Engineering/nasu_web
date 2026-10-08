// Quiz attempt rules — pure functions.
//
// In production the server scores attempts: correct answers are never sent to
// the browser before submission (docs/ENGAGEMENT.md). The mock backend uses
// these same functions.

/** Can the student start an attempt? → { ok, reason: 'ok' | 'not_open' | 'closed' | 'limit' } */
export function canAttempt(quiz, attemptsUsed, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (quiz.opensAt && Date.parse(quiz.opensAt) > t) return { ok: false, reason: 'not_open' };
  if (quiz.closesAt && Date.parse(quiz.closesAt) < t) return { ok: false, reason: 'closed' };
  if (quiz.maxAttempts && attemptsUsed >= quiz.maxAttempts) return { ok: false, reason: 'limit' };
  return { ok: true, reason: 'ok' };
}

/** Quiz state for listings: 'upcoming' | 'open' | 'closed'. */
export function quizStatus(quiz, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (quiz.opensAt && Date.parse(quiz.opensAt) > t) return 'upcoming';
  if (quiz.closesAt && Date.parse(quiz.closesAt) < t) return 'closed';
  return 'open';
}

/**
 * Scores an attempt. `answers` = { [questionId]: optionId }. Unanswered = wrong.
 * → { correct, total, percent, review: [{ questionId, chosen, correctOptionId, isCorrect, explanation }] }
 */
export function scoreAttempt(quiz, answers = {}) {
  const review = quiz.questions.map(q => {
    const chosen = answers[q.id] ?? null;
    return { questionId: q.id, chosen, correctOptionId: q.answer, isCorrect: chosen === q.answer, explanation: q.explanation || '' };
  });
  const correct = review.filter(r => r.isCorrect).length;
  const total = quiz.questions.length;
  return { correct, total, percent: total ? Math.round((correct / total) * 100) : 0, review };
}

/** The quiz as the student may see it before submitting: no answers, no explanations. */
export function publicQuiz(quiz) {
  return { ...quiz, questions: quiz.questions.map(({ answer, explanation, ...q }) => q) };
}
