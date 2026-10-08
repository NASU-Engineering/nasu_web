// App chrome: one top bar + navigation PER EXPERIENCE, never mixed.
//   Student Hub     → student nav (top on desktop, bottom bar on phones)
//   Staff workspaces → workspace title only; their own nav lives in the console shell
// Users with more than one experience get a workspace switcher in the account
// area of the top bar — outside every experience's navigation.

import { html, mount } from './html.js';
import { icons } from './icons.js';
import { isDemoMode, usesSampleContent, api } from '../services/api.js';
import { experienceForPath, experienceById, experiencesFor, STUDENT_NAV, activeHref } from '../services/experiences.js';
import { PERSONAS, PERSONA_IDS } from '../services/simulator.js';

const navLink = (item, active, { withIcon = false } = {}) => html`
  <a href="#${item.href}" class="${item.href === active ? 'active' : ''}" ${item.href === active ? html`aria-current="page"` : ''}>
    ${withIcon ? icons[item.icon] : ''}<span>${item.label}</span>
  </a>`;

/** Workspace switcher: only rendered when the user can open more than one experience. */
function workspaceSwitcher(experiences, currentId) {
  if (experiences.length < 2) return '';
  const current = experienceById(currentId);
  return html`
    <details class="ws-switch">
      <summary aria-label="Switch workspace (current: ${current.label})">
        ${icons.swap}<span class="ws-switch-label">${current.label}</span>${icons.chevronDown}
      </summary>
      <div class="ws-menu">
        <p class="ws-menu-label">Your workspaces</p>
        ${experiences.map(e => html`
          <a href="#${e.home}" class="${e.id === currentId ? 'active' : ''}" ${e.id === currentId ? html`aria-current="true"` : ''}>
            ${icons[e.icon]}<span>${e.label}</span>
          </a>`)}
      </div>
    </details>`;
}

const historyNav = () => {
  // Browser history. The Navigation API (where supported) says whether each direction exists.
  const nav = globalThis.navigation;
  return html`
    <div class="history-nav" role="group" aria-label="History">
      <button type="button" class="icon-btn icon-btn-hist" data-action="history-back" aria-label="Back" title="Back" ${(nav?.canGoBack ?? true) ? '' : 'disabled'}>${icons.back}</button>
      <button type="button" class="icon-btn icon-btn-hist" data-action="history-forward" aria-label="Forward" title="Forward" ${(nav?.canGoForward ?? true) ? '' : 'disabled'}>${icons.chevron}</button>
    </div>`;
};

function banner(el, simulation) {
  if (simulation) {
    el.hidden = false;
    el.className = 'demo-banner sim-banner';
    mount(el, html`
      <span class="sim-banner-text"><strong>Role simulator</strong> · viewing as <strong>${simulation.label}</strong> — mock data only, nothing is saved to the Hub.</span>
      <span class="sim-banner-actions">
        <label class="visually-hidden" for="simPersona">Switch persona</label>
        <select id="simPersona" data-action="sim-persona">
          ${PERSONA_IDS.map(id => html`<option value="${id}" ${PERSONAS[id].label === simulation.label ? 'selected' : ''}>${PERSONAS[id].label}</option>`)}
        </select>
        <button type="button" class="btn btn-sm sim-exit" data-action="sim-exit">Exit to Admin</button>
      </span>`);
    return;
  }
  el.className = 'demo-banner';
  el.hidden = !isDemoMode && !usesSampleContent;
  if (isDemoMode) {
    mount(el, html`<strong>Development mock</strong> — no real accounts. “Continue with Microsoft” signs in a fake demo student without contacting Microsoft.`);
  } else if (usesSampleContent) {
    mount(el, html`<strong>Preview</strong> — course material and updates shown are samples while the hub is being connected.`);
  }
}

export function renderLayout({ session, path, access = null }) {
  const topbar = document.getElementById('topbar');
  const bottomnav = document.getElementById('bottomnav');
  const simulation = session ? api.sim.current() : null;
  banner(document.getElementById('demoBanner'), simulation);

  const expId = session ? experienceForPath(path) : null;
  const exp = expId ? experienceById(expId) : null;
  const staff = Boolean(exp && exp.id !== 'student');
  document.body.classList.toggle('is-console', staff);
  document.body.classList.toggle('is-simulating', Boolean(simulation));

  const brand = html`
    <a class="brand" href="${session ? `#${exp.home}` : '#/'}" aria-label="NASU Engineering Freshmen Hub — ${staff ? exp.label : 'home'}">
      <span class="mark">${icons.mark}</span>
      <span class="brand-text">
        <span class="brand-name">${staff ? exp.label : 'Freshmen Hub'}</span>
        <span class="brand-sub">${staff ? 'NASU Freshmen Hub · Staff' : 'NASU · Faculty of Engineering'}</span>
      </span>
    </a>`;

  if (!session) {
    mount(topbar, html`
      ${brand}
      <div class="top-actions">${path !== '/login' ? html`<a class="btn btn-ghost" href="#/login">Sign in</a>` : ''}</div>`);
    mount(bottomnav, '');
    bottomnav.hidden = true;
    document.body.classList.remove('has-bottomnav');
    return;
  }

  const switcher = workspaceSwitcher(experiencesFor(access?.roles || []), exp.id);
  const signOut = html`<button type="button" class="icon-btn" data-action="sign-out" aria-label="Sign out" title="Sign out">${icons.logout}</button>`;

  if (staff) {
    // Staff workspaces: no student navigation here; sections live in the console shell.
    mount(topbar, html`${historyNav()}${brand}<div class="top-actions">${switcher}${signOut}</div>`);
    mount(bottomnav, '');
    bottomnav.hidden = true;
    document.body.classList.remove('has-bottomnav');
    return;
  }

  // Student Hub
  const active = activeHref(STUDENT_NAV, path);
  mount(topbar, html`
    ${historyNav()}
    ${brand}
    <nav class="topnav" aria-label="Main">${STUDENT_NAV.map(n => navLink(n, active))}</nav>
    <div class="top-actions">${switcher}${signOut}</div>`);
  mount(bottomnav, html`${STUDENT_NAV.map(n => navLink(n, active, { withIcon: true }))}`);
  bottomnav.hidden = false;
  document.body.classList.add('has-bottomnav');
}
