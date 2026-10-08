// Admin · Settings · Platform: read-only view of the platform configuration
// and feature status. Changing these is a reviewed code/backend change, not a
// button — so nothing here writes anything.

import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { CONFIG } from '../../config.js';
import { api, isDemoMode, usesSampleContent } from '../../services/api.js';
import { LOCALES } from '../../i18n/index.js';
import { THEMES } from '../../ui/theme.js';
import { consoleShell, panel } from '../../ui/console.js';
import { t } from '../../i18n/index.js';

const settle = p => p.then(value => ({ value }), error => ({ error }));
const row = (label, value, note = '') => html`<div><dt>${label}</dt><dd>${value}${note ? html`<span class="muted"> — ${note}</span>` : ''}</dd></div>`;
const onOff = on => html`<span class="av ${on ? 'av-live' : 'av-none'}">${on ? t('settings.on') : t('settings.off')}</span>`;

export default async function adminSettings({ access, path }) {
  const engage = await settle(api.engage.adminStats());
  return {
    title: t('nav.platform'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.settings'),
      lead: t('platform.lead'),
      body: html`
        <div class="console-cols">
          ${panel(t('platform.connections'), html`<dl class="facts facts-1">
            ${row(t('platform.backend'), isDemoMode ? t('platform.mock') : 'Supabase', isDemoMode ? t('platform.mockNote') : '')}
            ${row(t('platform.signIn'), 'Microsoft (NASU)', `@${CONFIG.auth.emailDomain}`)}
            ${row(t('platform.contentSource'), isDemoMode || usesSampleContent ? t('platform.sample') : t('platform.live'))}
            ${row(t('platform.uploads'), t('platform.uploadsValue', { max: CONFIG.uploads.maxMb }), CONFIG.uploads.accept.join(' '))}
          </dl>`)}
          ${panel(t('platform.features'), html`<dl class="facts facts-1">
            ${row(t('nav.simulator'), onOff(CONFIG.features?.roleSimulator !== false), html`<a href="#/admin/settings/simulator">${t('common.open')}</a>`)}
            ${row(t('platform.engagement'), onOff(!engage.error), engage.error ? t('admin.status.engagementNotLive') : t('admin.status.mockText'))}
            ${row(t('platform.presence'), onOff(false), t('admin.status.presenceText'))}
            ${row(t('platform.whatsapp'), onOff(false), t('platform.whatsappNote'))}
          </dl>`)}
        </div>
        ${panel(t('platform.display'), html`<dl class="facts facts-1">
          ${row(t('settings.language'), Object.values(LOCALES).map(l => l.label).join(' · '), t('platform.languageNote'))}
          ${row(t('settings.theme'), THEMES.map(th => t(`theme.${th}`)).join(' · '), t('platform.themeNote'))}
        </dl>`)}
        <p class="notice">${icons.shield}<span>${t('platform.changeNote')}</span></p>`,
    }),
  };
}
