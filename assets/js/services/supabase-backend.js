// Supabase backend.
//
// Talks to Supabase ONLY through:
//   - Supabase Auth with the Azure (NASU Microsoft) OAuth provider
//   - rpc('get_my_profile') — returns the caller's own profile only
// It never reads private tables directly. Who may sign in, and what they may
// read, is enforced server-side (Auth provider settings, hooks, RLS).
//
// Every failure is converted to an ApiError code; the student sees the
// matching message from errors.js, never the raw server error.

import { CONFIG } from '../config.js';
import { SUBJECTS, subjectById } from '../data/catalog.js';
import { ApiError, logDev } from './errors.js';
import { getSupabase, isConfigured } from './supabase-client.js';
import { isUniversityEmail, studentIdFromEmail } from './identity.js';
import * as mock from './mock-backend.js';

const { auth } = CONFIG;

function isNetworkError(error) {
  return error?.name === 'AuthRetryableFetchError' || error?.status === 0 || error instanceof TypeError;
}

const toSession = session => {
  if (!session?.user) return null;
  const email = session.user.email || '';
  return { email, studentId: studentIdFromEmail(email, auth.emailDomain) };
};

/* ---------- session ---------- */

export async function getSession() {
  if (!isConfigured()) return null;
  const sb = await getSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw new ApiError(isNetworkError(error) ? 'network' : 'unknown', error);
  // UX guard: a non-university account is never treated as signed in here.
  if (data.session && !isUniversityEmail(data.session.user?.email, auth.emailDomain)) {
    await sb.auth.signOut({ scope: 'local' });
    return null;
  }
  return toSession(data.session);
}

export async function onAuthChange(cb) {
  if (!isConfigured()) return;
  try {
    const sb = await getSupabase();
    // Sign-outs from elsewhere: expired/revoked session, logout in another tab.
    sb.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') cb('signed_out'); });
  } catch { /* client failed to load; getSession reports it */ }
}

/* ---------- Microsoft sign-in ---------- */

// Leaves the page: the browser goes to Microsoft and comes back to redirectTo
// with ?code=… (or ?error=…), which completeSignIn() handles.
export async function startSignIn({ redirectTo }) {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithOAuth({
    provider: auth.provider,
    options: { redirectTo, scopes: auth.scopes, queryParams: auth.queryParams },
  });
  if (error) throw new ApiError(isNetworkError(error) ? 'network' : 'sign_in_failed', error);
}

// params: the OAuth return parameters ({ code } or { error, error_code, error_description }).
export async function completeSignIn(params) {
  if (params.error || params.error_code) {
    const detail = `${params.error || ''} ${params.error_code || ''} ${params.error_description || ''}`;
    logDev('oauth-return', detail);
    if (/cancel|declin|denied access|consent_required/i.test(detail)) throw new ApiError('sign_in_cancelled');
    if (/access_denied|signup|not allowed|forbidden|unauthori[sz]ed|hook/i.test(detail)) throw new ApiError('sign_in_denied');
    if (/rate|too many/i.test(detail)) throw new ApiError('rate_limited');
    throw new ApiError('sign_in_failed');
  }
  const sb = await getSupabase();
  const { data, error } = await sb.auth.exchangeCodeForSession(params.code);
  if (error) {
    // e.g. code already used, or the sign-in was started in another browser.
    throw new ApiError(isNetworkError(error) ? 'network' : 'sign_in_failed', error);
  }
  if (!isUniversityEmail(data.session?.user?.email, auth.emailDomain)) {
    await sb.auth.signOut({ scope: 'local' });
    throw new ApiError('wrong_account', data.session?.user?.email);
  }
  return toSession(data.session);
}

export async function signOut() {
  if (!isConfigured()) return;
  const sb = await getSupabase();
  const { error } = await sb.auth.signOut(); // local session is cleared even if this errors
  if (error && !isNetworkError(error)) throw new ApiError('unknown', error);
}

/* ---------- profile ---------- */

// No parameters: the backend resolves the caller from the JWT, so the browser
// can never ask for another student's profile.
export async function getMyProfile() {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('get_my_profile');
  if (error) {
    if (isNetworkError(error)) throw new ApiError('network', error);
    if (['PGRST301', 'PGRST302', '42501'].includes(error.code)) throw new ApiError('unauthenticated', error);
    throw new ApiError('unknown', error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new ApiError('profile_missing');
  return {
    fullName: String(row.full_name ?? ''),
    studentId: String(row.student_id ?? ''),
    group: row.group_name || '—',
    section: row.section || '—',
  };
}

/* ---------- content ---------- */
// Course content is not sensitive. Until content tables exist,
// CONFIG.contentSource = 'mock' serves the sample content.

const sampleContent = CONFIG.contentSource !== 'supabase';

export async function listSubjects() {
  if (sampleContent) return mock.listSubjects({ includeStudio: false });
  return SUBJECTS.map(s => ({ ...s, resourceCount: null }));
}

export async function getSubject(id) {
  if (sampleContent) return mock.getSubject(id);
  const s = subjectById(id);
  if (!s) throw new ApiError('not_found');
  return s;
}

// BACKEND REQUIRED (later): resources readable by authenticated students.
export async function listResources(opts) {
  if (sampleContent) return mock.listResources({ ...opts, includeStudio: false });
  throw new ApiError('backend_required', 'resources');
}

export async function searchResources(opts) {
  if (sampleContent) return mock.searchResources({ ...opts, includeStudio: false });
  throw new ApiError('backend_required', 'resources');
}

// BACKEND REQUIRED (later): announcements readable by authenticated students.
export async function listAnnouncements(opts) {
  if (sampleContent) return mock.listAnnouncements(opts);
  throw new ApiError('backend_required', 'announcements');
}

/* ---------- staff workspaces ---------- */
// Roles, editor uploads, review queue and admin — see supabase-workspace.js.

export * from './supabase-workspace.js';

/* ---------- engagement (not live yet) ---------- */

export * from './supabase-engage.js';
