// Team & Roles: find a student, grant/revoke Section Editor or Content
// Manager, and set an editor's Subject / Group / Section scope.
// Every change is a backend call that re-checks the caller is an admin.

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { SUBJECTS, subjectById } from '../../data/catalog.js';
import { ROLES, ASSIGNABLE_ROLES, roleLabel, scopeLabel, hasRole } from '../../services/roles.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';
import { confirmDialog, toast } from '../../ui/dialog.js';
import { t } from '../../i18n/index.js';

const ALL = '*';
const ROLE_FILTERS = [
  { value: '', get label() { return t('people.filter.everyone'); } },
  { value: 'section_editor', get label() { return t('people.filter.editors'); } },
  { value: 'content_manager', get label() { return t('people.filter.managers'); } },
  { value: 'admin', get label() { return t('people.filter.admins'); } },
];

export const roleBadges = roles => html`<span class="role-badges">${roles.map(r => html`<span class="role-badge role-${r}">${roleLabel(r)}</span>`)}</span>`;

// What each role may do (enforced by the backend; this table only explains it).
const PERMISSIONS = [
  ['studentHub',  ['student', 'section_editor', 'content_manager', 'admin']],
  ['uploadScope', ['section_editor']],
  ['uploadAny',   ['admin']],
  ['review',      ['content_manager', 'admin']],
  ['publish',     ['content_manager', 'admin']],
  ['manageRoles', ['admin']],
  ['auditLog',    ['admin']],
];
const MATRIX_ROLES = ['student', 'section_editor', 'content_manager', 'admin'];

export function permissionsMatrix() {
  return html`
    <details class="perm">
      <summary>${icons.shield}<span>${t('people.permissionsTitle')}</span></summary>
      <div class="table-wrap">
        <table class="table perm-table">
          <thead><tr><th scope="col">${t('people.permission')}</th>${MATRIX_ROLES.map(r => html`<th scope="col">${roleLabel(r)}</th>`)}</tr></thead>
          <tbody>${PERMISSIONS.map(([key, roles]) => html`
            <tr><th scope="row">${t(`people.perm.${key}`)}</th>${MATRIX_ROLES.map(r => html`<td data-label="${roleLabel(r)}">${roles.includes(r) ? html`<span class="perm-yes" aria-label="${t('common.yes')}">${icons.check}</span>` : html`<span class="perm-no" aria-label="${t('common.no')}">—</span>`}</td>`)}</tr>`)}
          </tbody>
        </table>
      </div>
      <p class="help-dark">${t('people.permissionsNote')}</p>
    </details>`;
}

function memberCard(m) {
  const editor = hasRole(m.roles, 'section_editor');
  return html`
    <article class="member" data-user="${m.userId}">
      <header class="member-head">
        <span class="avatar avatar-sm">${icons.user}</span>
        <div class="member-id">
          <p class="member-name">${m.fullName || t('common.unnamed')}</p>
          <p class="member-sub mono">${m.studentId}${m.group ? ` · ${m.group}` : ''}${m.section ? ` · ${m.section}` : ''}</p>
        </div>
        ${roleBadges(m.roles)}
      </header>
      <div class="member-actions">
        ${ASSIGNABLE_ROLES.map(r => hasRole(m.roles, r)
          ? html`<button type="button" class="btn btn-sm btn-quiet-danger" data-revoke="${r}">Remove ${ROLES[r].label}</button>`
          : html`<button type="button" class="btn btn-sm btn-ghost" data-grant="${r}">${icons.plus}<span>Make ${ROLES[r].label}</span></button>`)}
        ${editor ? html`<button type="button" class="btn btn-sm btn-ghost" data-scope>${t('people.editScope')}</button>` : ''}
      </div>
      ${editor ? html`
        <div class="member-scopes">
          <p class="member-scopes-label">${t('studio.scope')}</p>
          ${m.scopes.length
            ? html`<ul class="scope-list scope-list-sm">${m.scopes.map(s => html`<li><span class="mono scope-code">${subjectById(s.subjectId)?.code || s.subjectId}</span><span class="scope-target">${scopeLabel(s)}</span></li>`)}</ul>`
            : html`<p class="help bad">${t('people.noScope')}</p>`}
        </div>
        <div class="scope-editor" hidden></div>` : ''}
    </article>`;
}

function scopeEditor(draft, groups) {
  const groupOpts = [{ value: ALL, label: t('scope.allGroups') }, ...groups.map(g => ({ value: g.name, label: g.name }))];
  return html`
    <p class="member-scopes-label">${t('people.editScope')}</p>
    ${draft.length
      ? html`<ul class="scope-list scope-list-sm">${draft.map((s, i) => html`
          <li><span class="mono scope-code">${subjectById(s.subjectId)?.code || s.subjectId}</span><span class="scope-target">${scopeLabel(s)}</span>
          <button type="button" class="icon-btn icon-btn-sm" data-remove="${i}" aria-label="${t('people.removeScope')}">${icons.close}</button></li>`)}</ul>`
      : html`<p class="help">${t('people.noScopeRows')}</p>`}
    <div class="scope-add">
      <select data-f="subject" aria-label="${t('field.subject')}">${SUBJECTS.map(s => html`<option value="${s.id}">${s.code} — ${s.name}</option>`)}</select>
      <select data-f="group" aria-label="${t('field.group')}">${groupOpts.map(o => html`<option value="${o.value}">${o.label}</option>`)}</select>
      <select data-f="section" aria-label="${t('field.section')}"><option value="${ALL}">${t('scope.allSections')}</option></select>
      <button type="button" class="btn btn-sm btn-ghost" data-add>${icons.plus}<span>${t('common.add')}</span></button>
    </div>
    <div class="scope-foot">
      <button type="button" class="btn btn-sm btn-quiet" data-cancel>${t('common.cancel')}</button>
      <button type="button" class="btn btn-sm btn-primary" data-save>${t('people.saveScope')}</button>
    </div>`;
}

export default async function adminTeam({ access, path, query }) {
  const state = { role: ROLE_FILTERS.some(r => r.value === query.role) ? query.role : '', query: query.q || '' };
  return {
    title: t('nav.staff'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.people'),
      lead: t('people.staffLead'),
      body: html`
        <form class="toolbar" id="tmForm" role="search">
          <div class="search-box search-box-sm">${icons.search}<input type="search" name="q" value="${state.query}" placeholder="${t('people.findPlaceholder')}" aria-label="${t('people.find')}" autocomplete="off"></div>
        </form>
        <div class="toolbar">${chips(ROLE_FILTERS, state.role, { name: t('filter.byRole') })}</div>
        ${permissionsMatrix()}
        <p class="notice">${icons.shield}<span>${t('people.adminNote')}</span></p>
        <div id="tmList" class="member-list"></div>
        <div class="load-more" id="tmMore"></div>`,
    }),
    bind(root) {
      const form = root.querySelector('#tmForm');
      const listEl = root.querySelector('#tmList');
      const moreEl = root.querySelector('#tmMore');
      let members = [];
      let cursor = null;
      let seq = 0;
      const groupsPromise = api.catalog.listGroups().catch(() => []);

      const syncUrl = () => {
        const p = new URLSearchParams();
        if (state.query) p.set('q', state.query);
        if (state.role) p.set('role', state.role);
        history.replaceState(null, '', `#/admin/people/staff${p.toString() ? `?${p}` : ''}`);
      };

      const draw = () => {
        mount(listEl, members.length ? members.map(memberCard)
          : emptyState(state.query ? t('people.noMatch') : t('people.noneYet'), state.query ? t('people.checkSpelling') : t('people.tryEveryone')));
        mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">${t('common.loadMore')}</button>` : '');
        moreEl.querySelector('button')?.addEventListener('click', () => load(true));
      };

      async function load(more = false) {
        const mine = ++seq;
        syncUrl();
        if (!more) mount(listEl, loadingState());
        try {
          const page = await api.admin.searchMembers({ query: state.query, role: state.role, cursor: more ? cursor : null });
          if (mine !== seq) return;
          members = more ? [...members, ...page.items] : page.items;
          cursor = page.nextCursor;
          draw();
        } catch (err) {
          if (mine !== seq) return;
          mount(listEl, workspaceErrorState(err));
          mount(moreEl, '');
          listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => load());
        }
      }

      const replace = updated => {
        members = members.map(m => (m.userId === updated.userId ? updated : m));
        draw();
      };

      // One delegated handler for every card.
      listEl.addEventListener('click', async e => {
        const card = e.target.closest('.member');
        if (!card) return;
        const m = members.find(x => x.userId === card.dataset.user);
        if (!m) return;
        const grant = e.target.closest('[data-grant]')?.dataset.grant;
        const revoke = e.target.closest('[data-revoke]')?.dataset.revoke;

        if (grant || revoke) {
          const role = grant || revoke;
          let updated;
          const { confirmed } = await confirmDialog({
            title: grant ? t('people.grantTitle', { name: m.fullName, role: roleLabel(role) }) : t('people.revokeTitle', { name: m.fullName, role: roleLabel(role) }),
            body: grant
              ? html`<p>${role === 'section_editor' ? t('people.grantEditorText') : t('people.grantManagerText')}</p>`
              : html`<p>${role === 'section_editor' ? t('people.revokeEditorText') : t('people.revokeManagerText')}</p>`,
            tone: grant ? 'default' : 'danger',
            confirmLabel: grant ? t('people.grant') : t('people.revoke'),
            run: async () => { updated = await (grant ? api.admin.grantRole(m.userId, role) : api.admin.revokeRole(m.userId, role)); },
          });
          if (confirmed) {
            toast(grant ? t('people.granted', { role: roleLabel(role) }) : t('people.revoked', { role: roleLabel(role) }));
            if (updated) replace(updated); else load();
          }
          return;
        }

        if (e.target.closest('[data-scope]')) openScopeEditor(card, m);
      });

      async function openScopeEditor(card, m) {
        const box = card.querySelector('.scope-editor');
        if (!box || !box.hidden) return;
        const groups = await groupsPromise;
        let draft = m.scopes.map(s => ({ subjectId: s.subjectId, group: s.group, section: s.section }));
        box.hidden = false;

        const render = () => {
          mount(box, scopeEditor(draft, groups));
          const g = box.querySelector('[data-f=group]');
          const sec = box.querySelector('[data-f=section]');
          const syncSections = () => {
            const known = groups.find(x => x.name === g.value)?.sections || [];
            mount(sec, [html`<option value="${ALL}">${t('scope.allSections')}</option>`, ...known.map(n => html`<option value="${n}">${n}</option>`)]);
            sec.disabled = g.value === ALL;
          };
          g.addEventListener('change', syncSections);
          syncSections();
        };
        render();

        box.onclick = async e => {
          const rm = e.target.closest('[data-remove]');
          if (rm) { draft.splice(Number(rm.dataset.remove), 1); render(); return; }
          if (e.target.closest('[data-add]')) {
            const v = f => box.querySelector(`[data-f=${f}]`).value;
            const row = { subjectId: v('subject'), group: v('group') === ALL ? null : v('group'), section: v('group') === ALL || v('section') === ALL ? null : v('section') };
            const dup = draft.some(s => s.subjectId === row.subjectId && s.group === row.group && s.section === row.section);
            if (!dup) draft.push(row);
            render();
            return;
          }
          if (e.target.closest('[data-cancel]')) { box.hidden = true; mount(box, ''); return; }
          if (e.target.closest('[data-save]')) {
            let updated;
            const { confirmed } = await confirmDialog({
              title: t('people.saveScopeTitle', { name: m.fullName }),
              body: draft.length
                ? html`<p>${t('people.scopeWillAllow')}</p><ul class="dlg-list">${draft.map(s => html`<li><strong>${subjectById(s.subjectId)?.code}</strong> — ${scopeLabel(s)}</li>`)}</ul>`
                : html`<p>${t('people.scopeEmptyWarn')}</p>`,
              confirmLabel: t('people.saveScope'),
              run: async () => { updated = await api.admin.setEditorScopes(m.userId, draft); },
            });
            if (confirmed) { toast(t('people.scopeSaved')); if (updated) replace(updated); else load(); }
          }
        };
      }

      let timer;
      form.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.query = form.q.value.trim(); load(); }, 250); });
      form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); state.query = form.q.value.trim(); load(); });
      root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
        state.role = btn.dataset.value;
        root.querySelectorAll('.chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
        load();
      }));
      load();
    },
  };
}
