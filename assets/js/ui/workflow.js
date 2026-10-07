// Markup for content submissions (editor + review + admin). Auto-escaped.

import { html } from './html.js';
import { icons } from './icons.js';
import { subjectById, categoryById } from '../data/catalog.js';
import { statusMeta, formatBytes } from '../services/content-workflow.js';
import { shortDate, pad2 } from './format.js';

export function statusBadge(status) {
  const m = statusMeta(status);
  return html`<span class="status status-${m.tone}"><span class="status-dot" aria-hidden="true"></span>${m.label}</span>`;
}

export function targetLabel(item) {
  const group = item.group ?? 'All groups';
  const section = item.section ?? 'All sections';
  return `${group} · ${section}`;
}

export const personLabel = p => (p ? `${p.fullName || 'Unknown'}${p.studentId ? ` (${p.studentId})` : ''}` : '—');

/** The reviewer's reason on a rejected item — always visible to the editor. */
export function reviewNoteBox(item) {
  if (!item.reviewNote) return '';
  const rejected = item.status === 'rejected';
  return html`
    <div class="review-note ${rejected ? 'is-rejected' : ''}" ${rejected ? html`role="note"` : ''}>
      <p class="review-note-head">${rejected ? icons.alert : icons.check}<span>${rejected ? 'Rejected — reason from the reviewer' : 'Reviewer note'}</span></p>
      <p class="review-note-text">${item.reviewNote}</p>
      ${item.reviewer || item.reviewedAt ? html`<p class="review-note-meta">${item.reviewer ? item.reviewer.fullName : ''}${item.reviewedAt ? ` · ${shortDate(item.reviewedAt)}` : ''}</p>` : ''}
    </div>`;
}

/**
 * One row in a submissions table/list. `href` makes the row a link.
 * `show`: which extra columns to include ('submitter').
 */
export function contentRow(item, { href, show = [] } = {}) {
  const subject = subjectById(item.subjectId);
  const cat = categoryById(item.contentType);
  const kind = [cat?.single?.toUpperCase(), item.week ? `WEEK ${pad2(item.week)}` : '', subject?.code].filter(Boolean).join(' · ');
  const date = item.status === 'pending_review' ? item.submittedAt : (item.reviewedAt || item.updatedAt || item.createdAt);
  const inner = html`
    <span class="res-icon cat-${item.contentType}">${icons[item.contentType] || icons.file}</span>
    <span class="row-main">
      <span class="res-kind mono">${kind}</span>
      <span class="row-title">${item.title}</span>
      <span class="row-meta">
        <span>${targetLabel(item)}</span>
        ${show.includes('submitter') && item.submitter ? html`<span>by ${item.submitter.fullName}</span>` : ''}
        ${date ? html`<span>${shortDate(date)}</span>` : ''}
      </span>
      ${item.status === 'rejected' && item.reviewNote ? html`<span class="row-reason"><strong>Reason:</strong> ${item.reviewNote}</span>` : ''}
    </span>
    <span class="row-status">${statusBadge(item.status)}</span>`;
  return href
    ? html`<a class="row" href="${href}">${inner}<span class="row-go">${icons.chevron}</span></a>`
    : html`<div class="row">${inner}</div>`;
}

export function contentRows(list, opts) {
  return html`<div class="rows">${list.map(it => contentRow(it, { ...opts, href: opts?.hrefFor?.(it) }))}</div>`;
}

export function fileLabel(file) {
  if (!file) return 'No file attached';
  return [file.name, formatBytes(file.size)].filter(Boolean).join(' · ');
}

/** Definition list of an item's facts (detail pages). */
export function itemFacts(item, { withSubmitter = true } = {}) {
  const subject = subjectById(item.subjectId);
  const facts = [
    ['Subject', subject ? `${subject.code} — ${subject.name}` : item.subjectId || '—'],
    ['Type', categoryById(item.contentType)?.single || item.contentType],
    ['Week', item.week ?? '—'],
    ['Group', item.group ?? 'All groups'],
    ['Section', item.section ?? 'All sections'],
    withSubmitter ? ['Submitted by', personLabel(item.submitter)] : null,
    ['Uploaded', item.submittedAt ? shortDate(item.submittedAt) : (item.createdAt ? shortDate(item.createdAt) : '—')],
    item.reviewedAt ? ['Reviewed', `${shortDate(item.reviewedAt)}${item.reviewer ? ` by ${item.reviewer.fullName}` : ''}`] : null,
    item.publishedAt ? ['Published', shortDate(item.publishedAt)] : null,
    ['File', fileLabel(item.file)],
  ].filter(Boolean);
  return html`<dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

/** Draft → Pending review → Approved / Rejected → Published, with the current step marked. */
export function statusTrack(status) {
  const order = ['draft', 'pending_review', status === 'rejected' ? 'rejected' : 'approved', 'published'];
  const at = order.indexOf(status);
  return html`
    <ol class="track" aria-label="Workflow">
      ${order.map((s, i) => html`<li class="${i < at ? 'done' : ''} ${i === at ? `now tone-${statusMeta(s).tone}` : ''}" ${i === at ? html`aria-current="step"` : ''}><span class="track-dot" aria-hidden="true"></span><span>${statusMeta(s).label}</span></li>`)}
    </ol>`;
}
