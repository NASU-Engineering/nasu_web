// Admin Control Center · Overview: platform status, key metrics, pending
// decisions and recent important activity. Every figure comes from the backend
// (or says it isn't available); nothing is estimated or "real-time".

import { html, mount } from '../../ui/html.js';
import { api, isDemoMode, usesSampleContent } from '../../services/api.js';
import { consoleShell, statTile, panel, fill } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { auditRows } from './admin-audit.js';
import { emptyState } from '../../ui/components.js';
import { t } from '../../i18n/index.js';

const settle = p => p.then(value => ({ value }), error => ({ error }));

/** One line of the platform status card. state: live | sample | not_live */
const statusLine = (label, state, text) => html`
  <li><span class="av ${state === 'live' ? 'av-live' : state === 'sample' ? 'av-partial' : 'av-none'}">${t(`status.source.${state}`)}</span>
  <span><strong>${label}</strong> — ${text}</span></li>`;

export default async function adminOverview({ access, path }) {
  return {
    title: t('experience.admin'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.adminOverview'),
      lead: t('admin.overviewLead'),
      body: html`
        ${panel(t('admin.platformStatus'), html`<ul class="status-lines" id="adStatus">${t('common.loading')}</ul>`)}
        <div id="adStats" class="stat-grid stat-grid-wide"></div>
        <div class="console-cols">
          ${panel(t('admin.pendingDecisions'), html`<div id="adQueue"></div>`, { action: html`<a class="see-all" href="#/admin/content/review">${t('nav.reviewQueue')}</a>` })}
          ${panel(t('admin.recentActivity'), html`<div id="adAudit"></div>`, { action: html`<a class="see-all" href="#/admin/insights/audit">${t('nav.auditLog')}</a>` })}
        </div>`,
    }),
    bind(root) {
      fill(root.querySelector('#adStats'), {
        load: () => api.admin.getStats(),
        render: s => html`
          ${statTile({ label: t('admin.stat.students'), value: s.total_students, icon: 'users', href: '#/admin/people' })}
          ${statTile({ label: t('admin.stat.editors'), value: s.section_editors, icon: 'upload', href: '#/admin/people/staff?role=section_editor' })}
          ${statTile({ label: t('admin.stat.managers'), value: s.content_managers, icon: 'shield', href: '#/admin/people/staff?role=content_manager' })}
          ${statTile({ label: t('admin.stat.pending'), value: s.pending_reviews, icon: 'inbox', href: '#/admin/content/review' })}
          ${statTile({ label: t('admin.stat.published'), value: s.published_resources, icon: 'book', href: '#/admin/content?status=published' })}`,
      });
      fill(root.querySelector('#adQueue'), {
        load: () => api.review.listQueue({ status: 'pending_review', limit: 5 }),
        render: page => page.items.length
          ? contentRows(page.items, { hrefFor: it => `#/admin/content/${encodeURIComponent(it.id)}`, show: ['submitter'] })
          : emptyState(t('review.caughtUp'), t('review.caughtUpText')),
      });
      fill(root.querySelector('#adAudit'), {
        load: () => api.admin.listAuditLog({ limit: 6 }),
        render: page => page.items.length ? auditRows(page.items, { compact: true }) : emptyState(t('audit.empty')),
      });
      // Platform status: where each kind of data comes from right now.
      (async () => {
        const [stats, engage] = await Promise.all([settle(api.admin.getStats()), settle(api.engage.adminStats())]);
        const el = root.querySelector('#adStatus');
        if (!el) return;
        mount(el, html`
          ${statusLine(t('admin.status.accounts'), isDemoMode ? 'sample' : stats.error ? 'not_live' : 'live', isDemoMode ? t('admin.status.mockText') : stats.error ? t('admin.status.unreachable') : t('admin.status.liveText'))}
          ${statusLine(t('admin.status.content'), isDemoMode || usesSampleContent ? 'sample' : 'live', isDemoMode || usesSampleContent ? t('admin.status.sampleContent') : t('admin.status.liveText'))}
          ${statusLine(t('admin.status.engagement'), engage.error ? 'not_live' : 'sample', engage.error ? t('admin.status.engagementNotLive') : t('admin.status.mockText'))}
          ${statusLine(t('admin.status.presence'), 'not_live', t('admin.status.presenceText'))}`);
      })();
    },
  };
}
