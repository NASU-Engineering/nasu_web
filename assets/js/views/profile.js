import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api, isDemoMode } from '../services/api.js';
import { ROLES, roleLabel, workspacesFor } from '../services/roles.js';
import { pageHead, sectionLabel } from '../ui/components.js';
import { scopesList } from './console/editor-overview.js';
import { roleBadges } from './console/admin-team.js';

export default async function profile({ session, access, reload }) {
  const me = await api.profile.getMine();
  const workspaces = workspacesFor(access.roles);
  const demoRoles = api.dev ? api.dev.getDemoRoles() : [];

  return {
    title: 'Profile',
    html: html`
      ${pageHead({ eyebrow: 'PROFILE', title: me.fullName || 'Your profile' })}
      <section class="profile-card" aria-label="Your details">
        <div class="profile-id">
          <span class="avatar">${icons.user}</span>
          <div>
            <p class="profile-name">${me.fullName}</p>
            <p class="profile-sub mono">${session?.email || ''}</p>
          </div>
        </div>
        <dl class="profile-grid">
          <div><dt>Student ID</dt><dd class="mono">${me.studentId}</dd></div>
          <div><dt>Group</dt><dd>${me.group}</dd></div>
          <div><dt>Section</dt><dd>${me.section}</dd></div>
        </dl>
      </section>

      ${sectionLabel('Roles')}
      <div class="panel panel-plain">
        ${access.roles.length ? roleBadges(access.roles) : roleBadges(['student'])}
        ${access.available ? '' : html`<p class="help">Staff roles aren’t connected yet, so only the student hub is shown.</p>`}
      </div>

      ${workspaces.length ? html`
        ${sectionLabel('Your workspaces')}
        <div class="ws-grid">${workspaces.map(w => html`<a class="ws-card" href="#${w.home}">${icons[w.id === 'editor' ? 'upload' : w.id === 'review' ? 'inbox' : 'shield']}<span>${w.label}</span>${icons.chevron}</a>`)}</div>` : ''}

      ${access.roles.includes('section_editor') ? html`${sectionLabel('Upload scope')}${scopesList(access.scopes)}` : ''}

      ${isDemoMode ? html`
        ${sectionLabel('Demo roles (development mock only)')}
        <form class="panel panel-plain demo-roles" id="demoRoles">
          <p class="help">Preview each role’s UI. This switcher only exists with the mock backend; real roles come from the backend.</p>
          ${Object.values(ROLES).filter(r => r.id !== 'student').map(r => html`
            <label class="check"><input type="checkbox" name="role" value="${r.id}" ${demoRoles.includes(r.id) ? 'checked' : ''}><span>${roleLabel(r.id)}</span></label>`)}
          <button type="submit" class="btn btn-ghost">Apply</button>
        </form>` : ''}

      <div class="profile-foot"><button type="button" class="btn btn-ghost" data-action="sign-out">${icons.logout}<span>Sign out</span></button></div>`,
    bind(root) {
      root.querySelector('#demoRoles')?.addEventListener('submit', async e => {
        e.preventDefault();
        const roles = [...e.target.querySelectorAll('input[name=role]:checked')].map(i => i.value);
        await api.dev.setDemoRoles(roles);
        reload();
      });
    },
  };
}
