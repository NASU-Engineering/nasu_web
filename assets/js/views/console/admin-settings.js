// Admin · Settings — four short sections on one page:
//   General · Appearance · Access & Security · Advanced (collapsed)
// Configuration is read-only here: changing it is a reviewed code/backend
// change, not a button. Technical diagnostics stay inside "Advanced".

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { CONFIG } from '../../config.js';
import { api, isDemoMode, usesSampleContent } from '../../services/api.js';
import { engagementEnabled } from '../../services/supabase-engage.js';
import { consoleShell } from '../../ui/console.js';
import { displaySettings, bindDisplaySettings } from '../../ui/settings.js';
import { openPermissions } from './admin-people.js';
import { formatNumber, t } from '../../i18n/index.js';

const row = (label, value, note = '') => html`<div><dt>${label}</dt><dd>${value}${note ? html`<span class="muted"> — ${note}</span>` : ''}</dd></div>`;
const onOff = on => html`<span class="av ${on ? 'av-live' : 'av-none'}">${on ? t('settings.on') : t('settings.off')}</span>`;
const section = (id, icon, title, body) => html`
  <section class="set-section" id="set-${id}" aria-labelledby="set-${id}-h">
    <h2 class="set-title" id="set-${id}-h">${icons[icon]}<span>${title}</span></h2>
    ${body}
  </section>`;

export default async function adminSettings({ access, path, query }) {
  const env = isDemoMode ? 'preview' : CONFIG.environment || 'production';
  const openAdvanced = query.open === 'integrity' || query.open === 'advanced';
  return {
    title: t('nav.settings'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.settings'),
      body: html`
        ${section('general', 'grid', t('settings.general'), html`
          <dl class="facts facts-1">
            ${row(t('settings.platform'), t('brand.full'), t(`env.${env}`))}
            ${row(t('settings.academicYear'), CONFIG.academicYear || '—')}
            ${row(t('platform.uploads'), t('platform.uploadsValue', { max: CONFIG.uploads.maxMb }), CONFIG.uploads.accept.join(' '))}
          </dl>`)}

        ${section('appearance', 'eye', t('settings.appearance'), html`
          <p class="help-dark">${t('settings.appearanceNote')}</p>
          ${displaySettings('admin')}`)}

        ${section('access', 'shield', t('settings.accessSecurity'), html`
          <dl class="facts facts-1">
            ${row(t('platform.signIn'), 'Microsoft (NASU)', `@${CONFIG.auth.emailDomain}`)}
            ${row(t('settings.authorization'), t('settings.authorizationText'))}
            ${row(t('settings.rolePolicy'), t('settings.rolePolicyText'))}
          </dl>
          <div class="set-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="setPerms">${icons.shield}<span>${t('people.managePermissions')}</span></button>
            <a class="btn btn-ghost btn-sm" href="#/admin/audit">${icons.history}<span>${t('settings.openAudit')}</span></a>
          </div>`)}

        <details class="set-section set-advanced" id="set-advanced" ${openAdvanced ? 'open' : ''}>
          <summary class="set-title">${icons.settings}<span>${t('settings.advanced')}</span><span class="muted set-hint">${t('settings.advancedHint')}</span></summary>
          <div class="set-advanced-body">
            ${api.sim.current() ? '' : html`
              <div class="set-block">
                <h3>${t('nav.simulator')}</h3>
                <p class="help-dark">${t('sim.lead')}</p>
                <a class="btn btn-ghost btn-sm" href="#/admin/simulator">${icons.eye}<span>${t('settings.openSimulator')}</span></a>
              </div>`}
            <div class="set-block">
              <h3>${t('settings.diagnostics')}</h3>
              <dl class="facts facts-1">
                ${row(t('settings.environment'), t(`env.${env}`))}
                ${row(t('platform.backend'), isDemoMode ? t('platform.mock') : 'Supabase', isDemoMode ? t('platform.mockNote') : '')}
                ${row(t('platform.contentSource'), isDemoMode || usesSampleContent ? t('platform.sample') : t('platform.live'))}
                ${row(t('platform.engagement'), onOff(isDemoMode || engagementEnabled()))}
                ${row(t('platform.presence'), onOff(isDemoMode || CONFIG.features?.presence === true))}
                ${row(t('platform.whatsapp'), onOff(false), t('platform.whatsappNote'))}
              </dl>
            </div>
            <div class="set-block" id="set-integrity">
              <h3>${t('settings.integrity')}</h3>
              <div id="setIntegrity"><p class="muted">${t('common.loading')}</p></div>
              <p class="help-dark">${t('settings.integrityDocs')}</p>
            </div>
          </div>
        </details>`,
    }),
    async bind(root) {
      bindDisplaySettings(root);
      root.querySelector('#setPerms').addEventListener('click', openPermissions);
      if (query.open === 'integrity') root.querySelector('#set-integrity')?.scrollIntoView({ block: 'center' });
      const el = root.querySelector('#setIntegrity');
      try {
        const s = await api.ops.integritySummary();
        if (!el.isConnected) return;
        const line = (key, n) => html`<li><span class="mono">${formatNumber(Number(n) || 0)}</span> ${t(`settings.integrity.${key}`)}</li>`;
        mount(el, html`<ul class="integrity-list">
          ${line('phones', s.approved_missing_phone)}
          ${line('roster', s.applications_not_in_roster)}
          ${line('duplicates', s.duplicate_submissions)}
          ${line('intake', s.intake_errors)}
        </ul>`);
      } catch (err) {
        if (el.isConnected) mount(el, html`<p class="muted">${err.code === 'backend_required' ? t('admin.notCollected') : err.message}</p>`);
      }
    },
  };
}
