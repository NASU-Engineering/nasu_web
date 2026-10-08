// All content across the platform, any status. Opening an item uses the
// review detail page (admins are reviewers too).

import { html, mount } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { SUBJECTS } from '../../data/catalog.js';
import { STATUSES } from '../../services/content-workflow.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';
import { icons } from '../../ui/icons.js';

export default async function adminContent({ access, path, query }) {
  const state = {
    status: STATUSES[query.status] ? query.status : '',
    subjectId: SUBJECTS.some(s => s.id === query.subject) ? query.subject : '',
    query: query.q || '',
  };
  return {
    title: 'Content',
    html: consoleShell({
      access, path,
      eyebrow: 'ADMIN CONTROL CENTER',
      title: 'Content',
      lead: 'Every submission and published resource, in any status.',
      body: html`
        <form class="toolbar" id="acForm" role="search">
          <div class="search-box search-box-sm">${icons.search}<input type="search" name="q" value="${state.query}" placeholder="Search title or submitter" aria-label="Search content" autocomplete="off"></div>
          <label class="select-wrap"><span class="visually-hidden">Subject</span>
            <select name="subject"><option value="">All subjects</option>
              ${SUBJECTS.map(s => html`<option value="${s.id}" ${s.id === state.subjectId ? 'selected' : ''}>${s.code} — ${s.name}</option>`)}
            </select></label>
        </form>
        <div class="toolbar">${chips([{ value: '', label: 'All' }, ...Object.values(STATUSES).map(s => ({ value: s.id, label: s.label }))], state.status, { name: 'Filter by status' })}</div>
        <div id="acList"></div>
        <div class="load-more" id="acMore"></div>`,
    }),
    bind(root) {
      const form = root.querySelector('#acForm');
      const listEl = root.querySelector('#acList');
      const moreEl = root.querySelector('#acMore');
      let all = [];
      let cursor = null;
      let seq = 0;
      const hrefFor = it => `#/admin/content/${encodeURIComponent(it.id)}`;

      const syncUrl = () => {
        const p = new URLSearchParams();
        if (state.query) p.set('q', state.query);
        if (state.subjectId) p.set('subject', state.subjectId);
        if (state.status) p.set('status', state.status);
        history.replaceState(null, '', `#/admin/content${p.toString() ? `?${p}` : ''}`);
      };

      async function load(more = false) {
        const mine = ++seq;
        syncUrl();
        if (!more) mount(listEl, loadingState());
        try {
          const page = await api.admin.listContent({ ...state, cursor: more ? cursor : null });
          if (mine !== seq) return;
          all = more ? [...all, ...page.items] : page.items;
          cursor = page.nextCursor;
          mount(listEl, all.length ? contentRows(all, { hrefFor, show: ['submitter'] }) : emptyState('No content matches', 'Try clearing the filters.'));
          mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">Load more</button>` : '');
          moreEl.querySelector('button')?.addEventListener('click', () => load(true));
        } catch (err) {
          if (mine !== seq) return;
          mount(listEl, workspaceErrorState(err, 'Content management'));
          mount(moreEl, '');
          listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => load());
        }
      }

      let t;
      form.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.query = form.q.value.trim(); load(); }, 250); });
      form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(t); state.query = form.q.value.trim(); load(); });
      form.subject.addEventListener('change', () => { state.subjectId = form.subject.value; load(); });
      root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
        state.status = btn.dataset.value;
        root.querySelectorAll('.chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
        load();
      }));
      load();
    },
  };
}
