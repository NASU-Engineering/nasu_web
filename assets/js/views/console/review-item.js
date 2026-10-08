// One submission as a reviewer sees it: details, file preview, decision.

import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { canDecide, canPublish, validateDecision, MIN_REASON_LENGTH } from '../../services/content-workflow.js';
import { consoleShell, panel } from '../../ui/console.js';
import { statusBadge, statusTrack, reviewNoteBox, itemFacts, fileLabel } from '../../ui/workflow.js';
import { formError, showFormError } from '../../ui/components.js';
import { confirmDialog, toast } from '../../ui/dialog.js';
import { t } from '../../i18n/index.js';

export default async function reviewItem({ access, path, params, reload }) {
  const item = await api.review.get(params.id);
  const decide = canDecide(item.status);
  const publish = canPublish(item.status);
  // Opened from the Admin Control Center (/admin/content/:id) it stays in that shell.
  const inAdmin = path.startsWith('/admin');
  const back = inAdmin ? { href: '/admin/content', label: t('nav.content') }
    : decide ? { href: '/review', label: t('nav.reviewQueue') } : { href: '/review/history', label: t('nav.reviewHistory') };

  const decisionPanel = decide ? panel(t('review.decision'), html`
    <div class="field field-dark">
      <label for="rvNote">${t('review.note')}</label>
      <textarea id="rvNote" rows="4" maxlength="1000" placeholder="${t('review.notePlaceholder')}"></textarea>
      <p class="help">${t('review.noteHelp')}</p>
    </div>
    ${formError('rvError')}
    <div class="decision-actions">
      <button type="button" class="btn btn-danger" id="rejectBtn">${icons.close}<span>${t('review.reject')}</span></button>
      <button type="button" class="btn btn-approve" id="approveBtn">${icons.check}<span>${t('review.approve')}</span></button>
    </div>`) : publish ? panel(t('review.publish'), html`
    <p class="muted">${t('review.publishText')}</p>
    ${formError('rvError')}
    <div class="decision-actions"><button type="button" class="btn btn-primary" id="publishBtn">${t('review.publish')}</button></div>`) : '';

  return {
    title: t('review.pageTitle', { title: item.title }),
    html: consoleShell({
      access, path,
      eyebrow: inAdmin ? t('experience.admin') : t('experience.review'),
      title: item.title,
      body: html`
        <a class="back-link" href="#${back.href}">${icons.back}<span>${back.label}</span></a>
        <div class="item-status">${statusBadge(item.status)}${statusTrack(item.status)}</div>
        ${reviewNoteBox(item)}
        <div class="console-cols">
          <div>
            ${panel(t('review.submission'), itemFacts(item))}
            ${panel(t('field.description'), item.description ? html`<p class="prose">${item.description}</p>` : html`<p class="muted">${t('common.noDescription')}</p>`)}
          </div>
          <div>
            ${panel(t('field.file'), html`
              <p class="file-line">${icons.file}<span>${fileLabel(item.file)}</span></p>
              <button type="button" class="btn btn-ghost" id="openFile" ${item.file ? '' : 'disabled'}>${icons.eye}<span>${t('review.openFile')}</span></button>
              ${item.externalUrl ? html`<a class="btn btn-ghost" href="${item.externalUrl}" target="_blank" rel="noopener noreferrer">${icons.link}<span>${t('review.openExternal')}</span></a>` : ''}
              <p class="help" id="fileMsg" role="status"></p>`)}
            ${decisionPanel}
          </div>
        </div>`,
    }),
    bind(root) {
      const err = root.querySelector('#rvError');
      const note = root.querySelector('#rvNote');

      root.querySelector('#openFile')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        const msg = root.querySelector('#fileMsg');
        // Open the tab synchronously (popup blockers), then point it at the signed URL.
        const win = window.open('', '_blank');
        btn.disabled = true;
        msg.textContent = t('review.gettingLink');
        try {
          const url = await api.review.getFileUrl(item);
          if (win) { win.opener = null; win.location.href = url; } else location.assign(url);
          msg.textContent = '';
        } catch (ex) {
          win?.close();
          msg.textContent = ex.message;
        } finally {
          btn.disabled = false;
        }
      });

      root.querySelector('#approveBtn')?.addEventListener('click', async () => {
        const text = note.value.trim();
        const check = validateDecision('approve', text);
        if (!check.ok) return showFormError(err, check.error);
        showFormError(err, '');
        const { confirmed } = await confirmDialog({
          title: t('review.approveTitle'),
          body: html`<p>${t('review.approveText', { title: item.title })}</p>`,
          confirmLabel: t('review.approve'),
          run: () => api.review.approve(item.id, { note: text }),
        });
        if (confirmed) { toast(t('status.approved')); reload(); }
      });

      root.querySelector('#rejectBtn')?.addEventListener('click', async () => {
        showFormError(err, '');
        const { confirmed } = await confirmDialog({
          title: t('review.rejectTitle'),
          body: html`<p>${t('review.rejectText', { title: item.title })}</p>`,
          tone: 'danger',
          confirmLabel: t('review.reject'),
          input: { label: t('review.reasonFor'), value: note.value.trim(), required: true, minLength: MIN_REASON_LENGTH, placeholder: t('review.reasonPlaceholder'), help: t('review.reasonHelp') },
          run: reason => api.review.reject(item.id, { reason }),
        });
        if (confirmed) { toast(t('review.rejectedToast')); reload(); }
      });

      root.querySelector('#publishBtn')?.addEventListener('click', async () => {
        const { confirmed } = await confirmDialog({
          title: t('review.publishTitle'),
          body: html`<p>${t('review.publishConfirm', { title: item.title })}</p>`,
          confirmLabel: t('review.publish'),
          run: () => api.review.publish(item.id),
        });
        if (confirmed) { toast(t('status.published')); reload(); }
      });
    },
  };
}
