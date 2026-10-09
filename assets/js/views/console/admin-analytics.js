// Admin · Detailed analytics (contextual page from Overview): usage and presence,
// audit-log activity, engagement and the latest review decisions.
// Every figure says where it comes from; nothing is estimated. Presence and
// daily-active numbers need the activity migration — until then "Not collected".

import { html, mount } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { consoleShell, statTile, panel, fill } from '../../ui/console.js';
import { emptyState } from '../../ui/components.js';
import { dateTime } from '../../ui/format.js';
import { trackingCoverage, observedActions, dailyCounts } from '../../services/activity.js';
import { reviewEvents, timeline } from './review-history.js';
import { t, formatNumber } from '../../i18n/index.js';

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

const settle = p => p.then(value => ({ value }), error => ({ error }));
const naText = err => (err?.code === 'backend_required' ? t('admin.notCollected') : t('admin.unavailable'));

/** Detailed analytics — opened from Overview ("View detailed analytics"), not a tab. */
export default async function adminAnalytics({ access, path }) {
  return {
    title: t('analytics.title'),
    html: consoleShell({
      access, path,
      back: { href: '/admin', label: t('nav.adminOverview') },
      eyebrow: t('experience.admin'),
      title: t('analytics.title'),
      lead: t('analytics.lead'),
      body: html`
        ${legend()}
        ${panel(t('analytics.usage'), html`<div id="anUsage" class="stat-grid"></div>`)}
        <div id="anAudit"></div>
        <div class="console-cols">
          ${panel(t('nav.engagement'), html`<div id="anEngage"></div>`)}
          ${panel(t('insights.latestDecisions'), html`<div id="anReviews"></div>`)}
        </div>`,
    }),
    async bind(root) {
      // Usage: presence + daily activity (Not collected until the activity migration is applied).
      const usage = await settle(api.ops.activitySummary());
      const u = root.querySelector('#anUsage');
      if (u?.isConnected) {
        const tile = (label, key, icon) => statTile({ label, icon, value: usage.value ? usage.value[key] : null, hint: usage.value ? t('status.source.live') : naText(usage.error) });
        mount(u, html`
          ${tile(t('admin.kpi.online'), 'online_now', 'eye')}
          ${tile(t('admin.kpi.activeToday'), 'active_24h', 'chart')}
          ${tile(t('analytics.signIns24h'), 'sign_ins_24h', 'user')}`);
      }
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
      fill(root.querySelector('#anEngage'), {
        load: () => api.engage.adminStats(),
        render: s => html`
          <dl class="facts">
            <div><dt>${t('engage.studentsWithXp')}</dt><dd class="mono">${formatNumber(s.students_with_xp)}</dd></div>
            <div><dt>${t('engage.xpTotal')}</dt><dd class="mono">${formatNumber(s.xp_total)}</dd></div>
            <div><dt>${t('engage.quizAttempts')}</dt><dd class="mono">${formatNumber(s.quiz_attempts)}</dd></div>
            <div><dt>${t('engage.participants')}</dt><dd class="mono">${formatNumber(s.activity_participants)}</dd></div>
          </dl>
          ${s.top?.length ? html`<ol class="board">${s.top.map(p => html`
            <li><span class="board-rank mono">${p.rank}</span><span class="board-name">${p.name}</span><span class="board-level mono">${t('progress.levelShort', { level: p.level })}</span><span class="board-xp mono">${formatNumber(p.xp)} XP</span></li>`)}</ol>` : ''}`,
      });
      fill(root.querySelector('#anReviews'), {
        load: () => api.review.listQueue({ status: 'processed' }),
        render: page => timeline(reviewEvents(page.items).slice(0, 12), it => `#/admin/content/${encodeURIComponent(it.id)}`, 3),
      });
    },
  };
}
