import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { subjectById } from '../../data/catalog.js';
import { scopeLabel } from '../../services/roles.js';
import { countByStatus } from '../../services/content-workflow.js';
import { consoleShell, statTile, panel, fill } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { emptyState } from '../../ui/components.js';
import { t } from '../../i18n/index.js';

export function scopesList(scopes) {
  if (!scopes.length) return emptyState(t('studio.noScope'), t('studio.noScopeText'));
  return html`<ul class="scope-list">${scopes.map(s => {
    const subj = subjectById(s.subjectId);
    return html`<li><span class="mono scope-code">${subj?.code || s.subjectId}</span><span class="scope-name">${subj?.name || ''}</span><span class="scope-target">${scopeLabel(s)}</span></li>`;
  })}</ul>`;
}

export default async function editorOverview({ access, path }) {
  const filter = s => `#/editor/uploads?status=${s}`;
  return {
    title: t('experience.editor'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.editor'),
      title: t('nav.studioOverview'),
      lead: t('studio.lead'),
      actions: html`<a class="btn btn-primary" href="#/editor/upload">${icons.plus}<span>${t('nav.upload')}</span></a>`,
      body: html`
        <div id="edStats" class="stat-grid"></div>
        <div class="console-cols">
          ${panel(t('studio.attention'), html`<div id="edRejected"></div>`)}
          ${panel(t('studio.scope'), access.roles.includes('admin')
            ? html`<p class="muted">${t('studio.adminScope')}</p>`
            : scopesList(access.scopes))}
        </div>
        ${panel(t('studio.recent'), html`<div id="edRecent"></div>`, { action: html`<a class="see-all" href="#/editor/uploads">${t('nav.myContent')}</a>` })}`,
    }),
    bind(root) {
      const mine = api.editor.listMine();
      const hrefFor = it => `#/editor/uploads/${encodeURIComponent(it.id)}`;
      fill(root.querySelector('#edStats'), {
        load: () => mine,
        render: list => {
          const c = countByStatus(list);
          return html`
            ${statTile({ label: t('status.draft'), value: c.draft, icon: 'file', href: filter('draft') })}
            ${statTile({ label: t('status.pending_review'), value: c.pending_review, icon: 'clock', href: filter('pending_review') })}
            ${statTile({ label: t('status.rejected'), value: c.rejected, icon: 'alert', href: filter('rejected') })}
            ${statTile({ label: t('status.published'), value: c.published, icon: 'check', href: filter('published') })}`;
        },
      });
      fill(root.querySelector('#edRejected'), {
        load: () => mine,
        render: list => {
          const rejected = list.filter(i => i.status === 'rejected');
          return rejected.length ? contentRows(rejected, { hrefFor }) : emptyState(t('studio.nothingToFix'), t('studio.nothingToFixText'));
        },
      });
      fill(root.querySelector('#edRecent'), {
        load: () => mine,
        render: list => list.length ? contentRows(list.slice(0, 5), { hrefFor }) : emptyState(t('studio.noUploads'), t('studio.noUploadsText')),
      });
    },
  };
}
