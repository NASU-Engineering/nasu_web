// Entry point: hash router, auth guards and global event wiring.

import { CONFIG } from './config.js';
import { api, NO_ACCESS } from './services/api.js';
import { routeAllowed } from './services/roles.js';
import { html, mount } from './ui/html.js';
import { renderLayout } from './ui/layout.js';
import { errorState, loadingState } from './ui/components.js';

import landing from './views/landing.js';
import login from './views/login.js';
import dashboard from './views/dashboard.js';
import subjects from './views/subjects.js';
import subject from './views/subject.js';
import search from './views/search.js';
import announcements from './views/announcements.js';
import notFound from './views/not-found.js';
import profile from './views/profile.js';
import assignments from './views/assignments.js';
import { quizzes, activities, leaderboard } from './views/coming-soon.js';
import editorOverview from './views/console/editor-overview.js';
import editorUploads from './views/console/editor-uploads.js';
import editorItem from './views/console/editor-item.js';
import editorUpload from './views/console/editor-upload.js';
import { reviewQueue, reviewHistory } from './views/console/review-queue.js';
import reviewItem from './views/console/review-item.js';
import adminOverview from './views/console/admin-overview.js';
import adminContent from './views/console/admin-content.js';
import adminTeam from './views/console/admin-team.js';
import adminStudents from './views/console/admin-students.js';
import adminAudit from './views/console/admin-audit.js';
import { adminActivities, adminQuizzes, adminLeaderboards } from './views/console/admin-modules.js';

const content = CONFIG.requireLoginForContent;

// Role guards below are UX only (which screens to offer). Every request those
// screens make is authorised by the backend (RLS / RPC role checks).
const EDITOR = ['section_editor', 'admin']; // admins may upload without an editor scope
const REVIEWER = ['content_manager', 'admin'];
const ADMIN = ['admin'];

// auth: must be signed in · guestOnly: signed-in students are sent to the dashboard
// roles: signed in AND holding one of these roles (implies auth)
// redirect: retired routes from the old password/activation flow
const ROUTES = [
  { path: '/', view: landing },
  { path: '/login', view: login, guestOnly: true },
  { path: '/activate', redirect: '/login' },
  { path: '/activate/verify', redirect: '/login' },
  { path: '/create-password', redirect: '/login' },
  { path: '/dashboard', view: dashboard, auth: true },
  { path: '/subjects', view: subjects, auth: content },
  { path: '/subjects/:id', view: subject, auth: content },
  { path: '/search', view: search, auth: content },
  { path: '/announcements', view: announcements, auth: content },
  { path: '/resources', view: search, auth: content },
  { path: '/assignments', view: assignments, auth: content },
  { path: '/quizzes', view: quizzes, auth: true },
  { path: '/activities', view: activities, auth: true },
  { path: '/leaderboard', view: leaderboard, auth: true },
  { path: '/profile', view: profile, auth: true },

  { path: '/editor', view: editorOverview, roles: EDITOR },
  { path: '/editor/uploads', view: editorUploads, roles: EDITOR },
  { path: '/editor/uploads/:id', view: editorItem, roles: EDITOR },
  { path: '/editor/upload', view: editorUpload, roles: EDITOR },

  { path: '/review', view: reviewQueue, roles: REVIEWER },
  { path: '/review/history', view: reviewHistory, roles: REVIEWER },
  { path: '/review/:id', view: reviewItem, roles: REVIEWER },

  { path: '/admin', view: adminOverview, roles: ADMIN },
  { path: '/admin/content', view: adminContent, roles: ADMIN },
  { path: '/admin/review', redirect: '/review' },
  { path: '/admin/team', view: adminTeam, roles: ADMIN },
  { path: '/admin/students', view: adminStudents, roles: ADMIN },
  { path: '/admin/activities', view: adminActivities, roles: ADMIN },
  { path: '/admin/quizzes', view: adminQuizzes, roles: ADMIN },
  { path: '/admin/leaderboards', view: adminLeaderboards, roles: ADMIN },
  { path: '/admin/audit', view: adminAudit, roles: ADMIN },
].map(r => {
  const keys = [];
  const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { ...r, re, keys };
});

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', qs, query: Object.fromEntries(new URLSearchParams(qs)) };
}

function matchRoute(path) {
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function navigate(to, { replace = false } = {}) {
  if (replace) location.replace('#' + to);
  else location.hash = to;
}

// Only allow redirecting back to a known in-app route.
function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return null;
  return matchRoute(next.split('?')[0]) ? next : null;
}

const app = document.getElementById('app');

// Signed in with Microsoft, but the backend has no hub profile for this account.
function noProfileState(session) {
  return html`
    <div class="state state-page">
      <p class="eyebrow mono">NO HUB PROFILE</p>
      <h1 class="page-title" tabindex="-1">We couldn’t find your student profile</h1>
      <p class="state-text">You’re signed in as <strong class="mono">${session?.email || 'your NASU account'}</strong>, but this account isn’t set up in the hub yet. If you’re a prep-year engineering student, contact the prep-year office.</p>
      <button type="button" class="btn btn-ghost" data-action="sign-out">Sign out</button>
    </div>`;
}

// Signed in, but the backend didn't report a role this screen is for.
function forbiddenState() {
  return html`
    <div class="state state-page">
      <p class="eyebrow mono">NO ACCESS</p>
      <h1 class="page-title" tabindex="-1">This workspace isn’t available to you</h1>
      <p class="state-text">Your account doesn’t have the role this page needs. If you should have access, ask a hub admin.</p>
      <a class="btn btn-primary" href="#/dashboard">Back to dashboard</a>
    </div>`;
}
let renderSeq = 0;

async function router() {
  const seq = ++renderSeq;
  const { path, qs, query } = parseHash();
  const found = matchRoute(path);
  const route = found?.route;

  // Resolve the session BEFORE any guard runs, so nothing redirects while auth
  // is still initialising. If it can't be determined, show a retry instead of
  // guessing "signed out" (which could bounce the student to login).
  let session;
  try {
    session = await api.auth.getSession();
  } catch (err) {
    if (seq !== renderSeq) return;
    renderLayout({ session: null, path });
    mount(app, html`<div class="page-pad">${errorState(err)}</div>`);
    app.querySelector('[data-action=retry]')?.addEventListener('click', router);
    return;
  }
  if (seq !== renderSeq) return;

  if (route?.redirect) {
    return navigate(route.redirect, { replace: true });
  } else if ((route?.auth || route?.roles) && !session) {
    return navigate('/login?next=' + encodeURIComponent(path + (qs ? '?' + qs : '')), { replace: true });
  } else if (route?.guestOnly && session) {
    return navigate('/dashboard', { replace: true });
  }

  // Roles + editor scopes (cached per account). NO_ACCESS until the backend provides them.
  let access = NO_ACCESS;
  let accessError = null;
  if (session) {
    try { access = await api.access.getMine(session); } catch (err) { accessError = err; }
    if (seq !== renderSeq) return;
    if (accessError?.code === 'unauthenticated') {
      await api.auth.signOut().catch(() => {});
      return navigate('/login?expired=1', { replace: true });
    }
  }

  renderLayout({ session, path, access });

  if (route?.roles) {
    if (accessError) {
      document.title = 'Error · NASU Freshmen Hub';
      mount(app, html`<div class="page-pad">${errorState(accessError)}</div>`);
      app.querySelector('[data-action=retry]')?.addEventListener('click', router);
      return;
    }
    if (!routeAllowed(route.roles, access.roles)) {
      document.title = 'No access · NASU Freshmen Hub';
      mount(app, forbiddenState());
      app.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
      return;
    }
  }

  const view = route ? route.view : notFound;
  const ctx = { path, params: found?.params || {}, query, session, access, navigate, safeNext, reload: router };

  // Show a spinner only if loading is noticeably slow.
  const spinner = setTimeout(() => { if (seq === renderSeq) mount(app, loadingState()); }, 150);
  try {
    const out = await view(ctx);
    if (seq !== renderSeq || !out) return; // a newer navigation won, or the view redirected
    document.title = `${out.title} · NASU Freshmen Hub`;
    mount(app, out.html);
    out.bind?.(app);
  } catch (err) {
    if (seq !== renderSeq) return;
    if (err.code === 'unauthenticated') {
      await api.auth.signOut().catch(() => {});
      return navigate('/login?expired=1', { replace: true });
    }
    if (err.code === 'profile_missing') {
      document.title = 'No access · NASU Freshmen Hub';
      mount(app, noProfileState(session));
      return;
    }
    document.title = 'Error · NASU Freshmen Hub';
    mount(app, html`<div class="page-pad">${errorState(err)}</div>`);
    app.querySelector('[data-action=retry]')?.addEventListener('click', router);
  } finally {
    clearTimeout(spinner);
  }

  window.scrollTo(0, 0);
  // Move focus to the page heading so screen readers announce the new page.
  app.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
}

// Global handlers for the chrome (top bar is re-rendered on every route).
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-top-search]');
  if (!form) return;
  e.preventDefault();
  const q = form.q.value.trim();
  navigate('/search' + (q ? '?q=' + encodeURIComponent(q) : ''));
});

// Top-bar Back / Forward: plain browser history.
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action="history-back"], [data-action="history-forward"]');
  if (!btn || btn.disabled) return;
  if (btn.dataset.action === 'history-back') history.back();
  else history.forward();
});

let signingOut = false;
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-action="sign-out"]') || signingOut) return;
  signingOut = true;
  await api.auth.signOut().catch(() => {});
  navigate('/login?signedout=1', { replace: true });
  signingOut = false;
});

// Session ended outside the sign-out button (expired, revoked, other tab): re-check guards.
api.auth.onChange(type => { if (type === 'signed_out' && !signingOut) router(); });

// Returning from Microsoft sign-in: finish it before any routing happens, so
// guards never see a half-finished sign-in.
async function start() {
  if (api.auth.isSignInReturn()) {
    renderLayout({ session: null, path: '/login' });
    mount(app, loadingState('Signing you in…'));
    try {
      const { next } = await api.auth.completeSignIn();
      navigate(safeNext(next) || '/dashboard', { replace: true });
    } catch (err) {
      navigate('/login?error=' + encodeURIComponent(err.code || 'sign_in_failed'), { replace: true });
    }
  }
  window.addEventListener('hashchange', router);
  router();
}

start();
