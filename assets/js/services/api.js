// The ONLY module views talk to. It hides which backend is in use and how the
// backend implements each step, so endpoints can change without touching views.
//
// Shapes returned (see docs/FRONTEND_API.md):
//   Session      { email, studentId }
//   Profile      { fullName, studentId, group, section }
//   Resource     { id, subjectId, category, title, url|null, format, addedAt, week|null, dueAt|null, placeholder? }
//   Announcement { id, title, body, subjectId|null, publishedAt, pinned, author, placeholder? }
//   Access       { roles, scopes, available }        (see docs/ROLE_DASHBOARDS.md for the rest)
//   ContentItem, Member, AuditEntry, Stats           — services/normalize-workspace.js

import { CONFIG } from '../config.js';
import { ApiError, toApiError } from './errors.js';
import { safeUrl } from './normalize.js';
import {
  normalizeAccess, normalizeContentItem, normalizeAuditEntry, normalizeMember,
  normalizeStats, normalizeGroups, normalizePage,
} from './normalize-workspace.js';
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
let accessCache = null; // { key, promise } — see getAccess()

const authListeners = new Set();
function emitAuthChange(type) {
  if (type === 'signed_out') accessCache = null;
  authListeners.forEach(cb => cb(type));
}

/* ---------- access (roles + scopes), cached per signed-in account ---------- */

// Fails CLOSED: until the backend provides roles, nobody gets a staff workspace.
export const NO_ACCESS = Object.freeze({ roles: [], scopes: [], available: false });

async function loadAccess() {
  try {
    return normalizeAccess(await backend.getMyAccess());
  } catch (err) {
    const e = toApiError(err, 'access');
    if (e.code === 'backend_required') return NO_ACCESS;
    throw e;
  }
}

function getAccess(session, { refresh = false } = {}) {
  const key = session?.email || '';
  if (!key) return Promise.resolve(NO_ACCESS);
  if (refresh || !accessCache || accessCache.key !== key) {
    const promise = loadAccess();
    accessCache = { key, promise };
    promise.catch(() => { if (accessCache?.promise === promise) accessCache = null; }); // retry next time
  }
  return accessCache.promise;
}

const item = raw => {
  const out = normalizeContentItem(raw);
  if (!out) throw toApiError(new Error('empty content row'), 'content');
  return out;
};
const items = rows => (Array.isArray(rows) ? rows : rows?.items || []).map(normalizeContentItem).filter(Boolean);
// Actions whose response may not include the full row: callers reload afterwards.
const itemOrNull = raw => normalizeContentItem(raw);
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

  /* ----- staff workspaces. Every call is authorised by the backend; the UI only hides what it can't use. ----- */

  access: {
    /** Roles + editor scopes of the signed-in user. NO_ACCESS when the backend has no roles API yet. */
    getMine: (session, opts) => getAccess(session, opts),
  },

  catalog: {
    listGroups: wrap('groups', async () => normalizeGroups(await backend.listGroups())),
  },

  editor: {
    listMine: wrap('editor', async ({ status = '' } = {}) => items(await backend.listMyContent({ status: status || undefined }))),
    get: wrap('editor', async id => item(await backend.getContentItem(id))),
    /**
     * Creates (no id) or updates a draft. With a `file` (File), the backend flow runs:
     * save draft → upload to Storage → save again with the storage path. Returns the item.
     */
    saveDraft: wrap('editor', async ({ id = null, values, file = null, onProgress }) =>
      item(await backend.saveContentDraft({ id, values, file, onProgress }))),
    submit: wrap('editor', async id => itemOrNull(await backend.submitContentForReview(id))),
  },

  review: {
    /** status: 'pending_review' | 'processed' → { items, nextCursor } */
    listQueue: wrap('review', async ({ status = 'pending_review', cursor = null, limit } = {}) =>
      normalizePage(await backend.listReviewQueue({ status, cursor, limit }), normalizeContentItem)),
    get: wrap('review', async id => item(await backend.getContentItem(id))),
    /** Short-lived signed URL for previewing/downloading an item's file (https only). */
    getFileUrl: wrap('review', async contentItem => {
      const { url } = (await backend.getContentFileUrl({ id: contentItem.id, storagePath: contentItem.file?.storagePath || null })) || {};
      const safe = safeUrl(url);
      if (!safe || !safe.startsWith('https:')) throw new ApiError('preview_unavailable');
      return safe;
    }),
    approve: wrap('review', async (id, { note = '' } = {}) => itemOrNull(await backend.decideContent(id, { decision: 'approve', note }))),
    reject: wrap('review', async (id, { reason }) => itemOrNull(await backend.decideContent(id, { decision: 'reject', note: reason }))),
    publish: wrap('review', async id => itemOrNull(await backend.publishContent(id))),
  },

  admin: {
    getStats: wrap('admin', async () => normalizeStats(await backend.getAdminStats())),
    // The RPCs filter by status / search text only; subject, text-in-content, role
    // and audit-action filters are applied here to the rows returned (current page).
    listContent: wrap('admin', async ({ status = '', subjectId = '', query = '', cursor = null } = {}) => {
      const page = normalizePage(await backend.listAllContent({ status, subjectId, query, cursor }), normalizeContentItem);
      const q = query.trim().toLowerCase();
      page.items = page.items.filter(i => (!subjectId || i.subjectId === subjectId)
        && (!q || i.title.toLowerCase().includes(q) || (i.submitter?.fullName || '').toLowerCase().includes(q)));
      return page;
    }),
    searchMembers: wrap('admin', async ({ query = '', role = '', cursor = null } = {}) => {
      const page = normalizePage(await backend.searchMembers({ query: query.trim(), role: role || undefined, cursor }), normalizeMember);
      if (role) page.items = page.items.filter(m => m.roles.includes(role));
      return page;
    }),
    grantRole: wrap('admin', async (userId, role) => normalizeMember(await backend.grantRole(userId, role))),
    revokeRole: wrap('admin', async (userId, role) => normalizeMember(await backend.revokeRole(userId, role))),
    setEditorScopes: wrap('admin', async (userId, scopes) => normalizeMember(await backend.setEditorScopes(userId, scopes))),
    listAuditLog: wrap('admin', async ({ cursor = null, action = '', limit } = {}) => {
      const page = normalizePage(await backend.listAuditLog({ cursor, action: action || undefined, limit }), normalizeAuditEntry);
      if (action) page.items = page.items.filter(e => e.action.startsWith(action));
      return page;
    }),
  },

  // DEV ONLY (mock backend): lets reviewers preview each role's UI. Absent in production.
  dev: isDemoMode ? {
    getDemoRoles: () => backend.getDemoRoles(),
    setDemoRoles: async roles => { await backend.setDemoRoles(roles); accessCache = null; },
  } : null,
};
