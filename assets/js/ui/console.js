// Staff workspace shell (Content Studio, Review Desk, Admin Control Center):
// sidebar (desktop) / tab strip (mobile) + page body. Each workspace shows ONLY
// its own navigation — never another workspace's. UX only; the backend
// authorises every call these pages make.

import { html, mount } from './html.js';
import { icons } from './icons.js';
import { loadingState } from './components.js';
import { experienceForPath, experienceById, navFor, subnavFor, activeHref } from '../services/experiences.js';
import { isSimulating } from '../services/simulator.js';
import { t } from '../i18n/index.js';

export function consoleShell({ path, eyebrow, title, lead, actions = '', back = null, body }) {
  const exp = experienceById(experienceForPath(path));
  const items = navFor(exp.id);
  const active = activeHref(items, path);
  const sub = subnavFor(path, { simulating: isSimulating() });
  const subActive = activeHref(sub, path);
  const link = item => html`
    <a href="#${item.href}" class="${item.href === active ? 'active' : ''}" ${item.href === active ? html`aria-current="page"` : ''}>
      ${icons[item.icon] || icons.chevron}<span>${item.label}</span>
    </a>`;

  return html`
    <div class="console console-${exp.id}">
      <aside class="console-nav" aria-label="${exp.label}">
        <p class="console-title">${icons[exp.icon]}<span>${exp.label}</span></p>
        <div class="console-group">${items.map(link)}</div>
      </aside>
      <nav class="console-tabs" aria-label="${t('nav.sectionsOf', { name: exp.label })}">
        ${items.map(item => html`<a href="#${item.href}" class="${item.href === active ? 'active' : ''}" ${item.href === active ? html`aria-current="page"` : ''}>${item.label}</a>`)}
      </nav>
      <div class="console-main">
        <div class="console-head">
          <div>
            ${back ? html`<a class="back-link" href="#${back.href}">${icons.back}<span>${back.label}</span></a>` : ''}
            ${eyebrow ? html`<p class="eyebrow mono">${eyebrow}</p>` : ''}
            <h1 class="page-title" tabindex="-1">${title}</h1>
            ${lead ? html`<p class="lead">${lead}</p>` : ''}
          </div>
          ${actions ? html`<div class="console-actions">${actions}</div>` : ''}
        </div>
        ${sub.length > 1 ? html`
          <nav class="subnav" aria-label="${t('nav.inPage')}">
            ${sub.map(i => html`<a href="#${i.href}" class="${i.href === subActive ? 'active' : ''}" ${i.href === subActive ? html`aria-current="page"` : ''}>${icons[i.icon]}<span>${i.label}</span></a>`)}
          </nav>` : ''}
        ${body}
      </div>
    </div>`;
}

export function statTile({ label, value, hint, href, icon }) {
  const inner = html`
    <span class="stat-top">${icon ? icons[icon] : ''}<span class="stat-label">${label}</span></span>
    <span class="stat-value mono">${value == null ? '—' : value}</span>
    <span class="stat-hint">${value == null ? (hint || t('state.notAvailable')) : (hint || '')}</span>`;
  return href ? html`<a class="stat" href="${href}">${inner}</a>` : html`<div class="stat">${inner}</div>`;
}

/** A dashboard panel with a header and optional action. */
export function panel(title, body, { action = '', id = '' } = {}) {
  return html`
    <section class="panel" ${id ? html`id="${id}"` : ''}>
      <header class="panel-head"><h2>${title}</h2>${action}</header>
      <div class="panel-body">${body}</div>
    </section>`;
}

/** State shown when a backend feature isn't connected yet — calm, not an error. */
export function pendingBackendState() {
  return html`
    <div class="state state-pending">
      <p class="state-title">${t('state.notConnected')}</p>
      <p class="state-text">${t('state.notConnectedText')}</p>
    </div>`;
}

/** Features whose backend doesn't exist yet (quizzes, activities, XP): say so plainly. */
export function notLiveState(feature) {
  return html`
    <div class="state state-pending">
      <p class="state-title">${t('state.notLive', { feature })}</p>
      <p class="state-text">${t('state.notLiveText')}</p>
    </div>`;
}

/** Future module (quizzes, activities, leaderboards…): describes what's coming. */
export function futureModule({ icon, title, text, points = [] }) {
  return html`
    <div class="future">
      <span class="future-icon">${icons[icon] || icons.grid}</span>
      <div>
        <p class="future-badge mono">${t('state.plannedModule')}</p>
        <h2 class="future-title">${title}</h2>
        <p class="future-text">${text}</p>
        ${points.length ? html`<ul class="future-list">${points.map(p => html`<li>${p}</li>`)}</ul>` : ''}
      </div>
    </div>`;
}

/** Error/empty handling shared by console panels. */
export function workspaceErrorState(err, what) {
  if (err?.code === 'backend_required') return pendingBackendState();
  return html`
    <div class="state state-error" role="alert">
      <p class="state-title">${err?.code === 'forbidden' ? t('state.notAllowed') : t('state.loadFailed')}</p>
      <p class="state-text">${err?.message || t('error.unknown')}</p>
      ${err?.code === 'forbidden' ? '' : html`<button type="button" class="btn btn-ghost" data-action="retry">${t('common.tryAgain')}</button>`}
    </div>`;
}

/**
 * Loads data into one panel with loading → content | error (+ retry) states.
 * render(data) returns markup; after(el, data) wires events. Returns the data (or undefined on error).
 */
export async function fill(el, { load, render, after, what, label }) {
  mount(el, loadingState(label));
  try {
    const data = await load();
    if (!el.isConnected) return undefined;
    mount(el, render(data));
    after?.(el, data);
    return data;
  } catch (err) {
    if (!el.isConnected) return undefined;
    mount(el, workspaceErrorState(err, what));
    el.querySelector('[data-action=retry]')?.addEventListener('click', () => fill(el, { load, render, after, what, label }));
    return undefined;
  }
}
