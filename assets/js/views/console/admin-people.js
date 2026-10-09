// Admin · Students & Team — one directory, three views (a switch, not tabs):
//   Students      every hub profile; details + roles in a side drawer
//   Applications  pending / needs review / approved / rejected; review in a drawer.
//                 Nothing is ever approved automatically — a code that isn't in
//                 the university roster can't be approved from here at all.
//   Staff         editors, reviewers, admins; roles and editor scopes.
//                 What each role may do is in the "Manage permissions" dialog.
// Every change is an RPC the backend re-authorises; the UI only hides what it can't use.

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { SUBJECTS, subjectById } from '../../data/catalog.js';
import { ROLES, ASSIGNABLE_ROLES, roleLabel, scopeLabel, hasRole } from '../../services/roles.js';
import { APPLICATION_STATUSES } from '../../services/normalize-workspace.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';
import { confirmDialog, infoDialog, toast } from '../../ui/dialog.js';
import { openDrawer } from '../../ui/drawer.js';
import { dateTime } from '../../ui/format.js';
import { t } from '../../i18n/index.js';

export const PEOPLE_VIEWS = ['students', 'applications', 'staff'];
const ALL = '*';

export const roleBadges = roles => html`<span class="role-badges">${roles.map(r => html`<span class="role-badge role-${r}">${roleLabel(r)}</span>`)}</span>`;

/* ---------- permissions (explained in a dialog; enforced by the backend) ---------- */

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

export function permissionsTable() {
  return html`
    <div class="table-wrap">
      <table class="table perm-table">
        <thead><tr><th scope="col">${t('people.permission')}</th>${MATRIX_ROLES.map(r => html`<th scope="col">${roleLabel(r)}</th>`)}</tr></thead>
        <tbody>${PERMISSIONS.map(([key, roles]) => html`
          <tr><th scope="row">${t(`people.perm.${key}`)}</th>${MATRIX_ROLES.map(r => html`<td data-label="${roleLabel(r)}">${roles.includes(r)
            ? html`<span class="perm-yes" aria-label="${t('common.yes')}">${icons.check}</span>`
            : html`<span class="perm-no" aria-label="${t('common.no')}">—</span>`}</td>`)}</tr>`)}
        </tbody>
      </table>
    </div>
    <p class="help-dark">${t('people.permissionsNote')} ${t('people.adminNote')}</p>`;
}
export const openPermissions = () => infoDialog({ title: t('people.permissionsTitle'), body: permissionsTable(), wide: true });

/* ---------- role changes (shared by the student drawer and the staff list) ---------- */

async function changeRole(m, role, grant) {
  let updated;
  const { confirmed } = await confirmDialog({
    title: grant ? t('people.grantTitle', { name: m.fullName, role: roleLabel(role) }) : t('people.revokeTitle', { name: m.fullName, role: roleLabel(role) }),
    body: html`<p>${grant
      ? (role === 'section_editor' ? t('people.grantEditorText') : t('people.grantManagerText'))
      : (role === 'section_editor' ? t('people.revokeEditorText') : t('people.revokeManagerText'))}</p>`,
    tone: grant ? 'default' : 'danger',
    confirmLabel: grant ? t('people.grant') : t('people.revoke'),
    run: async () => { updated = await (grant ? api.admin.grantRole(m.userId, role) : api.admin.revokeRole(m.userId, role)); },
  });
  if (confirmed) toast(grant ? t('people.granted', { role: roleLabel(role) }) : t('people.revoked', { role: roleLabel(role) }));
  return { confirmed, updated: updated || null };
}

const roleButtons = m => ASSIGNABLE_ROLES.map(r => hasRole(m.roles, r)
  ? html`<button type="button" class="btn btn-sm btn-quiet-danger" data-revoke="${r}">${t('people.removeRole', { role: ROLES[r].label })}</button>`
  : html`<button type="button" class="btn btn-sm btn-ghost" data-grant="${r}">${icons.plus}<span>${t('people.makeRole', { role: ROLES[r].label })}</span></button>`);

const scopeList = scopes => (scopes.length
  ? html`<ul class="scope-list scope-list-sm">${scopes.map(s => html`<li><span class="mono scope-code">${subjectById(s.subjectId)?.code || s.subjectId}</span><span class="scope-target">${scopeLabel(s)}</span></li>`)}</ul>`
  : html`<p class="help bad">${t('people.noScope')}</p>`);

/* ---------- Students ---------- */

function studentDrawer(member, onChange) {
  let m = member;
  openDrawer({
    title: m.fullName || t('common.unnamed'),
    render: () => html`
      <dl class="facts facts-1">
        <div><dt>${t('field.studentId')}</dt><dd class="mono">${m.studentId || '—'}</dd></div>
        <div><dt>${t('field.group')}</dt><dd>${m.group || '—'}</dd></div>
        <div><dt>${t('field.section')}</dt><dd>${m.section || '—'}</dd></div>
        <div><dt>${t('people.accountStatus')}</dt><dd>${m.status ? t(`people.status.${m.status}`) : t('people.status.active')}</dd></div>
        <div><dt>${t('field.roles')}</dt><dd>${roleBadges(m.roles)}</dd></div>
      </dl>
      <h3 class="drawer-sub">${t('people.manageRoles')}</h3>
      <div class="member-actions">${roleButtons(m)}</div>
      ${hasRole(m.roles, 'section_editor') ? html`
        <h3 class="drawer-sub">${t('studio.scope')}</h3>
        ${scopeList(m.scopes)}
        <a class="see-all" href="#/admin/people?view=staff&q=${encodeURIComponent(m.studentId || m.fullName)}">${t('people.editScope')}</a>` : ''}`,
    bind(el, close, refresh) {
      el.querySelectorAll('[data-grant],[data-revoke]').forEach(btn => btn.addEventListener('click', async () => {
        const grant = Boolean(btn.dataset.grant);
        const { confirmed, updated } = await changeRole(m, btn.dataset.grant || btn.dataset.revoke, grant);
        if (confirmed && updated) { m = updated; onChange(updated); refresh(); } else if (confirmed) close();
      }));
      el.querySelector('.see-all')?.addEventListener('click', close);
    },
  });
}

function studentsView(root, state) {
  const listEl = root.querySelector('#plList');
  const moreEl = root.querySelector('#plMore');
  let rows = [];
  let cursor = null;
  let seq = 0;

  const table = list => html`
    <div class="table-wrap">
      <table class="table table-click">
        <thead><tr>
          <th scope="col">${t('field.name')}</th><th scope="col">${t('field.studentId')}</th>
          <th scope="col">${t('field.group')}</th><th scope="col">${t('field.section')}</th>
          <th scope="col">${t('people.accountStatus')}</th><th scope="col">${t('field.roles')}</th>
        </tr></thead>
        <tbody>${list.map((m, i) => html`
          <tr>
            <td data-label="${t('field.name')}"><button type="button" class="row-link" data-row="${i}">${m.fullName || '—'}</button></td>
            <td data-label="${t('field.studentId')}" class="mono">${m.studentId || '—'}</td>
            <td data-label="${t('field.group')}">${m.group || '—'}</td>
            <td data-label="${t('field.section')}">${m.section || '—'}</td>
            <td data-label="${t('people.accountStatus')}">${m.status ? t(`people.status.${m.status}`) : t('people.status.active')}</td>
            <td data-label="${t('field.roles')}">${roleBadges(m.roles)}</td>
          </tr>`)}</tbody>
      </table>
    </div>`;

  const draw = () => {
    mount(listEl, rows.length ? table(rows) : emptyState(t('people.noStudents'), state.query ? t('people.checkSpelling') : ''));
    mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">${t('common.loadMore')}</button>` : '');
    moreEl.querySelector('button')?.addEventListener('click', () => load(true));
  };

  async function load(more = false) {
    const mine = ++seq;
    if (!more) mount(listEl, loadingState());
    try {
      const page = await api.admin.searchMembers({ query: state.query, cursor: more ? cursor : null });
      if (mine !== seq) return;
      rows = more ? [...rows, ...page.items] : page.items;
      cursor = page.nextCursor;
      draw();
    } catch (err) {
      if (mine !== seq) return;
      mount(listEl, workspaceErrorState(err));
      mount(moreEl, '');
      listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => load());
    }
  }
  listEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-row]');
    if (!btn) return;
    const m = rows[Number(btn.dataset.row)];
    studentDrawer(m, updated => { rows = rows.map(r => (r.userId === updated.userId ? updated : r)); draw(); });
  });
  return { load };
}

/* ---------- Applications ---------- */

const appStatusBadge = s => html`<span class="status status-${s === 'approved' ? 'ok' : s === 'rejected' ? 'bad' : s === 'needs_review' ? 'warn' : 'live'}"><span class="status-dot" aria-hidden="true"></span>${t(`application.status.${s}`)}</span>`;

function applicationDrawer(app, onChange) {
  let a = app;
  openDrawer({
    title: a.fullName || t('common.unnamed'),
    render: () => html`
      <p>${appStatusBadge(a.status)}</p>
      <dl class="facts facts-1">
        <div><dt>${t('field.studentId')}</dt><dd class="mono">${a.studentCode || '—'}</dd></div>
        <div><dt>${t('application.submitted')}</dt><dd>${dateTime(a.submittedAt) || '—'}</dd></div>
        <div><dt>${t('application.source')}</dt><dd>${a.source ? t(`application.sourceKind.${a.source}`) : '—'}${a.sourceRow ? html` <span class="muted">· ${t('application.row', { n: a.sourceRow })}</span>` : ''}</dd></div>
        <div><dt>${t('application.roster')}</dt><dd>${a.rosterMatch === false
          ? html`<span class="text-bad">${icons.alert} ${t('application.notInRoster')}</span>`
          : a.rosterMatch ? html`<span class="text-ok">${icons.check} ${t('application.inRoster')}</span>` : '—'}</dd></div>
        ${a.duplicates ? html`<div><dt>${t('application.duplicates')}</dt><dd>${t('application.duplicateCount', { count: a.duplicates })}</dd></div>` : ''}
        ${a.note ? html`<div><dt>${t('review.note')}</dt><dd>${a.note}</dd></div>` : ''}
      </dl>
      ${a.status === 'pending' || a.status === 'needs_review' ? html`
        <p class="notice">${icons.shield}<span>${t('application.approvalRule')}</span></p>
        <div class="drawer-actions">
          <button type="button" class="btn btn-approve" data-decide="approve" ${a.rosterMatch === false ? 'disabled' : ''}>${icons.check}<span>${t('review.approve')}</span></button>
          ${a.status === 'pending' ? html`<button type="button" class="btn btn-ghost" data-decide="needs_review">${t('application.markNeedsReview')}</button>` : ''}
          <button type="button" class="btn btn-quiet-danger" data-decide="reject">${t('review.reject')}</button>
        </div>
        ${a.rosterMatch === false ? html`<p class="help-dark">${t('application.cannotApprove')}</p>` : ''}` : ''}`,
    bind(el, close, refresh) {
      el.querySelectorAll('[data-decide]').forEach(btn => btn.addEventListener('click', async () => {
        const decision = btn.dataset.decide;
        let updated;
        const { confirmed } = await confirmDialog({
          title: t(`application.confirm.${decision}`, { name: a.fullName }),
          body: html`<p>${t(`application.confirmText.${decision}`)}</p>`,
          tone: decision === 'reject' ? 'danger' : 'default',
          confirmLabel: decision === 'approve' ? t('review.approve') : decision === 'reject' ? t('review.reject') : t('application.markNeedsReview'),
          input: decision === 'approve' ? null : { label: t('review.note'), required: true, minLength: 3, placeholder: t('application.notePlaceholder') },
          run: async note => { updated = await api.ops.reviewApplication(a.id, { decision, note }); },
        });
        if (!confirmed) return;
        toast(t(`application.done.${decision}`));
        if (updated) { a = updated; onChange(updated); refresh(); } else close();
      }));
    },
  });
}

function applicationsView(root, state) {
  const listEl = root.querySelector('#plList');
  const moreEl = root.querySelector('#plMore');
  let rows = [];
  let seq = 0;

  const draw = () => {
    mount(moreEl, '');
    if (!rows.length) { mount(listEl, emptyState(t('application.none'), t('common.tryAnotherFilter'))); return; }
    mount(listEl, html`
      <div class="table-wrap">
        <table class="table table-click">
          <thead><tr>
            <th scope="col">${t('field.name')}</th><th scope="col">${t('field.studentId')}</th>
            <th scope="col">${t('application.submitted')}</th><th scope="col">${t('application.roster')}</th><th scope="col">${t('analytics.status')}</th>
          </tr></thead>
          <tbody>${rows.map((a, i) => html`
            <tr>
              <td data-label="${t('field.name')}"><button type="button" class="row-link" data-row="${i}">${a.fullName || '—'}</button>${a.duplicates ? html` <span class="badge">${t('application.duplicate')}</span>` : ''}</td>
              <td data-label="${t('field.studentId')}" class="mono">${a.studentCode || '—'}</td>
              <td data-label="${t('application.submitted')}">${dateTime(a.submittedAt) || '—'}</td>
              <td data-label="${t('application.roster')}">${a.rosterMatch === false ? html`<span class="text-bad">${t('application.notInRoster')}</span>` : a.rosterMatch ? t('application.inRoster') : '—'}</td>
              <td data-label="${t('analytics.status')}">${appStatusBadge(a.status)}</td>
            </tr>`)}</tbody>
        </table>
      </div>`);
  };

  async function load() {
    const mine = ++seq;
    mount(listEl, loadingState());
    try {
      const page = await api.ops.listApplications({ status: state.status, query: state.query });
      if (mine !== seq) return;
      rows = page.items;
      draw();
    } catch (err) {
      if (mine !== seq) return;
      mount(listEl, err.code === 'backend_required'
        ? html`<div class="state state-pending"><p class="state-title">${t('application.notConnected')}</p><p class="state-text">${t('application.notConnectedText')}</p></div>`
        : workspaceErrorState(err));
      listEl.querySelector('[data-action=retry]')?.addEventListener('click', load);
    }
  }
  listEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-row]');
    if (!btn) return;
    applicationDrawer(rows[Number(btn.dataset.row)], updated => {
      rows = rows.map(r => (r.id === updated.id ? updated : r)).filter(r => !state.status || r.status === state.status);
      draw();
    });
  });
  return { load };
}

/* ---------- Staff ---------- */

const STAFF_FILTERS = ['', 'section_editor', 'content_manager', 'admin'];

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
        ${roleButtons(m)}
        ${editor ? html`<button type="button" class="btn btn-sm btn-ghost" data-scope>${t('people.editScope')}</button>` : ''}
      </div>
      ${editor ? html`
        <div class="member-scopes"><p class="member-scopes-label">${t('studio.scope')}</p>${scopeList(m.scopes)}</div>
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

function staffView(root, state) {
  const listEl = root.querySelector('#plList');
  const moreEl = root.querySelector('#plMore');
  let members = [];
  let cursor = null;
  let seq = 0;
  const groupsPromise = api.catalog.listGroups().catch(() => []);

  const draw = () => {
    mount(listEl, members.length ? html`<div class="member-list">${members.map(memberCard)}</div>`
      : emptyState(state.query ? t('people.noMatch') : t('people.noneYet'), state.query ? t('people.checkSpelling') : t('people.tryEveryone')));
    mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost">${t('common.loadMore')}</button>` : '');
    moreEl.querySelector('button')?.addEventListener('click', () => load(true));
  };

  async function load(more = false) {
    const mine = ++seq;
    if (!more) mount(listEl, loadingState());
    try {
      // "All staff" = anyone holding a staff role; one role = that filter.
      const page = await api.admin.searchMembers({ query: state.query, role: state.role, cursor: more ? cursor : null });
      if (mine !== seq) return;
      const staffOnly = list => (state.role || state.query ? list : list.filter(m => m.roles.some(r => r !== 'student')));
      members = more ? [...members, ...staffOnly(page.items)] : staffOnly(page.items);
      cursor = page.nextCursor;
      draw();
    } catch (err) {
      if (mine !== seq) return;
      mount(listEl, workspaceErrorState(err));
      mount(moreEl, '');
      listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => load());
    }
  }

  const replace = updated => { members = members.map(m => (m.userId === updated.userId ? updated : m)); draw(); };

  listEl.addEventListener('click', async e => {
    const card = e.target.closest('.member');
    if (!card) return;
    const m = members.find(x => x.userId === card.dataset.user);
    if (!m) return;
    const role = e.target.closest('[data-grant]')?.dataset.grant || e.target.closest('[data-revoke]')?.dataset.revoke;
    if (role) {
      const { confirmed, updated } = await changeRole(m, role, Boolean(e.target.closest('[data-grant]')));
      if (updated) replace(updated); else if (confirmed) load();
      return;
    }
    if (e.target.closest('[data-scope]')) openScopeEditor(card, m);
  });

  async function openScopeEditor(card, m) {
    const box = card.querySelector('.scope-editor');
    if (!box || !box.hidden) return;
    const groups = await groupsPromise;
    const draft = m.scopes.map(s => ({ subjectId: s.subjectId, group: s.group, section: s.section }));
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
        if (!draft.some(s => s.subjectId === row.subjectId && s.group === row.group && s.section === row.section)) draft.push(row);
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
  return { load };
}

/* ---------- page ---------- */

export default async function adminPeople({ access, path, query }) {
  const view = PEOPLE_VIEWS.includes(query.view) ? query.view : 'students';
  const state = {
    query: query.q || '',
    status: APPLICATION_STATUSES.includes(query.status) ? query.status : '',
    role: STAFF_FILTERS.includes(query.role) ? query.role : '',
  };
  const filterChips = view === 'applications'
    ? chips([{ value: '', label: t('common.all') }, ...APPLICATION_STATUSES.map(s => ({ value: s, label: t(`application.status.${s}`) }))], state.status, { name: t('filter.byStatus') })
    : view === 'staff'
      ? chips(STAFF_FILTERS.map(r => ({ value: r, label: r ? roleLabel(r) : t('people.allStaff') })), state.role, { name: t('filter.byRole') })
      : '';

  return {
    title: t('nav.studentsTeam'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.studentsTeam'),
      actions: html`<button type="button" class="btn btn-ghost btn-sm" id="plPerms">${icons.shield}<span>${t('people.managePermissions')}</span></button>`,
      body: html`
        <nav class="segmented" aria-label="${t('people.viewLabel')}">
          ${PEOPLE_VIEWS.map(v => html`<a href="#/admin/people${v === 'students' ? '' : `?view=${v}`}" class="${v === view ? 'on' : ''}" ${v === view ? html`aria-current="page"` : ''}>${t(`people.view.${v}`)}</a>`)}
        </nav>
        <form class="toolbar" id="plForm" role="search">
          <div class="search-box search-box-sm">${icons.search}<input type="search" name="q" value="${state.query}" placeholder="${t('people.findPlaceholder')}" aria-label="${t('people.find')}" autocomplete="off"></div>
          ${filterChips ? html`<div class="toolbar-chips">${filterChips}</div>` : ''}
        </form>
        <div id="plList"></div>
        <div class="load-more" id="plMore"></div>`,
    }),
    bind(root) {
      root.querySelector('#plPerms').addEventListener('click', openPermissions);
      const ctl = (view === 'applications' ? applicationsView : view === 'staff' ? staffView : studentsView)(root, state);
      const form = root.querySelector('#plForm');
      const syncUrl = () => {
        const p = new URLSearchParams();
        if (view !== 'students') p.set('view', view);
        if (state.query) p.set('q', state.query);
        if (view === 'applications' && state.status) p.set('status', state.status);
        if (view === 'staff' && state.role) p.set('role', state.role);
        history.replaceState(null, '', `#/admin/people${p.toString() ? `?${p}` : ''}`);
      };
      const reload = () => { syncUrl(); ctl.load(); };
      let timer;
      form.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.query = form.q.value.trim(); reload(); }, 250); });
      form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); state.query = form.q.value.trim(); reload(); });
      form.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
        if (view === 'applications') state.status = btn.dataset.value; else state.role = btn.dataset.value;
        form.querySelectorAll('.chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
        reload();
      }));
      ctl.load();
    },
  };
}
