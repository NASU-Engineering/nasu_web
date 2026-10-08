// Content Studio · My content: everything I submitted, one list, filtered by
// status (Draft · Pending · Approved · Rejected · Published) — no separate tab per status.

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { STATUSES, countByStatus } from '../../services/content-workflow.js';
import { consoleShell, fill } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { chips, emptyState } from '../../ui/components.js';
import { t } from '../../i18n/index.js';

export const MY_CONTENT_FILTERS = ['draft', 'pending_review', 'approved', 'rejected', 'published'];

export default async function editorUploads({ access, path, query }) {
  let status = MY_CONTENT_FILTERS.includes(query.status) ? query.status : '';
  return {
    title: t('nav.myContent'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.editor'),
      title: t('nav.myContent'),
      actions: html`<a class="btn btn-primary" href="#/editor/upload">${icons.plus}<span>${t('nav.upload')}</span></a>`,
      body: html`<div id="uploadsBody"></div>`,
    }),
    bind(root) {
      const body = root.querySelector('#uploadsBody');
      const hrefFor = it => `#/editor/uploads/${encodeURIComponent(it.id)}`;
      fill(body, {
        load: () => api.editor.listMine(),
        render: () => html`<div id="upChips" class="toolbar"></div><div id="upList"></div>`,
        after: (el, list) => {
          const counts = countByStatus(list);
          const draw = () => {
            const items = [{ value: '', label: t('common.all'), count: list.length },
              ...MY_CONTENT_FILTERS.map(s => ({ value: s, label: STATUSES[s].label, count: counts[s] }))];
            mount(el.querySelector('#upChips'), chips(items, status, { name: t('filter.byStatus') }));
            const shown = list.filter(i => !status || i.status === status);
            mount(el.querySelector('#upList'), shown.length
              ? contentRows(shown, { hrefFor })
              : status ? emptyState(t('studio.noneWithStatus', { status: STATUSES[status].label }), t('common.tryAnotherFilter'))
                : emptyState(t('studio.noUploads'), t('studio.noUploadsText')));
            el.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
              status = btn.dataset.value;
              history.replaceState(null, '', `#/editor/uploads${status ? `?status=${status}` : ''}`);
              draw();
            }));
          };
          draw();
        },
      });
    },
  };
}
