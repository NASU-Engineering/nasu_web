// Student directory (read-only). Role changes live in Team & Roles.

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { emptyState, loadingState } from '../../ui/components.js';
import { roleBadges } from './admin-team.js';

export default async function adminStudents({ access, path, query }) {
  let q = query.q || '';
  return {
    title: 'Students',
    html: consoleShell({
      access, path,
      eyebrow: 'ADMIN CONTROL CENTER',
      title: 'Students',
      lead: 'Everyone with a hub profile. To change someone’s role, use Team & roles.',
      body: html`
        <form class="toolbar" id="stForm" role="search">
          <div class="search-box search-box-sm">${icons.search}<input type="search" name="q" value="${q}" placeholder="Search by name or student ID" aria-label="Search students" autocomplete="off"></div>
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
            <thead><tr><th scope="col">Name</th><th scope="col">Student ID</th><th scope="col">Group</th><th scope="col">Section</th><th scope="col">Roles</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>${list.map(m => html`
              <tr>
                <td data-label="Name"><strong>${m.fullName || '—'}</strong></td>
                <td data-label="Student ID" class="mono">${m.studentId || '—'}</td>
                <td data-label="Group">${m.group || '—'}</td>
                <td data-label="Section">${m.section || '—'}</td>
                <td data-label="Roles">${roleBadges(m.roles)}</td>
                <td><a class="see-all" href="#/admin/team?q=${encodeURIComponent(m.studentId || m.fullName)}">Manage roles</a></td>
              </tr>`)}</tbody>
          </table>
        </div>`;

      async function load(more = false) {
        const mine = ++seq;
        history.replaceState(null, '', `#/admin/students${q ? `?q=${encodeURIComponent(q)}` : ''}`);
        if (!more) mount(listEl, loadingState());
        try {
          const page = await api.admin.searchMembers({ query: q, cursor: more ? cursor : null });
          if (mine !== seq) return;
          rows = more ? [...rows, ...page.items] : page.items;
          cursor = page.nextCursor;
          mount(listEl, rows.length ? table(rows) : emptyState('No students found', q ? 'Check the spelling or student ID.' : ''));
          mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">Load more</button>` : '');
          moreEl.querySelector('button')?.addEventListener('click', () => load(true));
        } catch (err) {
          if (mine !== seq) return;
          mount(listEl, workspaceErrorState(err, 'The student directory'));
          mount(moreEl, '');
          listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => load());
        }
      }

      let t;
      form.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = form.q.value.trim(); load(); }, 250); });
      form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(t); q = form.q.value.trim(); load(); });
      load();
    },
  };
}
