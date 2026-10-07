import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { STATUSES, countByStatus } from '../../services/content-workflow.js';
import { consoleShell, fill } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { chips, emptyState } from '../../ui/components.js';

export default async function editorUploads({ access, path, query }) {
  let status = STATUSES[query.status] ? query.status : '';
  return {
    title: 'My uploads',
    html: consoleShell({
      access, path,
      eyebrow: 'EDITOR WORKSPACE',
      title: 'My uploads',
      actions: html`<a class="btn btn-primary" href="#/editor/upload">${icons.plus}<span>Upload content</span></a>`,
      body: html`<div id="uploadsBody"></div>`,
    }),
    bind(root) {
      const body = root.querySelector('#uploadsBody');
      const hrefFor = it => `#/editor/uploads/${encodeURIComponent(it.id)}`;
      fill(body, {
        load: () => api.editor.listMine(), what: 'Your uploads',
        render: () => html`<div id="upChips"></div><div id="upList"></div>`,
        after: (el, list) => {
          const counts = countByStatus(list);
          const draw = () => {
            const items = [{ value: '', label: 'All', count: list.length },
              ...Object.values(STATUSES).map(s => ({ value: s.id, label: s.label, count: counts[s.id] }))];
            mount(el.querySelector('#upChips'), chips(items, status, { name: 'Filter by status' }));
            const shown = list.filter(i => !status || i.status === status);
            mount(el.querySelector('#upList'), shown.length
              ? contentRows(shown, { hrefFor })
              : emptyState(status ? `No ${STATUSES[status].label.toLowerCase()} uploads` : 'No uploads yet', status ? 'Pick another filter.' : 'Use “Upload content” to add your first item.'));
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
