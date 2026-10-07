// Staff console shell: sidebar (desktop) / tab strip (mobile) + page body.
// The sidebar only lists workspaces the user's roles include — UX only, the
// backend authorises every call these pages make.

import { html, mount } from './html.js';
import { icons } from './icons.js';
import { loadingState } from './components.js';
import { consoleNav, activeConsoleHref, roleLabel } from '../services/roles.js';

export function consoleShell({ access, path, eyebrow, title, lead, actions = '', body }) {
  const nav = consoleNav(access.roles);
  const active = activeConsoleHref(nav, path);
  const link = item => html`
    <a href="#${item.href}" class="${item.href === active ? 'active' : ''}" ${item.href === active ? html`aria-current="page"` : ''}>
      ${icons[item.icon] || icons.chevron}<span>${item.label}</span>
    </a>`;

  return html`
    <div class="console">
      <aside class="console-nav" aria-label="Workspace">
        <p class="console-who mono">${access.roles.filter(r => r !== 'student').map(roleLabel).join(' · ').toUpperCase()}</p>
        ${nav.map(g => html`
          <div class="console-group">
            <p class="console-group-label">${g.label}</p>
            ${g.items.map(link)}
          </div>`)}
        <div class="console-group">
          <a href="#/dashboard">${icons.back}<span>Student hub</span></a>
        </div>
      </aside>
      <nav class="console-tabs" aria-label="Workspace sections">
        ${nav.flatMap(g => g.items.map(item => ({ ...item, group: g.label }))).map((item, _, all) => {
          // e.g. "Editor overview" / "Admin overview" when several workspaces share a label
          const label = all.filter(x => x.label === item.label).length > 1 ? `${item.group} ${item.label.toLowerCase()}` : item.label;
          return html`<a href="#${item.href}" class="${item.href === active ? 'active' : ''}" ${item.href === active ? html`aria-current="page"` : ''}>${label}</a>`;
        })}
      </nav>
      <div class="console-main">
        <div class="console-head">
          <div>
            ${eyebrow ? html`<p class="eyebrow mono">${eyebrow}</p>` : ''}
            <h1 class="page-title" tabindex="-1">${title}</h1>
            ${lead ? html`<p class="lead">${lead}</p>` : ''}
          </div>
          ${actions ? html`<div class="console-actions">${actions}</div>` : ''}
        </div>
        ${body}
      </div>
    </div>`;
}

export function statTile({ label, value, hint, href, icon }) {
  const inner = html`
    <span class="stat-top">${icon ? icons[icon] : ''}<span class="stat-label">${label}</span></span>
    <span class="stat-value mono">${value == null ? '—' : value}</span>
    <span class="stat-hint">${value == null ? (hint || 'Not available yet') : (hint || '')}</span>`;
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
export function pendingBackendState(what = 'This section') {
  return html`
    <div class="state state-pending">
      <p class="state-title">${what} isn’t connected yet</p>
      <p class="state-text">The screen is ready; it will fill in once the backend for it is switched on.</p>
    </div>`;
}

/** Future module (quizzes, activities, leaderboards…): describes what's coming. */
export function futureModule({ icon, title, text, points = [] }) {
  return html`
    <div class="future">
      <span class="future-icon">${icons[icon] || icons.grid}</span>
      <div>
        <p class="future-badge mono">PLANNED MODULE</p>
        <h2 class="future-title">${title}</h2>
        <p class="future-text">${text}</p>
        ${points.length ? html`<ul class="future-list">${points.map(p => html`<li>${p}</li>`)}</ul>` : ''}
      </div>
    </div>`;
}

/** Error/empty handling shared by console panels. */
export function workspaceErrorState(err, what) {
  if (err?.code === 'backend_required') return pendingBackendState(what);
  return html`
    <div class="state state-error" role="alert">
      <p class="state-title">${err?.code === 'forbidden' ? 'Not allowed' : 'Couldn’t load this'}</p>
      <p class="state-text">${err?.message || 'Something went wrong.'}</p>
      ${err?.code === 'forbidden' ? '' : html`<button type="button" class="btn btn-ghost" data-action="retry">Try again</button>`}
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
