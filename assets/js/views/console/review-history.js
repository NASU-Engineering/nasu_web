// Admin → Insights → Review activity:
// a timeline of decisions built from processed content items (approved /
// rejected / published). No extra backend call — see reviewEvents().

import { html } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { subjectById } from '../../data/catalog.js';
import { consoleShell, statTile, fill, panel } from '../../ui/console.js';
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

function timeline(events, hrefFor, level = 2) {
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

/** Admin → Insights → Review activity: what's waiting + a timeline of the latest decisions. */
export async function adminReviewActivity({ access, path }) {
  const hrefFor = it => `#/admin/content/${encodeURIComponent(it.id)}`;
  return {
    title: t('nav.reviewActivity'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.insights'),
      lead: t('insights.reviewsLead'),
      body: html`
        <div id="rhStats" class="stat-grid"></div>
        ${panel(t('insights.latestDecisions'), html`<div id="rhList"></div>`)}`,
    }),
    bind(root) {
      const processed = api.review.listQueue({ status: 'processed' });
      fill(root.querySelector('#rhList'), {
        load: () => processed,
        render: page => timeline(reviewEvents(page.items), hrefFor, 3),
      });
      fill(root.querySelector('#rhStats'), {
        load: async () => ({ pending: await api.review.listQueue({ status: 'pending_review' }), processed: await processed }),
        render: ({ pending, processed: done }) => {
          const n = s => done.items.filter(i => i.status === s).length;
          const hint = t('insights.inLatest', { count: done.items.length });
          return html`
            ${statTile({ label: t('insights.waiting'), value: `${pending.items.length}${pending.nextCursor ? '+' : ''}`, icon: 'inbox', href: '#/admin/content/review' })}
            ${statTile({ label: t('insights.approvedUnpublished'), value: n('approved'), icon: 'check', hint })}
            ${statTile({ label: t('status.rejected'), value: n('rejected'), icon: 'alert', hint })}
            ${statTile({ label: t('status.published'), value: n('published'), icon: 'book', hint })}`;
        },
      });
    },
  };
}
