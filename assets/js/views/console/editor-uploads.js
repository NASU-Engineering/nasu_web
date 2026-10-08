// Content Studio lists: "My content" (everything I submitted) and "Drafts"
// (drafts + rejected items I still need to fix and resubmit).

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { STATUSES, countByStatus } from '../../services/content-workflow.js';
import { consoleShell, fill } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { chips, emptyState } from '../../ui/components.js';

function makeList({ title, route, statuses, lead, empty }) {
  return async function editorList({ access, path, query }) {
    const allowed = statuses.filter(s => STATUSES[s]);
    let status = allowed.includes(query.status) ? query.status : '';
    return {
      title,
      html: consoleShell({
        access, path,
        eyebrow: 'CONTENT STUDIO',
        title,
        lead,
        actions: html`<a class="btn btn-primary" href="#/editor/upload">${icons.plus}<span>Upload</span></a>`,
        body: html`<div id="uploadsBody"></div>`,
      }),
      bind(root) {
        const body = root.querySelector('#uploadsBody');
        const hrefFor = it => `#/editor/uploads/${encodeURIComponent(it.id)}`;
        fill(body, {
          load: () => api.editor.listMine(), what: 'Your content',
          render: () => html`<div id="upChips"></div><div id="upList"></div>`,
          after: (el, all) => {
            const list = all.filter(i => allowed.includes(i.status));
            const counts = countByStatus(list);
            const draw = () => {
              const items = [{ value: '', label: 'All', count: list.length },
                ...allowed.map(s => ({ value: s, label: STATUSES[s].label, count: counts[s] }))];
              mount(el.querySelector('#upChips'), chips(items, status, { name: 'Filter by status' }));
              const shown = list.filter(i => !status || i.status === status);
              mount(el.querySelector('#upList'), shown.length
                ? contentRows(shown, { hrefFor })
                : emptyState(status ? `Nothing ${STATUSES[status].label.toLowerCase()}` : empty.title, status ? 'Pick another filter.' : empty.text));
              el.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
                status = btn.dataset.value;
                history.replaceState(null, '', `#${route}${status ? `?status=${status}` : ''}`);
                draw();
              }));
            };
            draw();
          },
        });
      },
    };
  };
}

export default makeList({
  title: 'My content',
  route: '/editor/uploads',
  statuses: ['draft', 'pending_review', 'approved', 'rejected', 'published', 'archived'],
  empty: { title: 'No content yet', text: 'Use “Upload” to add your first item.' },
});

export const editorDrafts = makeList({
  title: 'Drafts',
  route: '/editor/drafts',
  statuses: ['draft', 'rejected'],
  lead: 'Unfinished drafts and rejected items to fix and resubmit.',
  empty: { title: 'No drafts', text: 'Everything you started has been submitted.' },
});
