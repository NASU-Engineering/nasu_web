// App chrome: top bar, mobile bottom nav, demo banner.

import { html, mount } from './html.js';
import { icons } from './icons.js';
import { isDemoMode, usesSampleContent } from '../services/api.js';

const NAV = [
  { href: '#/dashboard', match: '/dashboard', label: 'Home', icon: icons.home },
  { href: '#/subjects', match: '/subjects', label: 'Subjects', icon: icons.book },
  { href: '#/search', match: '/search', label: 'Search', icon: icons.search },
  { href: '#/announcements', match: '/announcements', label: 'News', icon: icons.bell },
];

const isActive = (item, path) => path === item.match || path.startsWith(item.match + '/');

export function renderLayout({ session, path }) {
  const topbar = document.getElementById('topbar');
  const bottomnav = document.getElementById('bottomnav');
  const banner = document.getElementById('demoBanner');

  banner.hidden = !isDemoMode && !usesSampleContent;
  if (isDemoMode) {
    mount(banner, html`<strong>Development mock</strong> — no real accounts. “Continue with Microsoft” signs in a fake demo student without contacting Microsoft.`);
  } else if (usesSampleContent) {
    mount(banner, html`<strong>Preview</strong> — course material and announcements shown are samples while the hub is being connected.`);
  }

  const brand = html`
    <a class="brand" href="${session ? '#/dashboard' : '#/'}" aria-label="NASU Engineering Freshmen Hub — home">
      <span class="mark">${icons.mark}</span>
      <span class="brand-text">
        <span class="brand-name">Freshmen Hub</span>
        <span class="brand-sub">NASU · Faculty of Engineering</span>
      </span>
    </a>`;

  if (session) {
    mount(topbar, html`
      ${brand}
      <nav class="topnav" aria-label="Main">
        ${NAV.filter(n => n.match !== '/search').map(n => html`<a href="${n.href}" class="${isActive(n, path) ? 'active' : ''}" ${isActive(n, path) ? html`aria-current="page"` : ''}>${n.label}</a>`)}
      </nav>
      <form class="top-search" role="search" data-top-search>
        ${icons.search}
        <input type="search" name="q" placeholder="Search resources…" aria-label="Search resources" autocomplete="off">
      </form>
      <button type="button" class="icon-btn" data-action="sign-out" aria-label="Sign out" title="Sign out">${icons.logout}</button>
    `);
    mount(bottomnav, html`${NAV.map(n => html`
      <a href="${n.href}" class="${isActive(n, path) ? 'active' : ''}" ${isActive(n, path) ? html`aria-current="page"` : ''}>
        ${n.icon}<span>${n.label}</span>
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
