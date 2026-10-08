// Platform analytics + activity monitoring. Every number is labelled with where
// it comes from; nothing is estimated. See services/activity.js.

import { html } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { consoleShell, statTile, panel, fill } from '../../ui/console.js';
import { emptyState } from '../../ui/components.js';
import { dateTime } from '../../ui/format.js';
import { trackingCoverage, observedActions, dailyCounts } from '../../services/activity.js';

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

const STATUS = {
  recorded:      { label: 'Recorded',      cls: 'av-live' },
  not_seen:      { label: 'Not seen yet',  cls: 'av-partial' },
  not_collected: { label: 'Not collected', cls: 'av-none' },
};

const legend = html`
  <ul class="av-legend" aria-label="Data availability">
    <li><span class="av av-live">Live</span> read from the backend now</li>
    <li><span class="av av-partial">Sample</span> derived from the latest audit-log entries</li>
    <li><span class="av av-none">Not collected</span> no data source exists yet</li>
  </ul>`;

function activityChart(entries) {
  const days = dailyCounts(entries);
  const max = Math.max(1, ...days.map(d => d.count));
  return html`
    <div class="bars" role="img" aria-label="Audit entries per day over the last ${days.length} days">
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
        <thead><tr><th scope="col">Event</th><th scope="col">Status</th><th scope="col">In sample</th><th scope="col">Last seen</th></tr></thead>
        <tbody>${rows.map(r => html`
          <tr>
            <td data-label="Event">${r.label}</td>
            <td data-label="Status"><span class="av ${STATUS[r.status].cls}">${STATUS[r.status].label}</span></td>
            <td data-label="In sample" class="mono">${r.status === 'not_collected' ? '—' : r.count}</td>
            <td data-label="Last seen">${r.lastAt ? dateTime(r.lastAt) : '—'}</td>
          </tr>`)}</tbody>
      </table>
    </div>`;
}

function actionsTable(entries) {
  const rows = observedActions(entries);
  if (!rows.length) return emptyState('No audit entries yet');
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th scope="col">Action (as recorded)</th><th scope="col">Count</th><th scope="col">Last</th></tr></thead>
        <tbody>${rows.map(r => html`
          <tr><td data-label="Action"><span class="mono">${r.action}</span></td><td data-label="Count" class="mono">${r.count}</td><td data-label="Last">${dateTime(r.lastAt)}</td></tr>`)}</tbody>
      </table>
    </div>`;
}

export default async function adminAnalytics({ access, path }) {
  return {
    title: 'Analytics',
    html: consoleShell({
      access, path,
      eyebrow: 'ADMIN CONTROL CENTER',
      title: 'Analytics',
      lead: 'Platform metrics and activity monitoring. Each figure says where it comes from — nothing is estimated.',
      body: html`
        ${legend}
        <div id="anStats" class="stat-grid stat-grid-wide"></div>
        <div id="anAudit"></div>
        ${panel('Online presence', html`
          <div class="av-row"><span class="av av-none">Not collected</span>
          <p class="muted">The Hub doesn’t record presence, so it can’t show who is online. A privacy-conscious design (aggregate counts from a short-lived heartbeat, no keystrokes or page content) is proposed for approval in <span class="mono">docs/ACTIVITY_MONITORING.md</span>.</p></div>`)}`,
    }),
    bind(root) {
      fill(root.querySelector('#anStats'), {
        load: () => api.admin.getStats(), what: 'Platform statistics',
        render: s => html`
          ${statTile({ label: 'Students', value: s.total_students, icon: 'users', hint: 'Live' })}
          ${statTile({ label: 'Section editors', value: s.section_editors, icon: 'upload', hint: 'Live' })}
          ${statTile({ label: 'Content managers', value: s.content_managers, icon: 'shield', hint: 'Live' })}
          ${statTile({ label: 'Pending reviews', value: s.pending_reviews, icon: 'inbox', hint: 'Live' })}
          ${statTile({ label: 'Published resources', value: s.published_resources, icon: 'book', hint: 'Live' })}`,
      });
      fill(root.querySelector('#anAudit'), {
        load: loadAuditSample, what: 'The audit log',
        render: ({ entries, complete }) => {
          const note = `${complete ? 'All' : 'Latest'} ${entries.length} audit-log entr${entries.length === 1 ? 'y' : 'ies'}`;
          return html`
            ${panel('Activity — last 14 days', html`<p class="help-dark"><span class="av av-partial">Sample</span> ${note}, per day.</p>${activityChart(entries)}`)}
            <div class="console-cols">
              ${panel('Tracking coverage', html`<p class="help-dark">What the audit log contains for each event we want to monitor (${note}).</p>${coverageTable(entries)}`)}
              ${panel('Recorded actions', html`<p class="help-dark">Distinct actions found in the same sample, exactly as the backend names them.</p>${actionsTable(entries)}`)}
            </div>`;
        },
      });
    },
  };
}
