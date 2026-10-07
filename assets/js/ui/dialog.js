// Confirmation dialog and toast. Built on <dialog> so focus trapping, Escape
// and the backdrop come from the browser.

import { html, mount } from './html.js';
import { icons } from './icons.js';

/**
 * Asks before an important action. Resolves to { confirmed, value }.
 *   tone:  'default' | 'danger'
 *   input: { label, value, placeholder, required, minLength, help }  — optional textarea (e.g. rejection reason)
 *   run:   async (value) => {}  — optional; runs while the dialog shows a busy state. If it
 *          throws, the error message is shown in the dialog and it stays open for a retry.
 */
export function confirmDialog({ title, body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', input = null, run = null }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    dlg.setAttribute('aria-labelledby', 'dlgTitle');
    mount(dlg, html`
      <form method="dialog" class="dlg-card" novalidate>
        <h2 class="dlg-title" id="dlgTitle">${title}</h2>
        ${body ? html`<div class="dlg-body">${body}</div>` : ''}
        ${input ? html`
          <div class="field dlg-field">
            <label for="dlgInput">${input.label}${input.required ? '' : html` <span class="opt">(optional)</span>`}</label>
            <textarea id="dlgInput" rows="4" placeholder="${input.placeholder || ''}" maxlength="1000">${input.value || ''}</textarea>
            ${input.help ? html`<p class="help">${input.help}</p>` : ''}
          </div>` : ''}
        <p class="form-error" role="alert" hidden></p>
        <div class="dlg-actions">
          <button type="button" class="btn btn-quiet" value="cancel" data-cancel>${cancelLabel}</button>
          <button type="submit" class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmLabel}</button>
        </div>
      </form>`);
    document.body.append(dlg);

    const form = dlg.querySelector('form');
    const ok = dlg.querySelector('[data-ok]');
    const cancel = dlg.querySelector('[data-cancel]');
    const field = dlg.querySelector('#dlgInput');
    const err = dlg.querySelector('.form-error');
    const opener = document.activeElement;
    let busy = false;
    let done = false;

    const showErr = msg => { err.textContent = msg || ''; err.hidden = !msg; };
    // Resolve explicitly rather than via the 'close' event, which isn't
    // delivered reliably in every embedded/hidden browser context.
    const finish = (confirmed, value = '') => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      opener?.focus?.({ preventScroll: true });
      resolve({ confirmed, value });
    };

    cancel.addEventListener('click', () => { if (!busy) finish(false); });
    // Escape key
    dlg.addEventListener('cancel', e => { e.preventDefault(); if (!busy) finish(false); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const value = field ? field.value.trim() : '';
      if (input?.required && value.length < (input.minLength || 1)) {
        showErr(input.minLength ? `Please write at least ${input.minLength} characters.` : 'This is required.');
        field.focus();
        return;
      }
      showErr('');
      if (run) {
        busy = true;
        ok.disabled = cancel.disabled = true;
        const idle = ok.textContent;
        ok.textContent = 'Working…';
        try {
          await run(value);
        } catch (ex) {
          busy = false;
          ok.disabled = cancel.disabled = false;
          ok.textContent = idle;
          showErr(ex?.message || 'Something went wrong.');
          return;
        }
        busy = false;
      }
      finish(true, value);
    });

    dlg.showModal();
    (field || cancel).focus();
  });
}

let toastTimer;
/** Short, polite status message ("Submitted for review"). */
export function toast(message, { tone = 'ok' } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.dataset.tone = tone;
  mount(el, html`${tone === 'ok' ? icons.check : icons.alert}<span>${message}</span>`);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
