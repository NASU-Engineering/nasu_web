// Student Hub · Profile. Student details only — no staff roles, workspaces or
// testing tools here (those live in the staff workspaces / Admin simulator).

import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { pageHead } from '../ui/components.js';

export default async function profile({ session }) {
  const me = await api.profile.getMine();

  return {
    title: 'Profile',
    html: html`
      ${pageHead({ title: 'Profile' })}
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
      <p class="muted profile-help">Details look wrong? Contact the prep-year office.</p>
      <div class="profile-foot"><button type="button" class="btn btn-ghost" data-action="sign-out">${icons.logout}<span>Sign out</span></button></div>`,
  };
}
