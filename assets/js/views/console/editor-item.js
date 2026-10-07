import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { canSubmit, isEditable } from '../../services/content-workflow.js';
import { consoleShell, panel } from '../../ui/console.js';
import { statusBadge, statusTrack, reviewNoteBox, itemFacts } from '../../ui/workflow.js';
import { confirmDialog, toast } from '../../ui/dialog.js';

export default async function editorItem({ access, path, params, reload }) {
  const item = await api.editor.get(params.id);
  const editHref = `#/editor/upload?id=${encodeURIComponent(item.id)}`;

  return {
    title: item.title,
    html: consoleShell({
      access, path,
      eyebrow: 'MY UPLOADS',
      title: item.title,
      actions: html`
        ${isEditable(item.status) ? html`<a class="btn btn-ghost" href="${editHref}">Edit</a>` : ''}
        ${canSubmit(item.status) ? html`<button type="button" class="btn btn-primary" id="submitBtn" ${item.file ? '' : 'disabled'} title="${item.file ? '' : 'Attach a file first'}">Submit for review</button>` : ''}`,
      body: html`
        <a class="back-link" href="#/editor/uploads">${icons.back}<span>My uploads</span></a>
        <div class="item-status">${statusBadge(item.status)}${statusTrack(item.status)}</div>
        ${reviewNoteBox(item)}
        <div class="console-cols">
          ${panel('Details', itemFacts(item, { withSubmitter: false }))}
          ${panel('Description', item.description ? html`<p class="prose">${item.description}</p>` : html`<p class="muted">No description.</p>`)}
        </div>
        ${item.status === 'pending_review' ? html`<p class="notice">${icons.clock}<span>Waiting for a content manager. You’ll see the decision here.</span></p>` : ''}`,
    }),
    bind(root) {
      root.querySelector('#submitBtn')?.addEventListener('click', async () => {
        const { confirmed } = await confirmDialog({
          title: 'Submit for review?',
          body: html`<p>“${item.title}” goes to the review queue. You can’t edit it while it’s being reviewed.</p>`,
          confirmLabel: 'Submit for review',
          run: () => api.editor.submit(item.id),
        });
        if (confirmed) { toast('Submitted for review'); reload(); }
      });
    },
  };
}
