// Admin · Insights · Analytics: platform metrics and activity monitoring.
// Every figure says where it comes from; nothing is estimated and nothing is
// "real-time" (there is no presence data source). See services/activity.js.

import { html } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { consoleShell, statTile, panel, fill } from '../../ui/console.js';
import { emptyState } from '../../ui/components.js';
import { dateTime } from '../../ui/format.js';
import { trackingCoverage, observedActions, dailyCounts } from '../../services/activity.js';
import { t } from '../../i18n/index.js';

const SAMPLE_PAGES = 3; // audit log pages read for the activity sample (≤ 150 entries)

async function loadAuditSample() {
  let cursor = null;
  const entries = [];
  for (let i = 0; i < SAMPLE_PAGES; i++) {
    const page = await api.admin.listAuditLog({ cursor });
    entries.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { entries, complete: !cursor };
}

const STATUS_CLS = { recorded: 'av-live', not_seen: 'av-partial', not_collected: 'av-none' };
const avBadge = (cls, key) => html`<span class="av ${cls}">${t(key)}</span>`;

const legend = () => html`
  <ul class="av-legend" aria-label="${t('analytics.legend')}">
    <li>${avBadge('av-live', 'status.source.live')} ${t('analytics.legendLive')}</li>
    <li>${avBadge('av-partial', 'status.source.sample')} ${t('analytics.legendSample')}</li>
    <li>${avBadge('av-none', 'status.source.not_live')} ${t('analytics.legendNone')}</li>
  </ul>`;

function activityChart(entries) {
  const days = dailyCounts(entries);
  const max = Math.max(1, ...days.map(d => d.count));
  return html`
    <div class="bars" role="img" aria-label="${t('analytics.chartLabel', { days: days.length })}">
      ${days.map(d => html`
        <div class="bar" title="${d.day}: ${d.count}">
          <span class="bar-fill" style="height:${Math.round((d.count / max) * 100)}%"></span>
          <span class="bar-label mono">${d.day.slice(8)}</span>
        </div>`)}
    </div>`;
}

function coverageTable(entries) {
  const rows = trackingCoverage(entries);
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th scope="col">${t('analytics.event')}</th><th scope="col">${t('analytics.status')}</th><th scope="col">${t('analytics.inSample')}</th><th scope="col">${t('analytics.lastSeen')}</th></tr></thead>
        <tbody>${rows.map(r => html`
          <tr>
            <td data-label="${t('analytics.event')}">${r.label}</td>
            <td data-label="${t('analytics.status')}">${avBadge(STATUS_CLS[r.status], `analytics.coverage.${r.status}`)}</td>
            <td data-label="${t('analytics.inSample')}" class="mono">${r.status === 'not_collected' ? '—' : r.count}</td>
            <td data-label="${t('analytics.lastSeen')}">${r.lastAt ? dateTime(r.lastAt) : '—'}</td>
          </tr>`)}</tbody>
      </table>
    </div>`;
}

function actionsTable(entries) {
  const rows = observedActions(entries);
  if (!rows.length) return emptyState(t('audit.empty'));
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th scope="col">${t('analytics.actionRecorded')}</th><th scope="col">${t('analytics.count')}</th><th scope="col">${t('analytics.last')}</th></tr></thead>
        <tbody>${rows.map(r => html`
          <tr><td data-label="${t('audit.action')}"><span class="mono">${r.action}</span></td><td data-label="${t('analytics.count')}" class="mono">${r.count}</td><td data-label="${t('analytics.last')}">${dateTime(r.lastAt)}</td></tr>`)}</tbody>
      </table>
    </div>`;
}

export default async function adminAnalytics({ access, path }) {
  return {
    title: t('nav.analytics'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.insights'),
      lead: t('analytics.lead'),
      body: html`
        ${legend()}
        <div id="anStats" class="stat-grid stat-grid-wide"></div>
        <div id="anAudit"></div>
        ${panel(t('analytics.presence'), html`
          <div class="av-row">${avBadge('av-none', 'status.source.not_live')}<p class="muted">${t('analytics.presenceText')}</p></div>`)}`,
    }),
    bind(root) {
      fill(root.querySelector('#anStats'), {
        load: () => api.admin.getStats(),
        render: s => html`
          ${statTile({ label: t('admin.stat.students'), value: s.total_students, icon: 'users', hint: t('status.source.live') })}
          ${statTile({ label: t('admin.stat.editors'), value: s.section_editors, icon: 'upload', hint: t('status.source.live') })}
          ${statTile({ label: t('admin.stat.managers'), value: s.content_managers, icon: 'shield', hint: t('status.source.live') })}
          ${statTile({ label: t('admin.stat.pending'), value: s.pending_reviews, icon: 'inbox', hint: t('status.source.live') })}
          ${statTile({ label: t('admin.stat.published'), value: s.published_resources, icon: 'book', hint: t('status.source.live') })}`,
      });
      fill(root.querySelector('#anAudit'), {
        load: loadAuditSample,
        render: ({ entries, complete }) => {
          const note = complete ? t('analytics.sampleAll', { count: entries.length }) : t('analytics.sampleLatest', { count: entries.length });
          return html`
            ${panel(t('analytics.activity14'), html`<p class="help-dark">${avBadge('av-partial', 'status.source.sample')} ${note}</p>${activityChart(entries)}`)}
            <div class="console-cols">
              ${panel(t('analytics.coverage'), html`<p class="help-dark">${t('analytics.coverageText')} (${note})</p>${coverageTable(entries)}`)}
              ${panel(t('analytics.recordedActions'), html`<p class="help-dark">${t('analytics.recordedActionsText')}</p>${actionsTable(entries)}`)}
            </div>`;
        },
      });
    },
  };
}
