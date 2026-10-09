// Side drawer (record details) built on <dialog>: modal, Esc / backdrop / close
// button dismiss it, focus moves in and returns to the opener. Slides in from
// the inline end, so it mirrors in Arabic.

import { html, mount } from './html.js';
import { icons } from './icons.js';
import { t } from '../i18n/index.js';

/**
 * Opens a drawer. render(close) returns its body markup; bind(el, close) wires it.
 * Returns { el, close, refresh }.
 */
export function openDrawer({ title, render, bind }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'drawer';
  dlg.setAttribute('aria-labelledby', 'drawerTitle');
  const opener = document.activeElement;
  const close = () => {
    if (!dlg.isConnected) return;
    if (dlg.open) dlg.close();
    dlg.remove();
    opener?.focus?.({ preventScroll: true });
  };
  const refresh = () => {
    mount(dlg, html`
      <div class="drawer-panel">
        <header class="drawer-head">
          <h2 class="drawer-title" id="drawerTitle">${title}</h2>
          <button type="button" class="icon-btn icon-btn-sm" data-close aria-label="${t('common.close')}">${icons.close}</button>
        </header>
        <div class="drawer-body">${render(close)}</div>
      </div>`);
    bind?.(dlg, close, refresh);
  };
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  document.body.append(dlg);
  refresh();
  dlg.showModal();
  dlg.querySelector('[data-close]')?.focus();
  return { el: dlg, close, refresh };
}
