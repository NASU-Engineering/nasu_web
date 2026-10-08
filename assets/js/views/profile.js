// Student Hub · Profile: student details and display settings (language, theme).
// No staff roles, workspaces or testing tools here.

import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { pageHead, sectionLabel } from '../ui/components.js';
import { displaySettings, bindDisplaySettings } from '../ui/settings.js';
import { t } from '../i18n/index.js';

export default async function profile({ session }) {
  const me = await api.profile.getMine();

  return {
    title: t('nav.profile'),
    html: html`
      ${pageHead({ title: t('nav.profile') })}
      <section class="profile-card" aria-label="${t('profile.details')}">
        <div class="profile-id">
          <span class="avatar">${icons.user}</span>
          <div>
            <p class="profile-name">${me.fullName}</p>
            <p class="profile-sub mono" dir="ltr">${session?.email || ''}</p>
          </div>
        </div>
        <dl class="profile-grid">
          <div><dt>${t('field.studentId')}</dt><dd class="mono">${me.studentId}</dd></div>
          <div><dt>${t('field.group')}</dt><dd>${me.group}</dd></div>
          <div><dt>${t('field.section')}</dt><dd>${me.section}</dd></div>
        </dl>
      </section>
      <p class="muted profile-help">${t('profile.wrongDetails')}</p>

      <section aria-labelledby="settingsTitle">
        <h2 class="section-label" id="settingsTitle"><span>${t('settings.title')}</span><span class="ln"></span></h2>
        <div class="panel panel-plain">${displaySettings('profile')}</div>
      </section>

      <div class="profile-foot"><button type="button" class="btn btn-ghost" data-action="sign-out">${icons.logout}<span>${t('auth.signOut')}</span></button></div>`,
    bind(root) { bindDisplaySettings(root); },
  };
}
