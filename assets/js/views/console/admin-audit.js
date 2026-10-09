// Audit log: who did what, to which entity, when — plus raw metadata.

import { html, mount } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';
import { personLabel } from '../../ui/workflow.js';
import { dateTime } from '../../ui/format.js';
import { t } from '../../i18n/index.js';

const ACTION_FILTERS = [
  { value: '', get label() { return t('common.all'); } },
  { value: 'content.', get label() { return t('audit.filter.content'); } },
  { value: 'role.', get label() { return t('audit.filter.roles'); } },
  { value: 'scope.', get label() { return t('audit.filter.scopes'); } },
];

const when = iso => dateTime(iso) || '—';
const tone = action => (/reject|revok|delete|remov/.test(action) ? 'bad' : /approv|publish|grant/.test(action) ? 'ok' : 'neutral');

function metadataView(meta) {
  if (!meta || !Object.keys(meta).length) return html`<span class="muted">—</span>`;
  const entries = Object.entries(meta);
  const simple = entries.every(([, v]) => v == null || typeof v !== 'object');
  if (simple && entries.length <= 3) {
    return html`<span class="meta-kv">${entries.map(([k, v]) => html`<span><span class="mono">${k}</span>: ${String(v)}</span>`)}</span>`;
  }
  return html`<details class="meta-raw"><summary>${t('audit.fields', { count: entries.length })}</summary><pre class="mono">${JSON.stringify(meta, null, 2)}</pre></details>`;
}

export function auditRows(entries, { compact = false } = {}) {
  if (compact) {
    return html`<ul class="audit-compact">${entries.map(e => html`
      <li><span class="audit-action mono tone-${tone(e.action)}">${e.action}</span>
      <span>${e.actor?.fullName || t('audit.system')}</span><span class="muted">${when(e.createdAt)}</span></li>`)}</ul>`;
  }
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th scope="col">${t('audit.when')}</th><th scope="col">${t('audit.actor')}</th><th scope="col">${t('audit.action')}</th><th scope="col">${t('audit.entity')}</th><th scope="col">${t('audit.details')}</th></tr></thead>
        <tbody>${entries.map(e => html`
          <tr>
            <td data-label="${t('audit.when')}" class="nowrap">${when(e.createdAt)}</td>
            <td data-label="${t('audit.actor')}">${e.actor ? personLabel(e.actor) : t('audit.system')}</td>
            <td data-label="${t('audit.action')}"><span class="audit-action mono tone-${tone(e.action)}">${e.action}</span></td>
            <td data-label="${t('audit.entity')}"><span class="mono">${e.entityType}${e.entityId ? ` · ${e.entityId}` : ''}</span></td>
            <td data-label="${t('audit.details')}">${metadataView(e.metadata)}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>`;
}

export default async function adminAudit({ access, path }) {
  let action = '';
  return {
    title: t('nav.auditLog'),
    html: consoleShell({
      access, path,
      back: { href: '/admin/settings', label: t('nav.settings') },
      eyebrow: t('experience.admin'),
      title: t('nav.auditLog'),
      lead: t('audit.lead'),
      body: html`
        <div class="toolbar">${chips(ACTION_FILTERS, '', { name: t('filter.byAction') })}</div>
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
          mount(listEl, all.length ? auditRows(all) : emptyState(t('audit.empty'), action ? t('common.tryAnotherFilter') : t('audit.emptyText')));
          mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">${t('common.loadMore')}</button>` : '');
          moreEl.querySelector('button')?.addEventListener('click', () => load(true));
        } catch (err) {
          if (mine !== seq) return;
          mount(listEl, workspaceErrorState(err));
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
