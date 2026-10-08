import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { canSubmit, isEditable } from '../../services/content-workflow.js';
import { consoleShell, panel } from '../../ui/console.js';
import { statusBadge, statusTrack, reviewNoteBox, itemFacts } from '../../ui/workflow.js';
import { confirmDialog, toast } from '../../ui/dialog.js';
import { t } from '../../i18n/index.js';

export default async function editorItem({ access, path, params, reload }) {
  const item = await api.editor.get(params.id);
  const editHref = `#/editor/upload?id=${encodeURIComponent(item.id)}`;

  return {
    title: item.title,
    html: consoleShell({
      access, path,
      eyebrow: t('experience.editor'),
      title: item.title,
      actions: html`
        ${isEditable(item.status) ? html`<a class="btn btn-ghost" href="${editHref}">${t('common.edit')}</a>` : ''}
        ${canSubmit(item.status) ? html`<button type="button" class="btn btn-primary" id="submitBtn" ${item.file ? '' : 'disabled'} title="${item.file ? '' : t('studio.attachFirst')}">${t('studio.submit')}</button>` : ''}`,
      body: html`
        <a class="back-link" href="#/editor/uploads">${icons.back}<span>${t('nav.myContent')}</span></a>
        <div class="item-status">${statusBadge(item.status)}${statusTrack(item.status)}</div>
        ${reviewNoteBox(item)}
        <div class="console-cols">
          ${panel(t('common.details'), itemFacts(item, { withSubmitter: false }))}
          ${panel(t('field.description'), item.description ? html`<p class="prose">${item.description}</p>` : html`<p class="muted">${t('common.noDescription')}</p>`)}
        </div>
        ${item.status === 'pending_review' ? html`<p class="notice">${icons.clock}<span>${t('studio.waiting')}</span></p>` : ''}`,
    }),
    bind(root) {
      root.querySelector('#submitBtn')?.addEventListener('click', async () => {
        const { confirmed } = await confirmDialog({
          title: t('studio.submitTitle'),
          body: html`<p>${t('studio.submitText', { title: item.title })}</p>`,
          confirmLabel: t('studio.submit'),
          run: () => api.editor.submit(item.id),
        });
        if (confirmed) { toast(t('studio.submitted')); reload(); }
      });
    },
  };
}
