// Entry point: hash router, auth guards and global event wiring.

import { CONFIG } from './config.js';
import { api } from './services/api.js';
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

const content = CONFIG.requireLoginForContent;

// auth: must be signed in · guestOnly: signed-in students are sent to the dashboard
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
  } else if (route?.auth && !session) {
    return navigate('/login?next=' + encodeURIComponent(path + (qs ? '?' + qs : '')), { replace: true });
  } else if (route?.guestOnly && session) {
    return navigate('/dashboard', { replace: true });
  }

  renderLayout({ session, path });
  const view = route ? route.view : notFound;
  const ctx = { params: found?.params || {}, query, session, navigate, safeNext };

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
