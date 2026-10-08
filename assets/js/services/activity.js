// Activity monitoring model for the Admin Control Center. Pure functions.
//
// The only activity source today is the server-generated audit log. This module
// matches what the log ACTUALLY contains against the events we want to track,
// so the UI can say "recorded", "not seen yet" or "not collected" — and never
// invent data. Auth events and presence are not collected by the backend yet
// (proposal: docs/ACTIVITY_MONITORING.md).

// `collected: false` = no source exists yet; shown as "Not collected" unless the
// audit log turns out to contain matching actions.
export const TRACKED_EVENTS = [
  { id: 'auth.sign_in',      label: 'Successful sign-in',          match: /^(auth|session)\.(sign_?in|login)/i, collected: false },
  { id: 'auth.sign_out',     label: 'Sign-out / session end',      match: /^(auth|session)\.(sign_?out|logout|end|expired)/i, collected: false },
  { id: 'content.created',   label: 'Content created',             match: /^content\.(created|draft)/i },
  { id: 'content.file',      label: 'File uploaded',               match: /(upload|file)/i },
  { id: 'content.submitted', label: 'Submitted for review',        match: /^content\.submit/i },
  { id: 'content.approved',  label: 'Approved',                    match: /^content\.approv/i },
  { id: 'content.rejected',  label: 'Rejected',                    match: /^content\.reject/i },
  { id: 'content.published', label: 'Published',                   match: /^content\.publish/i },
  { id: 'role.changed',      label: 'Role granted or revoked',     match: /^role\./i },
  { id: 'scope.changed',     label: 'Editor scope changed',        match: /^scope\./i },
  { id: 'presence',          label: 'Online presence (heartbeat)', match: /^presence\./i, collected: false },
];

/**
 * Coverage of each tracked event in the given audit entries:
 * { ...event, status: 'recorded' | 'not_seen' | 'not_collected', count, lastAt }
 */
export function trackingCoverage(entries) {
  return TRACKED_EVENTS.map(ev => {
    const hits = (entries || []).filter(e => ev.match.test(e.action || ''));
    const lastAt = hits.map(e => e.createdAt).filter(Boolean).sort().pop() || null;
    const status = hits.length ? 'recorded' : ev.collected === false ? 'not_collected' : 'not_seen';
    return { ...ev, status, count: hits.length, lastAt };
  });
}

/** Distinct actions present in the entries: [{ action, count, lastAt }], most frequent first. */
export function observedActions(entries) {
  const map = new Map();
  for (const e of entries || []) {
    if (!e.action) continue;
    const row = map.get(e.action) || { action: e.action, count: 0, lastAt: null };
    row.count++;
    if (e.createdAt && (!row.lastAt || e.createdAt > row.lastAt)) row.lastAt = e.createdAt;
    map.set(e.action, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
}

const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Entries per local day for the last `days` days (oldest first): [{ day: 'YYYY-MM-DD', count }]. */
export function dailyCounts(entries, { days = 14, now = new Date() } = {}) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push({ day: dayKey(d), count: 0 });
  }
  const index = new Map(out.map((r, i) => [r.day, i]));
  for (const e of entries || []) {
    const at = new Date(e.createdAt);
    if (isNaN(at)) continue;
    const i = index.get(dayKey(at));
    if (i != null) out[i].count++;
  }
  return out;
}
