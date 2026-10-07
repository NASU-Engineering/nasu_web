import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { CONFIG } from '../config.js';
import { MESSAGES } from '../services/errors.js';
import { microsoftButton, formError, showFormError } from '../ui/components.js';
import { bindMicrosoftSignIn } from '../ui/sign-in.js';

export default async function login({ query, safeNext }) {
  // ?error=<code> is set by the router when the Microsoft return failed.
  const returnError = Object.hasOwn(MESSAGES, query.error || '') ? MESSAGES[query.error] : '';

  return {
    title: 'Sign in',
    html: html`
      <div class="auth">
        <div class="auth-card">
          <span class="auth-icon">${icons.lock}</span>
          <h1 class="auth-title" tabindex="-1">Sign in to the hub</h1>
          <p class="auth-lead">Use your NASU university Microsoft account — the same one you use for your <strong class="mono">@${CONFIG.auth.emailDomain}</strong> email.</p>
          ${query.expired ? html`<p class="notice" role="status">Your session ended. Please sign in again.</p>` : ''}
          ${query.signedout ? html`<p class="notice" role="status">You’ve signed out of the hub.</p>` : ''}
          ${formError('signInError')}
          ${microsoftButton('signInBtn')}
          <div class="auth-alt">
            <p><strong>Who can sign in?</strong> Prep-year engineering students with a NASU Microsoft account.</p>
            <p class="muted">On a shared or public computer, also sign out of Microsoft when you’re done.</p>
            <p class="muted">Can’t sign in? Contact the prep-year office.</p>
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
