// Admin · Content · Library: every submission and published resource, any
// status. Type filter covers Lectures … Assignments; opening an item uses the
// review detail page inside the Admin shell (admins are reviewers too).

import { html, mount } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { SUBJECTS, CATEGORIES } from '../../data/catalog.js';
import { STATUSES } from '../../services/content-workflow.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';
import { icons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';

export default async function adminContent({ access, path, query }) {
  const state = {
    status: STATUSES[query.status] ? query.status : '',
    subjectId: SUBJECTS.some(s => s.id === query.subject) ? query.subject : '',
    type: CATEGORIES.some(c => c.id === query.type) ? query.type : '',
    query: query.q || '',
  };
  return {
    title: t('nav.library'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.content'),
      lead: t('admin.libraryLead'),
      body: html`
        <form class="toolbar" id="acForm" role="search">
          <div class="search-box search-box-sm">${icons.search}<input type="search" name="q" value="${state.query}" placeholder="${t('admin.libraryPlaceholder')}" aria-label="${t('admin.librarySearch')}" autocomplete="off"></div>
          <label class="select-wrap"><span class="visually-hidden">${t('field.subject')}</span>
            <select name="subject"><option value="">${t('filter.allSubjects')}</option>
              ${SUBJECTS.map(s => html`<option value="${s.id}" ${s.id === state.subjectId ? 'selected' : ''}>${s.code} — ${s.name}</option>`)}
            </select></label>
          <label class="select-wrap"><span class="visually-hidden">${t('field.type')}</span>
            <select name="type"><option value="">${t('filter.allTypes')}</option>
              ${CATEGORIES.map(c => html`<option value="${c.id}" ${c.id === state.type ? 'selected' : ''}>${c.label}</option>`)}
            </select></label>
        </form>
        <div class="toolbar">${chips([{ value: '', label: t('common.all') }, ...Object.values(STATUSES).map(s => ({ value: s.id, label: s.label }))], state.status, { name: t('filter.byStatus') })}</div>
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
        if (state.type) p.set('type', state.type);
        if (state.status) p.set('status', state.status);
        history.replaceState(null, '', `#/admin/content${p.toString() ? `?${p}` : ''}`);
      };

      const draw = () => {
        const shown = all.filter(i => !state.type || i.contentType === state.type);
        mount(listEl, shown.length ? contentRows(shown, { hrefFor, show: ['submitter'] }) : emptyState(t('admin.libraryEmpty'), t('common.tryAnotherFilter')));
        mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">${t('common.loadMore')}</button>` : '');
        moreEl.querySelector('button')?.addEventListener('click', () => load(true));
      };

      async function load(more = false) {
        const mine = ++seq;
        syncUrl();
        if (!more) mount(listEl, loadingState());
        try {
          const page = await api.admin.listContent({ status: state.status, subjectId: state.subjectId, query: state.query, cursor: more ? cursor : null });
          if (mine !== seq) return;
          all = more ? [...all, ...page.items] : page.items;
          cursor = page.nextCursor;
          draw();
        } catch (err) {
          if (mine !== seq) return;
          mount(listEl, workspaceErrorState(err));
          mount(moreEl, '');
          listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => load());
        }
      }

      let timer;
      form.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.query = form.q.value.trim(); load(); }, 250); });
      form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); state.query = form.q.value.trim(); load(); });
      form.subject.addEventListener('change', () => { state.subjectId = form.subject.value; load(); });
      form.type.addEventListener('change', () => { state.type = form.type.value; syncUrl(); draw(); });
      root.querySelectorAll('.toolbar .chip').forEach(btn => btn.addEventListener('click', () => {
        state.status = btn.dataset.value;
        root.querySelectorAll('.toolbar .chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
        load();
      }));
      load();
    },
  };
}
