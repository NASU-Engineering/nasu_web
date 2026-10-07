// Audit log: who did what, to which entity, when — plus raw metadata.

import { html, mount } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';
import { personLabel } from '../../ui/workflow.js';

const ACTION_FILTERS = [
  { value: '', label: 'All' },
  { value: 'content.', label: 'Content' },
  { value: 'role.', label: 'Roles' },
  { value: 'scope.', label: 'Scopes' },
];

const timeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const when = iso => { const d = new Date(iso); return iso && !isNaN(d) ? timeFmt.format(d) : '—'; };
const tone = action => (/reject|revok|delete|remov/.test(action) ? 'bad' : /approv|publish|grant/.test(action) ? 'ok' : 'neutral');

function metadataView(meta) {
  if (!meta || !Object.keys(meta).length) return html`<span class="muted">—</span>`;
  const entries = Object.entries(meta);
  const simple = entries.every(([, v]) => v == null || typeof v !== 'object');
  if (simple && entries.length <= 3) {
    return html`<span class="meta-kv">${entries.map(([k, v]) => html`<span><span class="mono">${k}</span>: ${String(v)}</span>`)}</span>`;
  }
  return html`<details class="meta-raw"><summary>${entries.length} field${entries.length === 1 ? '' : 's'}</summary><pre class="mono">${JSON.stringify(meta, null, 2)}</pre></details>`;
}

export function auditRows(entries, { compact = false } = {}) {
  if (compact) {
    return html`<ul class="audit-compact">${entries.map(e => html`
      <li><span class="audit-action mono tone-${tone(e.action)}">${e.action}</span>
      <span>${e.actor?.fullName || 'System'}</span><span class="muted">${when(e.createdAt)}</span></li>`)}</ul>`;
  }
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Entity</th><th scope="col">Details</th></tr></thead>
        <tbody>${entries.map(e => html`
          <tr>
            <td data-label="When" class="nowrap">${when(e.createdAt)}</td>
            <td data-label="Actor">${e.actor ? personLabel(e.actor) : 'System'}</td>
            <td data-label="Action"><span class="audit-action mono tone-${tone(e.action)}">${e.action}</span></td>
            <td data-label="Entity"><span class="mono">${e.entityType}${e.entityId ? ` · ${e.entityId}` : ''}</span></td>
            <td data-label="Details">${metadataView(e.metadata)}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>`;
}

export default async function adminAudit({ access, path }) {
  let action = '';
  return {
    title: 'Audit log',
    html: consoleShell({
      access, path,
      eyebrow: 'ADMIN CONTROL CENTER',
      title: 'Audit log',
      lead: 'Every privileged change, recorded by the backend. Read-only.',
      body: html`
        <div class="toolbar">${chips(ACTION_FILTERS, '', { name: 'Filter by action' })}</div>
        <div id="auList"></div>
        <div class="load-more" id="auMore"></div>`,
    }),
    bind(root) {
      const listEl = root.querySelector('#auList');
      const moreEl = root.querySelector('#auMore');
      let all = [];
      let cursor = null;
      let seq = 0;

      async function load(more = false) {
        const mine = ++seq;
        if (!more) mount(listEl, loadingState());
        else moreEl.querySelector('button')?.setAttribute('disabled', '');
        try {
          const page = await api.admin.listAuditLog({ action, cursor: more ? cursor : null });
          if (mine !== seq) return;
          all = more ? [...all, ...page.items] : page.items;
          cursor = page.nextCursor;
          mount(listEl, all.length ? auditRows(all) : emptyState('No entries', action ? 'Try another filter.' : 'Actions will be recorded here.'));
          mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">Load more</button>` : '');
          moreEl.querySelector('button')?.addEventListener('click', () => load(true));
        } catch (err) {
          if (mine !== seq) return;
          mount(listEl, workspaceErrorState(err, 'The audit log'));
          mount(moreEl, '');
          listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => load());
        }
      }

      root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
        action = btn.dataset.value;
        root.querySelectorAll('.chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
        load();
      }));
      load();
    },
  };
}
