// The ONLY module views talk to. It hides which backend is in use and how the
// backend implements each step, so endpoints can change without touching views.
//
// Shapes returned (see docs/FRONTEND_API.md):
//   Session      { email, studentId }
//   Profile      { fullName, studentId, group, section }
//   Resource     { id, subjectId, category, title, url|null, format, addedAt, week|null, dueAt|null, placeholder? }
//   Announcement { id, title, body, subjectId|null, publishedAt, pinned, author, placeholder? }

import { CONFIG } from '../config.js';
import { toApiError } from './errors.js';
import * as mockBackend from './mock-backend.js';
import * as supabaseBackend from './supabase-backend.js';

const backend = CONFIG.backend === 'mock' ? mockBackend : supabaseBackend;

export const isDemoMode = backend === mockBackend;
// Real auth, sample course content (CONFIG.contentSource = 'mock').
export const usesSampleContent = !isDemoMode && CONFIG.contentSource !== 'supabase';

// Every call goes through here so errors always arrive as ApiError.
function wrap(context, fn) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (err) { throw toApiError(err, context); }
  };
}

/* ---------- auth events ---------- */

// Listeners receive 'signed_in' | 'signed_out'.
const authListeners = new Set();
function emitAuthChange(type) { authListeners.forEach(cb => cb(type)); }
backend.onAuthChange?.(emitAuthChange);

/* ---------- OAuth redirect handling ---------- */

const NEXT_KEY = 'nasu.auth.next';
const OAUTH_PARAMS = ['code', 'error', 'error_code', 'error_description', 'state'];

// The page the student comes back to after Microsoft: this page, no query, no hash.
const returnUrl = () => location.origin + location.pathname;

// OAuth results arrive in the query string (PKCE) — or, for some errors, the hash.
function readOAuthReturn() {
  const query = new URLSearchParams(location.search);
  const hash = location.hash.startsWith('#/') ? new URLSearchParams() : new URLSearchParams(location.hash.slice(1));
  const pick = k => query.get(k) || hash.get(k) || '';
  const params = Object.fromEntries(OAUTH_PARAMS.map(k => [k, pick(k)]));
  return params.code || params.error || params.error_code ? params : null;
}

function takeNext() {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return next;
  } catch { return null; }
}

export const api = {
  auth: {
    getSession: wrap('session', () => backend.getSession()),

    /** Sends the browser to NASU Microsoft sign-in. `next` = in-app route to return to. */
    startSignIn: wrap('sign-in', async ({ next } = {}) => {
      try {
        if (next) sessionStorage.setItem(NEXT_KEY, next);
        else sessionStorage.removeItem(NEXT_KEY);
      } catch { /* returning to the dashboard is fine */ }
      await backend.startSignIn({ redirectTo: returnUrl() });
    }),

    /** True when this page load is the return from Microsoft sign-in. */
    isSignInReturn: () => readOAuthReturn() !== null,

    /**
     * Finishes sign-in after the Microsoft redirect. Always strips the OAuth
     * parameters from the address bar first (codes must not linger in history).
     * Resolves to { next } — the route the student originally wanted, unvalidated.
     */
    completeSignIn: wrap('sign-in-return', async () => {
      const params = readOAuthReturn();
      history.replaceState(null, '', returnUrl() + '#/');
      const next = takeNext();
      await backend.completeSignIn(params);
      emitAuthChange('signed_in');
      return { next };
    }),

    signOut: wrap('sign-out', async () => {
      await backend.signOut();
      emitAuthChange('signed_out');
    }),

    onChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
  },

  profile: {
    getMine: wrap('profile', () => backend.getMyProfile()),
  },

  subjects: {
    list: wrap('subjects', () => backend.listSubjects()),
    get: wrap('subjects', id => backend.getSubject(id)),
  },

  resources: {
    listBySubject: wrap('resources', subjectId => backend.listResources({ subjectId })),
    recent: wrap('resources', (limit = 5) => backend.listResources({ limit })),
    search: wrap('resources', ({ query = '', subjectId = '', category = '' } = {}) =>
      backend.searchResources({ query: query.trim(), subjectId, category })),
  },

  announcements: {
    list: wrap('announcements', ({ subjectId = '', limit } = {}) => backend.listAnnouncements({ subjectId, limit })),
  },
};
