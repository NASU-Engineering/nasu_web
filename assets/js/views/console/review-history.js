// Review decisions timeline (used by Admin → Detailed analytics), built from
// processed content items (approved / rejected / published). No extra backend call.

import { html } from '../../ui/html.js';
import { subjectById } from '../../data/catalog.js';
import { emptyState } from '../../ui/components.js';
import { statusBadge } from '../../ui/workflow.js';
import { shortDate, timeOfDay } from '../../ui/format.js';
import { t } from '../../i18n/index.js';

/**
 * Decision events from processed items, newest first:
 * { kind: 'approved'|'rejected'|'published', at, item }
 */
export function reviewEvents(items) {
  const out = [];
  for (const item of items || []) {
    if (item.reviewedAt) out.push({ kind: item.status === 'rejected' ? 'rejected' : 'approved', at: item.reviewedAt, item });
    if (item.publishedAt) out.push({ kind: 'published', at: item.publishedAt, item });
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

const KIND_STATUS = { approved: 'approved', rejected: 'rejected', published: 'published' };

export function timeline(events, hrefFor, level = 2) {
  if (!events.length) return emptyState(t('insights.noDecisions'), t('insights.noDecisionsText'));
  const days = [];
  for (const e of events) {
    const day = shortDate(e.at) || '—';
    if (!days.length || days[days.length - 1].day !== day) days.push({ day, events: [] });
    days[days.length - 1].events.push(e);
  }
  return html`<div class="timeline">${days.map(d => html`
    <section class="tl-day">
      <p class="tl-day-label" role="heading" aria-level="${level}">${d.day}</p>
      <ol class="tl-list">${d.events.map(e => html`
        <li class="tl-item">
          <span class="tl-time mono">${timeOfDay(e.at)}</span>
          <div class="tl-body">
            <p class="tl-line">${statusBadge(KIND_STATUS[e.kind])}
              <a href="${hrefFor(e.item)}">${e.item.title}</a>
              <span class="tl-meta">${subjectById(e.item.subjectId)?.code || ''}${e.kind !== 'published' && e.item.reviewer ? ` · ${t('common.byName', { name: e.item.reviewer.fullName })}` : ''}</span></p>
            ${e.kind === 'rejected' && e.item.reviewNote ? html`<p class="tl-note">“${e.item.reviewNote}”</p>` : ''}
          </div>
        </li>`)}</ol>
    </section>`)}</div>`;
}

