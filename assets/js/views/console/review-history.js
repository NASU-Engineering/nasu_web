// Review History (Review Desk) and Review activity (Admin Control Center):
// a timeline of decisions built from processed content items (approved /
// rejected / published). No extra backend call — see reviewEvents().

import { html } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { subjectById } from '../../data/catalog.js';
import { consoleShell, statTile, fill, panel } from '../../ui/console.js';
import { emptyState } from '../../ui/components.js';
import { statusBadge } from '../../ui/workflow.js';
import { dateTime, shortDate } from '../../ui/format.js';

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

function timeline(events, hrefFor, level = 2) {
  if (!events.length) return emptyState('No decisions yet', 'Approvals, rejections and publications appear here.');
  const days = [];
  for (const e of events) {
    const day = shortDate(e.at) || 'Undated';
    if (!days.length || days[days.length - 1].day !== day) days.push({ day, events: [] });
    days[days.length - 1].events.push(e);
  }
  return html`<div class="timeline">${days.map(d => html`
    <section class="tl-day">
      <p class="tl-day-label" role="heading" aria-level="${level}">${d.day}</p>
      <ol class="tl-list">${d.events.map(e => html`
        <li class="tl-item">
          <span class="tl-time mono">${dateTime(e.at).split(', ').pop()}</span>
          <div class="tl-body">
            <p class="tl-line">${statusBadge(KIND_STATUS[e.kind])}
              <a href="${hrefFor(e.item)}">${e.item.title}</a>
              <span class="tl-meta">${subjectById(e.item.subjectId)?.code || ''}${e.kind !== 'published' && e.item.reviewer ? ` · by ${e.item.reviewer.fullName}` : ''}</span></p>
            ${e.kind === 'rejected' && e.item.reviewNote ? html`<p class="tl-note">“${e.item.reviewNote}”</p>` : ''}
          </div>
        </li>`)}</ol>
    </section>`)}</div>`;
}

function makeView({ admin }) {
  return async function historyView({ access, path }) {
    const hrefFor = it => `#${admin ? '/admin/content' : '/review'}/${encodeURIComponent(it.id)}`;
    return {
      title: admin ? 'Review activity' : 'Review history',
      html: consoleShell({
        access, path,
        eyebrow: admin ? 'ADMIN CONTROL CENTER' : 'REVIEW DESK',
        title: admin ? 'Review activity' : 'History',
        lead: admin
          ? 'How the review pipeline is moving: what’s waiting and the latest decisions.'
          : 'Every approval, rejection and publication, newest first.',
        body: html`
          ${admin ? html`<div id="rhStats" class="stat-grid"></div>` : ''}
          ${admin ? panel('Latest decisions', html`<div id="rhList"></div>`) : html`<div id="rhList"></div>`}`,
      }),
      bind(root) {
        const processed = api.review.listQueue({ status: 'processed' });
        fill(root.querySelector('#rhList'), {
          load: () => processed, what: 'Review history',
          render: page => timeline(reviewEvents(page.items), hrefFor, admin ? 3 : 2),
        });
        const stats = root.querySelector('#rhStats');
        if (stats) {
          fill(stats, {
            load: async () => ({ pending: await api.review.listQueue({ status: 'pending_review' }), processed: await processed }),
            what: 'Review activity',
            render: ({ pending, processed: done }) => {
              const n = s => done.items.filter(i => i.status === s).length;
              const hint = `in the latest ${done.items.length} decisions`;
              return html`
                ${statTile({ label: 'Waiting for review', value: `${pending.items.length}${pending.nextCursor ? '+' : ''}`, icon: 'inbox' })}
                ${statTile({ label: 'Approved, not yet published', value: n('approved'), icon: 'check', hint })}
                ${statTile({ label: 'Rejected', value: n('rejected'), icon: 'alert', hint })}
                ${statTile({ label: 'Published', value: n('published'), icon: 'book', hint })}`;
            },
          });
        }
      },
    };
  };
}

export const reviewHistory = makeView({ admin: false });
export const adminReviewActivity = makeView({ admin: true });
