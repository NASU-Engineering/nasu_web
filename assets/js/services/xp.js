// XP, levels and leaderboards — the rules. Pure functions.
//
// SERVER-AUTHORITATIVE DESIGN: in production these rules run in the database
// (see docs/ENGAGEMENT.md). The browser never sends an XP amount; it reports an
// action (e.g. "submitted quiz q1") and the server decides what, if anything, it
// is worth. The mock backend uses the same functions so the preview behaves
// like the real system will.

// Only these actions earn XP. Viewing pages, signing in or refreshing never do.
export const XP_RULES = {
  quiz_completed:     { amount: 10 },          // first completed attempt of a quiz, once
  quiz_score:         { perTenPercent: 2 },     // score bonus, up to 20 — only improvements on the best score count
  activity_completed: { defaultAmount: 30 },    // confirmed by the organiser, once per activity
};
export const DAILY_XP_CAP = 200; // anti-abuse ceiling per student per day

/** Total XP needed to reach `level` (1-based): 0, 50, 150, 300, 500, 750, … */
export const xpForLevel = level => 25 * (level - 1) * level;

/** { level, floor, next, progress (0–1) } for an XP total. */
export function levelFor(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (xpForLevel(level + 1) <= total) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, floor, next, progress: (total - floor) / (next - floor) };
}

/** Idempotency key: the same source can never be rewarded twice. */
export const eventKey = e => `${e.userId}:${e.type}:${e.sourceId}${e.variant ? `:${e.variant}` : ''}`;

const sameDay = (a, b) => String(a).slice(0, 10) === String(b).slice(0, 10);

/**
 * Applies one XP event to a ledger (array of awarded events) and returns
 * { ledger, awarded, reason }. Rejected events leave the ledger unchanged.
 *   reason: 'ok' | 'duplicate' | 'not_eligible' | 'daily_cap' | 'zero'
 */
export function applyXpEvent(ledger, event, { cap = DAILY_XP_CAP } = {}) {
  if (!XP_RULES[event.type]) return { ledger, awarded: 0, reason: 'not_eligible' };
  const key = eventKey(event);
  if (ledger.some(e => e.key === key)) return { ledger, awarded: 0, reason: 'duplicate' };
  const amount = Math.max(0, Math.floor(event.amount || 0));
  if (!amount) return { ledger, awarded: 0, reason: 'zero' };
  const today = ledger.filter(e => e.userId === event.userId && sameDay(e.at, event.at)).reduce((n, e) => n + e.amount, 0);
  const allowed = Math.min(amount, Math.max(0, cap - today));
  if (!allowed) return { ledger, awarded: 0, reason: 'daily_cap' };
  return { ledger: [...ledger, { ...event, key, amount: allowed }], awarded: allowed, reason: 'ok' };
}

/**
 * XP events a quiz attempt is worth. Participation is paid once; the score
 * bonus pays only the improvement over the previous best, so retakes can't farm XP.
 */
export function quizXpEvents({ userId, quizId, previousBestPercent = null, percent, at }) {
  const events = [];
  if (previousBestPercent == null) {
    events.push({ userId, type: 'quiz_completed', sourceId: quizId, amount: XP_RULES.quiz_completed.amount, at });
  }
  const bonus = p => Math.floor(Math.max(0, Math.min(100, p)) / 10) * XP_RULES.quiz_score.perTenPercent;
  const delta = bonus(percent) - (previousBestPercent == null ? 0 : bonus(previousBestPercent));
  if (delta > 0) events.push({ userId, type: 'quiz_score', sourceId: quizId, variant: `best-${Math.floor(percent)}`, amount: delta, at });
  return events;
}

/** XP total per user from a ledger. */
export function totals(ledger) {
  const m = new Map();
  for (const e of ledger) m.set(e.userId, (m.get(e.userId) || 0) + e.amount);
  return m;
}

/** "Sara M." — leaderboards never show full names. */
export const publicName = full => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

/**
 * Ranked leaderboard for a scope ('section' | 'group' | 'university').
 * Ties share a rank (1, 2, 2, 4). Students who opted out are excluded.
 * players: [{ userId, fullName, xp, group, section, optOut? }]
 */
export function leaderboard(players, { scope = 'section', me = null, limit = 20 } = {}) {
  const mine = players.find(p => p.userId === me);
  const inScope = players.filter(p => !p.optOut && (scope === 'university'
    || (scope === 'group' && mine && p.group === mine.group)
    || (scope === 'section' && mine && p.group === mine.group && p.section === mine.section)));
  const sorted = [...inScope].sort((a, b) => b.xp - a.xp || publicName(a.fullName).localeCompare(publicName(b.fullName)));
  let rank = 0;
  const ranked = sorted.map((p, i) => {
    if (i === 0 || p.xp !== sorted[i - 1].xp) rank = i + 1;
    return { rank, userId: p.userId, name: publicName(p.fullName), xp: p.xp, level: levelFor(p.xp).level, isMe: p.userId === me };
  });
  const top = ranked.slice(0, limit);
  const meRow = ranked.find(r => r.isMe);
  return { rows: top, me: meRow || null, meOutsideTop: Boolean(meRow && !top.includes(meRow)), size: ranked.length };
}
