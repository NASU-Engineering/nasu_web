import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { subjectById } from '../../data/catalog.js';
import { scopeLabel } from '../../services/roles.js';
import { countByStatus } from '../../services/content-workflow.js';
import { consoleShell, statTile, panel, fill } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { emptyState } from '../../ui/components.js';

export function scopesList(scopes) {
  if (!scopes.length) return emptyState('No scope assigned yet', 'An admin needs to assign you subjects, groups and sections before you can upload.');
  return html`<ul class="scope-list">${scopes.map(s => {
    const subj = subjectById(s.subjectId);
    return html`<li><span class="mono scope-code">${subj?.code || s.subjectId}</span><span class="scope-name">${subj?.name || ''}</span><span class="scope-target">${scopeLabel(s)}</span></li>`;
  })}</ul>`;
}

export default async function editorOverview({ access, path }) {
  return {
    title: 'Content Studio',
    html: consoleShell({
      access, path,
      eyebrow: 'CONTENT STUDIO',
      title: 'Overview',
      lead: 'Upload material for your sections. Everything you submit is checked by a content manager before students see it.',
      actions: html`<a class="btn btn-primary" href="#/editor/upload">${icons.plus}<span>Upload content</span></a>`,
      body: html`
        <div id="edStats" class="stat-grid"></div>
        <div class="console-cols">
          ${panel('Needs your attention', html`<div id="edRejected"></div>`)}
          ${panel('Your scope', access.roles.includes('admin')
            ? html`<p class="muted">As an admin you can upload for every subject, group and section.</p>`
            : scopesList(access.scopes))}
        </div>
        ${panel('Recent uploads', html`<div id="edRecent"></div>`, { action: html`<a class="see-all" href="#/editor/uploads">My content</a>` })}`,
    }),
    bind(root) {
      const mine = api.editor.listMine();
      const hrefFor = it => `#/editor/uploads/${encodeURIComponent(it.id)}`;
      fill(root.querySelector('#edStats'), {
        load: () => mine, what: 'Your uploads',
        render: list => {
          const c = countByStatus(list);
          return html`
            ${statTile({ label: 'Drafts', value: c.draft, icon: 'file', href: '#/editor/uploads?status=draft' })}
            ${statTile({ label: 'Pending review', value: c.pending_review, icon: 'clock', href: '#/editor/uploads?status=pending_review' })}
            ${statTile({ label: 'Rejected', value: c.rejected, icon: 'alert', href: '#/editor/uploads?status=rejected' })}
            ${statTile({ label: 'Published', value: c.published, icon: 'check', href: '#/editor/uploads?status=published' })}`;
        },
      });
      fill(root.querySelector('#edRejected'), {
        load: () => mine, what: 'Your uploads',
        render: list => {
          const rejected = list.filter(i => i.status === 'rejected');
          return rejected.length
            ? contentRows(rejected, { hrefFor })
            : emptyState('Nothing to fix', 'Rejected submissions and the reviewer’s reasons appear here.');
        },
      });
      fill(root.querySelector('#edRecent'), {
        load: () => mine, what: 'Your uploads',
        render: list => list.length
          ? contentRows(list.slice(0, 5), { hrefFor })
          : emptyState('No uploads yet', 'Start with “Upload content”. You can save a draft and submit it later.'),
      });
    },
  };
}
