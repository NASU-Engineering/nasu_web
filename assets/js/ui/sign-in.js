// Shared behaviour for every "Continue with NASU Microsoft Account" button.

import { api } from '../services/api.js';
import { showFormError } from './components.js';
import { t } from '../i18n/index.js';

/**
 * @param {HTMLButtonElement} btn   a microsoftButton()
 * @param {HTMLElement} errEl       a formError() element
 * @param {string|null} next        validated in-app route to return to
 */
export function bindMicrosoftSignIn(btn, errEl, next = null) {
  const label = btn.querySelector('.ms-label');
  const idle = label.textContent;
  const reset = () => { btn.disabled = false; label.textContent = idle; };

  btn.addEventListener('click', async () => {
    showFormError(errEl, '');
    btn.disabled = true;
    label.textContent = t('auth.opening');
    try {
      // On success the browser leaves for Microsoft, so the busy state stays.
      await api.auth.startSignIn({ next });
    } catch (ex) {
      showFormError(errEl, ex.message);
      reset();
    }
  });
  // Coming back with the Back button restores the page from cache mid-redirect.
  window.addEventListener('pageshow', e => { if (e.persisted) reset(); }, { once: true });
}
