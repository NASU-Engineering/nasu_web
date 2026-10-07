// App chrome: top bar, mobile bottom nav, demo banner.

import { html, mount } from './html.js';
import { icons } from './icons.js';
import { isDemoMode, usesSampleContent } from '../services/api.js';
import { primaryWorkspace } from '../services/roles.js';

// `match`: path prefixes that mark the item active.
const NAV = [
  { href: '#/dashboard', match: ['/dashboard'], label: 'Home', icon: icons.home },
  { href: '#/subjects', match: ['/subjects'], label: 'Subjects', icon: icons.book },
  { href: '#/resources', match: ['/resources', '/search'], label: 'Resources', short: 'Search', icon: icons.search },
  { href: '#/announcements', match: ['/announcements'], label: 'Updates', icon: icons.bell },
  { href: '#/profile', match: ['/profile'], label: 'Profile', short: 'Me', icon: icons.user, mobileOnly: true },
];

const CONSOLE_PREFIXES = ['/editor', '/review', '/admin'];

const startsWithAny = (path, prefixes) => prefixes.some(p => path === p || path.startsWith(p + '/'));
const isActive = (item, path) => startsWithAny(path, item.match);
export const isConsolePath = path => startsWithAny(path, CONSOLE_PREFIXES);

const navLink = (n, path, label = n.label) => html`<a href="${n.href}" class="${isActive(n, path) ? 'active' : ''}" ${isActive(n, path) ? html`aria-current="page"` : ''}>${label}</a>`;

export function renderLayout({ session, path, access = null }) {
  const topbar = document.getElementById('topbar');
  const bottomnav = document.getElementById('bottomnav');
  const banner = document.getElementById('demoBanner');

  banner.hidden = !isDemoMode && !usesSampleContent;
  if (isDemoMode) {
    mount(banner, html`<strong>Development mock</strong> — no real accounts. “Continue with Microsoft” signs in a fake demo student without contacting Microsoft.`);
  } else if (usesSampleContent) {
    mount(banner, html`<strong>Preview</strong> — course material and announcements shown are samples while the hub is being connected.`);
  }

  const inConsole = Boolean(session) && isConsolePath(path);
  document.body.classList.toggle('is-console', inConsole);

  const brand = html`
    <a class="brand" href="${session ? '#/dashboard' : '#/'}" aria-label="NASU Engineering Freshmen Hub — home">
      <span class="mark">${icons.mark}</span>
      <span class="brand-text">
        <span class="brand-name">Freshmen Hub</span>
        <span class="brand-sub">${inConsole ? 'Staff workspace' : 'NASU · Faculty of Engineering'}</span>
      </span>
    </a>`;

  if (session) {
    // Shown only when the backend reports a staff role. UX only.
    const ws = primaryWorkspace(access?.roles || []);
    // Browser history. The Navigation API (where supported) says whether each direction exists.
    const nav = globalThis.navigation;
    const canBack = nav?.canGoBack ?? true;
    const canForward = nav?.canGoForward ?? true;
    mount(topbar, html`
      <div class="history-nav hide-sm" role="group" aria-label="History">
        <button type="button" class="icon-btn icon-btn-hist" data-action="history-back" aria-label="Back" title="Back" ${canBack ? '' : 'disabled'}>${icons.back}</button>
        <button type="button" class="icon-btn icon-btn-hist" data-action="history-forward" aria-label="Forward" title="Forward" ${canForward ? '' : 'disabled'}>${icons.chevron}</button>
      </div>
      ${brand}
      <nav class="topnav" aria-label="Main">
        ${NAV.filter(n => !n.mobileOnly).map(n => navLink(n, path))}
        ${ws ? html`<a href="#${ws.home}" class="topnav-ws ${inConsole ? 'active' : ''}" ${inConsole ? html`aria-current="page"` : ''}>${icons.shield}<span>Workspace</span></a>` : ''}
      </nav>
      <form class="top-search" role="search" data-top-search>
        ${icons.search}
        <input type="search" name="q" placeholder="Search resources…" aria-label="Search resources" autocomplete="off">
      </form>
      <a class="icon-btn hide-sm ${path === '/profile' ? 'active' : ''}" href="#/profile" aria-label="Your profile" title="Profile">${icons.user}</a>
      <button type="button" class="icon-btn" data-action="sign-out" aria-label="Sign out" title="Sign out">${icons.logout}</button>
    `);
    mount(bottomnav, html`${NAV.filter(n => !n.desktopOnly).map(n => html`
      <a href="${n.href}" class="${isActive(n, path) ? 'active' : ''}" ${isActive(n, path) ? html`aria-current="page"` : ''}>
        ${n.icon}<span>${n.short || n.label}</span>
      </a>`)}`);
    bottomnav.hidden = false;
    document.body.classList.add('has-bottomnav');
  } else {
    mount(topbar, html`
      ${brand}
      <div class="top-actions">
        ${path !== '/login' ? html`<a class="btn btn-ghost" href="#/login">Sign in</a>` : ''}
      </div>
    `);
    mount(bottomnav, '');
    bottomnav.hidden = true;
    document.body.classList.remove('has-bottomnav');
  }
}
