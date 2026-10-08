// Entry point: hash router, auth guards and global event wiring.

import { CONFIG } from './config.js';
import { api, NO_ACCESS } from './services/api.js';
import { routeAllowed } from './services/roles.js';
import { defaultHome, experienceForPath, REDIRECTS } from './services/experiences.js';
import { PERSONAS } from './services/simulator.js';
import { html, mount } from './ui/html.js';
import { renderLayout } from './ui/layout.js';
import { errorState, loadingState } from './ui/components.js';
import { openSettingsDialog } from './ui/settings.js';
import { applyTheme } from './ui/theme.js';
import { t, applyLocale, onLocaleChange } from './i18n/index.js';

import landing from './views/landing.js';
import login from './views/login.js';
import dashboard from './views/dashboard.js';
import learn from './views/learn.js';
import subjects from './views/subjects.js';
import subject from './views/subject.js';
import search from './views/search.js';
import announcements from './views/announcements.js';
import notFound from './views/not-found.js';
import profile from './views/profile.js';
import assignments from './views/assignments.js';
import { progressView, leaderboardView } from './views/progress.js';
import { quizzesView, quizView } from './views/quizzes.js';
import { activitiesView } from './views/activities.js';
import editorOverview from './views/console/editor-overview.js';
import editorUploads from './views/console/editor-uploads.js';
import editorItem from './views/console/editor-item.js';
import editorUpload from './views/console/editor-upload.js';
import { reviewQueue, reviewHistory, adminReviewQueue } from './views/console/review-queue.js';
import { adminReviewActivity } from './views/console/review-history.js';
import reviewItem from './views/console/review-item.js';
import adminOverview from './views/console/admin-overview.js';
import adminContent from './views/console/admin-content.js';
import adminTeam from './views/console/admin-team.js';
import adminStudents from './views/console/admin-students.js';
import adminAudit from './views/console/admin-audit.js';
import adminAnalytics from './views/console/admin-analytics.js';
import adminSimulator from './views/console/admin-simulator.js';
import adminSettings from './views/console/admin-settings.js';
import { adminQuizzes, adminActivities, adminEngagement } from './views/console/admin-engage.js';

// Language and theme before the first render (index.html also sets them early).
applyLocale();
applyTheme();

const content = CONFIG.requireLoginForContent;

// Role guards below are UX only (which screens to offer). Every request those
// screens make is authorised by the backend (RLS / RPC role checks).
const EDITOR = ['section_editor', 'admin']; // admins may upload without an editor scope
const REVIEWER = ['content_manager', 'admin'];
const ADMIN = ['admin'];

// auth: must be signed in · guestOnly: signed-in users are sent to their workspace (/start)
// roles: signed in AND holding one of these roles (implies auth)
// redirect: retired or moved routes (old bookmarks keep working)
const ROUTES = [
  { path: '/', view: landing },
  { path: '/login', view: login, guestOnly: true },
  { path: '/activate', redirect: '/login' },
  { path: '/activate/verify', redirect: '/login' },
  { path: '/create-password', redirect: '/login' },
  { path: '/start', auth: true, start: true }, // resolves the user's workspace after sign-in

  // Student Hub — Home · Learn · Updates · Progress · Profile
  { path: '/dashboard', view: dashboard, auth: true },
  { path: '/learn', view: learn, auth: content },
  { path: '/subjects', view: subjects, auth: content },
  { path: '/subjects/:id', view: subject, auth: content },
  { path: '/resources', view: search, auth: content },
  { path: '/search', view: search, auth: content },
  { path: '/assignments', view: assignments, auth: content },
  { path: '/announcements', view: announcements, auth: content },
  { path: '/progress', view: progressView, auth: true },
  { path: '/quizzes', view: quizzesView, auth: true },
  { path: '/quizzes/:id', view: quizView, auth: true },
  { path: '/activities', view: activitiesView, auth: true },
  { path: '/leaderboard', view: leaderboardView, auth: true },
  { path: '/profile', view: profile, auth: true },

  // Content Studio — Overview · Upload · My content
  { path: '/editor', view: editorOverview, roles: EDITOR },
  { path: '/editor/upload', view: editorUpload, roles: EDITOR },
  { path: '/editor/uploads', view: editorUploads, roles: EDITOR },
  { path: '/editor/uploads/:id', view: editorItem, roles: EDITOR },

  // Review Desk — Review queue · History
  { path: '/review', view: reviewQueue, roles: REVIEWER },
  { path: '/review/history', view: reviewHistory, roles: REVIEWER },
  { path: '/review/:id', view: reviewItem, roles: REVIEWER },

  // Admin Control Center — Overview · People · Content · Insights · Settings
  { path: '/admin', view: adminOverview, roles: ADMIN },
  { path: '/admin/people', view: adminStudents, roles: ADMIN },
  { path: '/admin/people/staff', view: adminTeam, roles: ADMIN },
  { path: '/admin/content', view: adminContent, roles: ADMIN },
  { path: '/admin/content/review', view: adminReviewQueue, roles: ADMIN },
  { path: '/admin/content/quizzes', view: adminQuizzes, roles: ADMIN },
  { path: '/admin/content/activities', view: adminActivities, roles: ADMIN },
  { path: '/admin/content/:id', view: reviewItem, roles: ADMIN },
  { path: '/admin/insights', view: adminAnalytics, roles: ADMIN },
  { path: '/admin/insights/engagement', view: adminEngagement, roles: ADMIN },
  { path: '/admin/insights/reviews', view: adminReviewActivity, roles: ADMIN },
  { path: '/admin/insights/audit', view: adminAudit, roles: ADMIN },
  { path: '/admin/settings', view: adminSettings, roles: ADMIN },
  { path: '/admin/settings/simulator', view: adminSimulator, roles: ADMIN },

  ...Object.entries(REDIRECTS).map(([path, redirect]) => ({ path, redirect })),
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
const pageTitle = title => `${title} · ${t('brand.full')}`;

// Signed in with Microsoft, but the backend has no hub profile for this account.
function noProfileState(session) {
  return html`
    <div class="state state-page">
      <p class="eyebrow mono">${t('noProfile.eyebrow')}</p>
      <h1 class="page-title" tabindex="-1">${t('noProfile.title')}</h1>
      <p class="state-text">${t('noProfile.text', { email: session?.email || t('noProfile.yourAccount') })}</p>
      <button type="button" class="btn btn-ghost" data-action="sign-out">${t('auth.signOut')}</button>
    </div>`;
}

// Signed in, but the backend didn't report a role this screen is for.
function forbiddenState() {
  return html`
    <div class="state state-page">
      <p class="eyebrow mono">${t('forbidden.eyebrow')}</p>
      <h1 class="page-title" tabindex="-1">${t('forbidden.title')}</h1>
      <p class="state-text">${t('forbidden.text')}</p>
      <a class="btn btn-primary" href="#/start">${t('common.backToWorkspace')}</a>
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
    return navigate('/start', { replace: true });
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

  // After sign-in (or "home"): land in the right workspace for this account.
  if (route?.start) {
    return navigate(accessError ? '/dashboard' : defaultHome(access.roles, { last: lastWorkspace() }), { replace: true });
  }

  // A refused staff route is shown inside the neutral student shell, so no staff
  // workspace chrome (title, navigation) is ever drawn for an unauthorised user.
  const refused = Boolean(route?.roles) && (Boolean(accessError) || !routeAllowed(route.roles, access.roles));
  renderLayout({ session, path: refused ? '/no-access' : path, access });

  if (route?.roles) {
    if (accessError) {
      document.title = pageTitle(t('state.error'));
      mount(app, html`<div class="page-pad">${errorState(accessError)}</div>`);
      app.querySelector('[data-action=retry]')?.addEventListener('click', router);
      return;
    }
    if (!routeAllowed(route.roles, access.roles)) {
      document.title = pageTitle(t('state.notAllowed'));
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
    document.title = pageTitle(out.title);
    mount(app, out.html);
    out.bind?.(app);
    if (session && route) rememberWorkspace(experienceForPath(path));
  } catch (err) {
    if (seq !== renderSeq) return;
    if (err.code === 'unauthenticated') {
      await api.auth.signOut().catch(() => {});
      return navigate('/login?expired=1', { replace: true });
    }
    if (err.code === 'profile_missing') {
      document.title = pageTitle(t('state.notAllowed'));
      mount(app, noProfileState(session));
      return;
    }
    document.title = pageTitle(t('state.error'));
    mount(app, html`<div class="page-pad">${errorState(err)}</div>`);
    app.querySelector('[data-action=retry]')?.addEventListener('click', router);
  } finally {
    clearTimeout(spinner);
  }

  window.scrollTo(0, 0);
  // Move focus to the page heading so screen readers announce the new page.
  app.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
}

// Last workspace used, so sign-in returns there (per-browser convenience only;
// defaultHome() ignores it unless the account is still authorised for it).
const LAST_KEY = 'nasu.lastWorkspace';
function lastWorkspace() { try { return localStorage.getItem(LAST_KEY); } catch { return null; } }
function rememberWorkspace(id) { if (api.sim.current()) return; try { localStorage.setItem(LAST_KEY, id); } catch { /* ignore */ } }

// Global handlers for the chrome (top bar is re-rendered on every route).

// Display settings dialog (language + theme), available in every experience.
document.addEventListener('click', e => {
  if (e.target.closest('[data-action="open-settings"]')) openSettingsDialog();
});

// A language change re-renders the current page in the new language.
onLocaleChange(() => router());

// Workspace switcher: close when clicking elsewhere or picking a workspace.
document.addEventListener('click', e => {
  document.querySelectorAll('details.ws-switch[open]').forEach(d => {
    if (!d.contains(e.target) || e.target.closest('.ws-menu a')) d.open = false;
  });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('details.ws-switch[open]');
  if (open) { open.open = false; open.querySelector('summary')?.focus(); }
});

// Role simulator banner: switch persona / exit (mock data only, see services/simulator.js).
document.addEventListener('change', async e => {
  const sel = e.target.closest('[data-action="sim-persona"]');
  if (!sel) return;
  await api.sim.enter(sel.value).catch(() => {});
  navigate(PERSONAS[sel.value]?.home || '/admin/simulator');
  router();
});
document.addEventListener('click', e => {
  if (!e.target.closest('[data-action="sim-exit"]')) return;
  api.sim.exit();
  navigate('/admin/simulator');
  router();
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
    mount(app, loadingState(t('auth.signingIn')));
    try {
      const { next } = await api.auth.completeSignIn();
      navigate(safeNext(next) || '/start', { replace: true });
    } catch (err) {
      navigate('/login?error=' + encodeURIComponent(err.code || 'sign_in_failed'), { replace: true });
    }
  }
  window.addEventListener('hashchange', router);
  router();
}

start();
