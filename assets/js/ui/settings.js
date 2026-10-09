// Display settings: language (English / العربية) and theme. Used on the
// Profile page and in the top-bar settings dialog (every experience).
// Preferences are per browser (localStorage) — no account data involved.

import { html, mount } from './html.js';
import { icons } from './icons.js';
import { LOCALES, getLocale, setLocale, t } from '../i18n/index.js';
import { THEMES, getThemePreference, setThemePreference, currentTheme } from './theme.js';

// "System — currently Dark": System isn't a palette of its own, so say which one it resolved to.
const systemLabel = () => t('theme.systemCurrently', { theme: t(`theme.${currentTheme()}`) });

// Keep every visible System label in step with the OS / the user's choice.
if (typeof document !== 'undefined') {
  document.addEventListener('nasu:theme', () => document.querySelectorAll('.theme-sys-now').forEach(el => { el.textContent = systemLabel(); }));
}

/** The settings form. `id` keeps radio names unique when two forms exist. */
export function displaySettings(id = 'ds') {
  const lang = getLocale();
  const theme = getThemePreference();
  return html`
    <div class="ds" data-ds="${id}">
      <fieldset class="ds-group">
        <legend>${icons.globe}<span>${t('settings.language')}</span></legend>
        <div class="ds-options ds-lang">
          ${Object.values(LOCALES).map(l => html`
            <label class="ds-opt">
              <input type="radio" name="${id}-lang" value="${l.id}" ${l.id === lang ? 'checked' : ''}>
              <span lang="${l.id}" dir="${l.dir}">${l.label}</span>
            </label>`)}
        </div>
      </fieldset>
      <fieldset class="ds-group">
        <legend>${icons.eye}<span>${t('settings.theme')}</span></legend>
        <div class="theme-list">
          ${THEMES.map(th => html`
            <label class="theme-opt">
              <input type="radio" name="${id}-theme" value="${th}" ${th === theme ? 'checked' : ''}>
              <span class="theme-prev theme-prev-${th}" aria-hidden="true"><span></span><span></span><span></span></span>
              <span class="theme-text">
                <strong>${th === 'system' ? html`<span class="theme-sys-now">${systemLabel()}</span>` : t(`theme.${th}`)}</strong>
                <span>${t(`theme.${th}Note`)}</span>
              </span>
              <span class="theme-check" aria-hidden="true">${icons.check}</span>
            </label>`)}
        </div>
        <p class="ds-help">${t('settings.themeHelp')}</p>
      </fieldset>
    </div>`;
}

/** Wires a displaySettings() block. Language changes re-render the app (app.js listens). */
export function bindDisplaySettings(root) {
  root.querySelectorAll('.ds input[type=radio]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    if (input.name.endsWith('-theme')) setThemePreference(input.value);
    else setLocale(input.value);
  }));
}

/** Modal dialog with the settings (top bar → gear). */
export function openSettingsDialog() {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg dlg-settings';
  dlg.setAttribute('aria-labelledby', 'settingsTitle');
  const opener = document.activeElement;
  const render = () => mount(dlg, html`
    <div class="dlg-card">
      <div class="dlg-head">
        <h2 class="dlg-title" id="settingsTitle">${t('settings.title')}</h2>
        <button type="button" class="icon-btn icon-btn-sm" data-close aria-label="${t('common.close')}">${icons.close}</button>
      </div>
      ${displaySettings('dlg')}
    </div>`);
  render();
  document.body.append(dlg);
  const close = () => { if (dlg.open) dlg.close(); dlg.remove(); opener?.focus?.({ preventScroll: true }); };
  dlg.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === dlg) close(); });
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dlg.addEventListener('change', e => {
    const input = e.target.closest('input[type=radio]');
    if (!input?.checked) return;
    if (input.name.endsWith('-theme')) setThemePreference(input.value);
    else { setLocale(input.value); render(); dlg.querySelector(`input[value="${input.value}"]`)?.focus(); }
  });
  dlg.showModal();
  dlg.querySelector('input:checked')?.focus();
}
