// Shared markup pieces. All return html`` results (auto-escaped).

import { html } from './html.js';
import { icons } from './icons.js';
import { subjectById, categoryById } from '../data/catalog.js';
import { shortDate, relativeDays, pad2, dateTime } from './format.js';
import { hubPath, ctaLabel } from '../services/deep-links.js';
import { updateKind, UPDATE_KINDS } from '../services/updates.js';

export function pageHead({ eyebrow, title, code, lead, back }) {
  return html`
    <div class="page-head">
      ${back ? html`<a class="back-link" href="${back.href}">${icons.back}<span>${back.label}</span></a>` : ''}
      ${eyebrow ? html`<p class="eyebrow mono">${eyebrow}</p>` : ''}
      <div class="page-title-row">
        <h1 class="page-title" tabindex="-1">${title}</h1>
        ${code ? html`<span class="code-tag mono">${code}</span>` : ''}
      </div>
      ${lead ? html`<p class="lead">${lead}</p>` : ''}
    </div>`;
}

export function sectionLabel(text, extra = '') {
  return html`<h2 class="section-label"><span>${text}</span><span class="ln"></span>${extra}</h2>`;
}

export function resourceCard(r, { showSubject = false } = {}) {
  const cat = categoryById(r.category);
  const subject = subjectById(r.subjectId);
  const overdue = r.dueAt && new Date(r.dueAt) < new Date();
  const kindParts = [cat?.single?.toUpperCase(), r.week ? `WEEK ${pad2(r.week)}` : '', showSubject ? subject?.code : ''].filter(Boolean);
  const meta = [r.addedAt ? `Added ${shortDate(r.addedAt)}` : '', r.url ? (r.format === 'pdf' ? 'PDF' : 'Link') : ''].filter(Boolean).join(' · ');

  const inner = html`
    <span class="res-icon cat-${r.category}">${icons[r.category] || icons.link}</span>
    <span class="res-body">
      <span class="res-kind mono">${kindParts.join(' · ')}</span>
      <span class="res-title">${r.title}</span>
      <span class="res-meta">
        ${meta}
        ${r.dueAt ? html`<span class="due ${overdue ? 'overdue' : ''}">${overdue ? 'Was due' : 'Due'} ${shortDate(r.dueAt)} (${relativeDays(r.dueAt)})</span>` : ''}
        ${r.placeholder ? html`<span class="badge">Sample</span>` : ''}
      </span>
    </span>`;

  return r.url
    ? html`<a class="res" data-item="${r.id}" href="${r.url}" target="_blank" rel="noopener noreferrer">${inner}<span class="res-go" aria-label="Opens in a new tab">${icons.arrow}</span></a>`
    : html`<div class="res res-disabled" data-item="${r.id}" title="No file attached yet">${inner}</div>`;
}

export function resourceList(items, opts) {
  return html`<div class="res-list">${items.map(r => resourceCard(r, opts))}</div>`;
}

/**
 * One row of the Updates feed: kind · subject · time, title, ≤2 lines of text,
 * and a single contextual CTA when the update deep-links to Hub content.
 * `level` = heading level of the title (2 on the Updates page, 3 under a section).
 */
export function updateItem(u, { level = 2 } = {}) {
  const subject = u.subjectId ? subjectById(u.subjectId) : null;
  const kind = updateKind(u);
  const path = hubPath(u.link);
  const cta = path ? ctaLabel(u.link) : null;
  return html`
    <article class="upd ${u.pinned ? 'is-pinned' : ''}" data-item="${u.id}">
      <div class="upd-main">
        <p class="upd-meta">
          ${u.pinned ? html`<span class="upd-pin">${icons.pin}<span>Pinned</span></span>` : ''}
          <span class="upd-kind kind-${kind}">${UPDATE_KINDS[kind].label}</span>
          ${subject ? html`<span class="mono">${subject.code}</span>` : ''}
          <time datetime="${u.publishedAt || ''}">${dateTime(u.publishedAt)}</time>
          ${u.placeholder ? html`<span class="badge">Sample</span>` : ''}
        </p>
        <p class="upd-title" role="heading" aria-level="${level}">${u.title}</p>
        ${u.body ? html`<p class="upd-body">${u.body}</p>` : ''}
      </div>
      ${cta ? html`<a class="upd-cta" href="#${path}">${cta}${icons.chevron}</a>` : ''}
    </article>`;
}

export function updateFeed(list, opts) {
  return html`<div class="upd-feed">${list.map(u => updateItem(u, opts))}</div>`;
}

/** Scrolls to and briefly highlights the element for a deep-linked ?item=… */
export function focusLinkedItem(root, id) {
  if (!id) return;
  const el = [...root.querySelectorAll('[data-item]')].find(x => x.dataset.item === id);
  if (!el) return;
  el.classList.add('is-linked');
  el.scrollIntoView({ block: 'center' });
}

export function subjectCard(s, index) {
  return html`
    <a class="subj" href="#/subjects/${s.id}">
      <span class="subj-top">
        <span class="subj-n mono">${pad2(index + 1)}</span>
        <span class="subj-code mono">${s.code}</span>
      </span>
      <span class="subj-name">${s.name}</span>
      <span class="subj-foot">
        <span>${s.resourceCount != null ? `${s.resourceCount} resources` : 'Open subject'}</span>
        ${icons.chevron}
      </span>
    </a>`;
}

export function chips(items, active, { name = 'filter' } = {}) {
  return html`
    <div class="chips" role="group" aria-label="${name}">
      ${items.map(it => html`<button type="button" class="chip ${it.value === active ? 'on' : ''}" data-value="${it.value}" aria-pressed="${it.value === active}">${it.label}${it.count != null ? html` <span class="chip-n mono">${it.count}</span>` : ''}</button>`)}
    </div>`;
}

export function emptyState(title, text) {
  return html`<div class="state"><p class="state-title">${title}</p>${text ? html`<p class="state-text">${text}</p>` : ''}</div>`;
}

export function errorState(err) {
  return html`<div class="state state-error" role="alert"><p class="state-title">Couldn’t load this</p><p class="state-text">${err?.message || 'Something went wrong.'}</p><button type="button" class="btn btn-ghost-dark" data-action="retry">Try again</button></div>`;
}

export function loadingState(label = 'Loading…') {
  return html`<div class="state state-loading" aria-busy="true"><span class="spinner" aria-hidden="true"></span><span>${label}</span></div>`;
}

export function formError(id) {
  return html`<p class="form-error" id="${id}" role="alert" hidden></p>`;
}

export function showFormError(el, message) {
  el.textContent = message || '';
  el.hidden = !message;
}

// Primary sign-in action. Logo per Microsoft's "Sign in with Microsoft" branding.
export function microsoftButton(id) {
  return html`
    <button type="button" class="btn btn-ms btn-block" id="${id}">
      <svg class="ms-logo" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
      <span class="ms-label">Continue with NASU Microsoft Account</span>
    </button>`;
}
