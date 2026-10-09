// Online presence: a light heartbeat from signed-in, visible tabs.
//
// The server (record_presence, migration 20261010_02) stores ONE row per user
// with the server's own timestamp, so several tabs count as one person and the
// browser can't claim a time. "Online now" = heartbeat within the last 2 minutes.
// Nothing about the page, keystrokes or content is sent — the call has no arguments.
//
// Off unless CONFIG.features.presence (or the mock preview). If the RPC doesn't
// exist yet, the first failure stops it for this session.

import { CONFIG } from '../config.js';
import { api, isDemoMode } from './api.js';

export const HEARTBEAT_MS = 60 * 1000;

let timer = null;
let disabled = false;
let active = false;

const enabled = () => !disabled && (isDemoMode || CONFIG.features?.presence === true);
const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

async function beat() {
  if (!active || !enabled() || !visible()) return;
  try { await api.presence.heartbeat(); }
  catch (err) {
    // Not deployed yet / not allowed: stop quietly. Network blips just wait for the next beat.
    if (['backend_required', 'forbidden', 'unauthenticated'].includes(err?.code)) stopPresence(true);
  }
}

/** Starts heartbeats for a signed-in session (idempotent). */
export function startPresence() {
  if (active || !enabled()) return;
  active = true;
  beat();
  timer = setInterval(beat, HEARTBEAT_MS);
}

/** Stops heartbeats (sign-out). `permanent` keeps them off until reload. */
export function stopPresence(permanent = false) {
  active = false;
  if (permanent) disabled = true;
  clearInterval(timer);
  timer = null;
}

// A tab coming back into view reports straight away instead of waiting a minute.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (active && visible()) beat(); });
}
