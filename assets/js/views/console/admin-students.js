// Admin · People · Students: the student directory (read-only). Role changes live in People · Staff & roles.

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { emptyState, loadingState } from '../../ui/components.js';
import { roleBadges } from './admin-team.js';
import { t } from '../../i18n/index.js';

export default async function adminStudents({ access, path, query }) {
  let q = query.q || '';
  return {
    title: t('nav.students'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.people'),
      lead: t('people.studentsLead'),
      body: html`
        <form class="toolbar" id="stForm" role="search">
          <div class="search-box search-box-sm">${icons.search}<input type="search" name="q" value="${q}" placeholder="${t('people.findPlaceholder')}" aria-label="${t('people.searchStudents')}" autocomplete="off"></div>
        </form>
        <div id="stList"></div>
        <div class="load-more" id="stMore"></div>`,
    }),
    bind(root) {
      const form = root.querySelector('#stForm');
      const listEl = root.querySelector('#stList');
      const moreEl = root.querySelector('#stMore');
      let rows = [];
      let cursor = null;
      let seq = 0;

      const table = list => html`
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th scope="col">${t('field.name')}</th><th scope="col">${t('field.studentId')}</th><th scope="col">${t('field.group')}</th><th scope="col">${t('field.section')}</th><th scope="col">${t('field.roles')}</th><th scope="col"><span class="visually-hidden">${t('common.actions')}</span></th></tr></thead>
            <tbody>${list.map(m => html`
              <tr>
                <td data-label="${t('field.name')}"><strong>${m.fullName || '—'}</strong></td>
                <td data-label="${t('field.studentId')}" class="mono">${m.studentId || '—'}</td>
                <td data-label="${t('field.group')}">${m.group || '—'}</td>
                <td data-label="${t('field.section')}">${m.section || '—'}</td>
                <td data-label="${t('field.roles')}">${roleBadges(m.roles)}</td>
                <td><a class="see-all" href="#/admin/people/staff?q=${encodeURIComponent(m.studentId || m.fullName)}">${t('people.manageRoles')}</a></td>
              </tr>`)}</tbody>
          </table>
        </div>`;

      async function load(more = false) {
        const mine = ++seq;
        history.replaceState(null, '', `#/admin/people${q ? `?q=${encodeURIComponent(q)}` : ''}`);
        if (!more) mount(listEl, loadingState());
        try {
          const page = await api.admin.searchMembers({ query: q, cursor: more ? cursor : null });
          if (mine !== seq) return;
          rows = more ? [...rows, ...page.items] : page.items;
          cursor = page.nextCursor;
          mount(listEl, rows.length ? table(rows) : emptyState(t('people.noStudents'), q ? t('people.checkSpelling') : ''));
          mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">${t('common.loadMore')}</button>` : '');
          moreEl.querySelector('button')?.addEventListener('click', () => load(true));
        } catch (err) {
          if (mine !== seq) return;
          mount(listEl, workspaceErrorState(err));
          mount(moreEl, '');
          listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => load());
        }
      }

      let timer;
      form.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = form.q.value.trim(); load(); }, 250); });
      form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); q = form.q.value.trim(); load(); });
      load();
    },
  };
}
