import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { CONFIG } from '../config.js';
import { ERROR_CODES } from '../services/errors.js';
import { microsoftButton, formError, showFormError } from '../ui/components.js';
import { bindMicrosoftSignIn } from '../ui/sign-in.js';
import { t } from '../i18n/index.js';

export default async function login({ query, safeNext }) {
  // ?error=<code> is set by the router when the Microsoft return failed.
  const returnError = ERROR_CODES.includes(query.error || '') ? t(`error.${query.error}`) : '';

  return {
    title: t('auth.signIn'),
    html: html`
      <div class="auth">
        <div class="auth-card">
          <span class="auth-icon">${icons.lock}</span>
          <h1 class="auth-title" tabindex="-1">${t('login.title')}</h1>
          <p class="auth-lead">${t('login.lead', { domain: `@${CONFIG.auth.emailDomain}` })}</p>
          ${query.expired ? html`<p class="notice" role="status">${t('login.expired')}</p>` : ''}
          ${query.signedout ? html`<p class="notice" role="status">${t('login.signedOut')}</p>` : ''}
          ${formError('signInError')}
          ${microsoftButton('signInBtn')}
          <div class="auth-alt">
            <p><strong>${t('login.whoTitle')}</strong> ${t('login.whoText')}</p>
            <p class="muted">${t('login.shared')}</p>
            <p class="muted">${t('login.help')}</p>
          </div>
        </div>
      </div>`,
    bind(root) {
      const err = root.querySelector('#signInError');
      showFormError(err, returnError);
      bindMicrosoftSignIn(root.querySelector('#signInBtn'), err, safeNext(query.next));
    },
  };
}
