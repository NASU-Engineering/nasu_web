// Admin Control Center · Overview — the whole platform at a glance:
//   1. six KPIs, each once (no repeated statistics elsewhere on the page)
//   2. Action required — only things an admin must do, each linking to its workflow
//   3. Recent activity — real recorded events
//   4. Platform health — only checks that actually exist
// A metric whose source isn't connected says "Not collected" — never 0, never a guess.

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { CONFIG } from '../../config.js';
import { api, isDemoMode } from '../../services/api.js';
import { engagementEnabled } from '../../services/supabase-engage.js';
import { consoleShell, panel } from '../../ui/console.js';
import { emptyState, loadingState } from '../../ui/components.js';
import { timeAgo } from '../../ui/format.js';
import { t, formatNumber } from '../../i18n/index.js';

const settle = p => p.then(value => ({ value }), error => ({ error }));
const NOT_COLLECTED = 'backend_required';

/** A settled source → { value } | { missing: true } (not collected) | { failed: true }. */
const sourceState = r => (r.error ? (r.error.code === NOT_COLLECTED ? { missing: true } : { failed: true, error: r.error }) : { value: r.value });

/**
 * The six KPI cards from the settled sources. Pure (tested).
 * Each: { key, label, icon, value: number|null, state: 'ok'|'missing'|'failed', href }
 */
export function kpis({ stats, activity, apps }) {
  const pick = (src, fn) => (src.value != null ? { value: fn(src.value), state: 'ok' } : { value: null, state: src.missing ? 'missing' : 'failed' });
  const num = v => (v == null || isNaN(Number(v)) ? null : Number(v));
  const approved = apps.value?.approved_total != null ? pick(apps, a => num(a.approved_total)) : pick(stats, s => num(s.total_students));
  return [
    { key: 'approved', icon: 'users', href: '#/admin/people', ...approved },
    { key: 'online', icon: 'eye', href: '#/admin/analytics', ...pick(activity, a => num(a.online_now)) },
    { key: 'activeToday', icon: 'chart', href: '#/admin/analytics', ...pick(activity, a => num(a.active_24h)) },
    { key: 'applications', icon: 'inbox', href: '#/admin/people?view=applications', ...pick(apps, a => (num(a.pending) ?? 0) + (num(a.needs_review) ?? 0)) },
    { key: 'reviews', icon: 'check', href: '#/admin/content?status=pending_review', ...pick(stats, s => num(s.pending_reviews)) },
    { key: 'published', icon: 'book', href: '#/admin/content?status=published', ...pick(stats, s => num(s.published_resources)) },
  ];
}

/**
 * "Action required" lines — only non-zero items. Pure (tested).
 * → { items: [{ key, count, href, tone }], unknown: [sourceKey] }
 */
export function actionItems({ stats, apps, integrity }) {
  const items = [];
  const unknown = [];
  const add = (key, count, href, tone = 'warn') => { if (Number(count) > 0) items.push({ key, count: Number(count), href, tone }); };
  if (apps.value) {
    add('applicationsPending', apps.value.pending, '#/admin/people?view=applications&status=pending');
    add('applicationsNeedReview', apps.value.needs_review, '#/admin/people?view=applications&status=needs_review', 'bad');
  } else unknown.push('applications');
  if (stats.value) add('contentPending', stats.value.pending_reviews, '#/admin/content?status=pending_review');
  else unknown.push('content');
  if (integrity.value) {
    add('integrityPhones', integrity.value.approved_missing_phone, '#/admin/settings?open=integrity', 'bad');
    add('integrityRoster', integrity.value.applications_not_in_roster, '#/admin/people?view=applications&status=needs_review', 'bad');
    add('integrityDuplicates', integrity.value.duplicate_submissions, '#/admin/people?view=applications');
    add('integrityIntake', integrity.value.intake_errors, '#/admin/settings?open=integrity', 'bad');
  } else unknown.push('integrity');
  return { items, unknown };
}

/** Health checks that really exist in this build. Pure (tested). */
export function healthChecks({ stats, activity, demo = isDemoMode, engagement = engagementEnabled() }) {
  return [
    { key: 'auth', state: 'ok' }, // this page only renders for a signed-in, backend-confirmed admin
    { key: 'database', state: stats.value ? 'ok' : stats.missing ? 'missing' : 'failed' },
    { key: 'presence', state: activity.value ? 'ok' : activity.missing ? 'missing' : 'failed' },
    { key: 'engagement', state: demo || engagement ? 'ok' : 'missing' },
  ];
}

const kpiCard = k => html`
  <a class="kpi kpi-${k.state}" href="${k.href}">
    <span class="kpi-label">${icons[k.icon]}<span>${t(`admin.kpi.${k.key}`)}</span></span>
    ${k.state === 'ok'
      ? html`<span class="kpi-value mono">${formatNumber(k.value)}</span>`
      : html`<span class="kpi-value kpi-na">${k.state === 'missing' ? t('admin.notCollected') : t('admin.unavailable')}</span>`}
    ${k.key === 'online' && k.state === 'ok' ? html`<span class="kpi-hint">${t('admin.kpi.onlineHint')}</span>` : ''}
    ${k.key === 'activeToday' && k.state === 'ok' ? html`<span class="kpi-hint">${t('admin.kpi.activeHint')}</span>` : ''}
  </a>`;

const ACTIVITY_ICON = { auth: 'user', content: 'upload', role: 'shield', scope: 'shield', quiz: 'quiz', activity: 'flag', xp: 'star', application: 'inbox' };

/** Recent activity rows from admin_recent_activity, or the audit log when that isn't deployed. */
function activityRows(items) {
  if (!items.length) return emptyState(t('admin.noActivity'), t('admin.noActivityText'));
  return html`<ul class="act-feed">${items.map(e => {
    const domain = String(e.type || '').split('.')[0];
    const key = `activity.event.${String(e.type || '').replace('.', '_')}`;
    const label = t(key) === key ? e.type : t(key);
    return html`<li>
      <span class="act-icon">${icons[ACTIVITY_ICON[domain]] || icons.history}</span>
      <span class="act-text"><strong>${label}</strong>${e.actor ? html` · ${e.actor}` : ''}${e.entity ? html`<span class="muted"> — ${e.entity}</span>` : ''}</span>
      <time class="act-time muted" datetime="${e.at}">${timeAgo(e.at)}</time>
    </li>`;
  })}</ul>`;
}

const fromAudit = entry => ({ at: entry.createdAt, type: entry.action, actor: entry.actor?.fullName || '', entity: entry.metadata?.title || '' });

export default async function adminOverview({ access, path }) {
  return {
    title: t('experience.admin'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.adminOverview'),
      actions: html`<a class="btn btn-ghost btn-sm" href="#/admin/analytics">${icons.chart}<span>${t('admin.viewAnalytics')}</span></a>`,
      body: html`
        <div class="kpi-grid" id="ovKpis">${loadingState()}</div>
        <div class="ov-cols">
          ${panel(t('admin.actionRequired'), html`<div id="ovActions">${loadingState()}</div>`)}
          ${panel(t('admin.platformHealth'), html`<div id="ovHealth">${loadingState()}</div>`)}
        </div>
        ${panel(t('admin.recentActivity'), html`<div id="ovActivity">${loadingState()}</div>`)}`,
    }),
    async bind(root) {
      const [stats, activity, apps, integrity] = (await Promise.all([
        settle(api.admin.getStats()),
        settle(api.ops.activitySummary()),
        settle(api.ops.applicationSummary()),
        settle(api.ops.integritySummary()),
      ])).map(sourceState);
      if (!root.isConnected) return;

      mount(root.querySelector('#ovKpis'), kpis({ stats, activity, apps }).map(kpiCard));

      const { items, unknown } = actionItems({ stats, apps, integrity });
      mount(root.querySelector('#ovActions'), html`
        ${items.length
          ? html`<ul class="action-list">${items.map(i => html`
              <li><a class="action-item action-${i.tone}" href="${i.href}">
                <span class="action-dot" aria-hidden="true"></span>
                <span class="action-text">${t(`admin.action.${i.key}`, { count: i.count })}</span>${icons.chevron}
              </a></li>`)}</ul>`
          : html`<p class="all-clear">${icons.check}<span>${t('admin.allClear')}</span></p>`}
        ${unknown.length ? html`<p class="help-dark">${t('admin.notCollectedSources', { list: unknown.map(u => t(`admin.source.${u}`)).join(' · ') })}</p>` : ''}`);

      mount(root.querySelector('#ovHealth'), html`
        <ul class="health-list">${healthChecks({ stats, activity }).map(h => html`
          <li><span class="health-dot health-${h.state}" aria-hidden="true"></span>
            <span class="health-name">${t(`admin.health.${h.key}`)}</span>
            <span class="health-state">${t(`admin.healthState.${h.state}`)}</span></li>`)}
        </ul>
        <p class="help-dark">${t('admin.environment', { env: t(`env.${isDemoMode ? 'preview' : CONFIG.environment || 'production'}`) })}</p>`);

      const feed = root.querySelector('#ovActivity');
      try {
        const recent = await api.ops.recentActivity({ limit: 8 });
        if (feed.isConnected) mount(feed, activityRows(recent.items || []));
      } catch (err) {
        if (err.code !== NOT_COLLECTED) { if (feed.isConnected) mount(feed, emptyState(t('state.loadFailed'), err.message)); return; }
        // Not deployed yet: the audit log is real, recorded data — show that instead, labelled.
        try {
          const page = await api.admin.listAuditLog({ limit: 8 });
          if (feed.isConnected) mount(feed, html`${activityRows(page.items.map(fromAudit))}<p class="help-dark">${t('admin.activityFromAudit')}</p>`);
        } catch (e) {
          if (feed.isConnected) mount(feed, emptyState(t('state.loadFailed'), e.message));
        }
      }
    },
  };
}
