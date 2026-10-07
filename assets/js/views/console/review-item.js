// One submission as a reviewer sees it: details, file preview, decision.

import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { canDecide, canPublish, validateDecision, MIN_REASON_LENGTH } from '../../services/content-workflow.js';
import { consoleShell, panel } from '../../ui/console.js';
import { statusBadge, statusTrack, reviewNoteBox, itemFacts, fileLabel } from '../../ui/workflow.js';
import { formError, showFormError } from '../../ui/components.js';
import { confirmDialog, toast } from '../../ui/dialog.js';

export default async function reviewItem({ access, path, params, reload }) {
  const item = await api.review.get(params.id);
  const decide = canDecide(item.status);
  const publish = canPublish(item.status);

  const decisionPanel = decide ? panel('Decision', html`
    <div class="field field-dark">
      <label for="rvNote">Review note</label>
      <textarea id="rvNote" rows="4" maxlength="1000" placeholder="Required when rejecting — tell the editor exactly what to fix."></textarea>
      <p class="help">Optional for approval. The editor sees this note.</p>
    </div>
    ${formError('rvError')}
    <div class="decision-actions">
      <button type="button" class="btn btn-danger" id="rejectBtn">${icons.close}<span>Reject</span></button>
      <button type="button" class="btn btn-approve" id="approveBtn">${icons.check}<span>Approve</span></button>
    </div>`) : publish ? panel('Publish', html`
    <p class="muted">Approved. Publishing makes it visible to students in the selected group and section.</p>
    ${formError('rvError')}
    <div class="decision-actions"><button type="button" class="btn btn-primary" id="publishBtn">Publish</button></div>`) : '';

  return {
    title: `Review: ${item.title}`,
    html: consoleShell({
      access, path,
      eyebrow: 'REVIEW',
      title: item.title,
      body: html`
        <a class="back-link" href="#${decide ? '/review' : '/review/history'}">${icons.back}<span>${decide ? 'Review queue' : 'Processed'}</span></a>
        <div class="item-status">${statusBadge(item.status)}${statusTrack(item.status)}</div>
        ${reviewNoteBox(item)}
        <div class="console-cols">
          <div>
            ${panel('Submission', itemFacts(item))}
            ${panel('Description', item.description ? html`<p class="prose">${item.description}</p>` : html`<p class="muted">No description.</p>`)}
          </div>
          <div>
            ${panel('File', html`
              <p class="file-line">${icons.file}<span>${fileLabel(item.file)}</span></p>
              <button type="button" class="btn btn-ghost" id="openFile" ${item.file ? '' : 'disabled'}>${icons.eye}<span>Preview / open file</span></button>
              ${item.externalUrl ? html`<a class="btn btn-ghost" href="${item.externalUrl}" target="_blank" rel="noopener noreferrer">${icons.link}<span>Open external link</span></a>` : ''}
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
        msg.textContent = 'Getting a secure link…';
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
          title: 'Approve this submission?',
          body: html`<p>“${item.title}” will be marked approved and can then be published to students.</p>`,
          confirmLabel: 'Approve',
          run: () => api.review.approve(item.id, { note: text }),
        });
        if (confirmed) { toast('Approved'); reload(); }
      });

      root.querySelector('#rejectBtn')?.addEventListener('click', async () => {
        showFormError(err, '');
        const { confirmed } = await confirmDialog({
          title: 'Reject this submission?',
          body: html`<p>The editor will see your reason and can fix and resubmit “${item.title}”.</p>`,
          tone: 'danger',
          confirmLabel: 'Reject',
          input: { label: 'Reason for rejection', value: note.value.trim(), required: true, minLength: MIN_REASON_LENGTH, placeholder: 'What needs to change?', help: 'Shown to the editor.' },
          run: reason => api.review.reject(item.id, { reason }),
        });
        if (confirmed) { toast('Rejected — the editor has been given your reason'); reload(); }
      });

      root.querySelector('#publishBtn')?.addEventListener('click', async () => {
        const { confirmed } = await confirmDialog({
          title: 'Publish to students?',
          body: html`<p>“${item.title}” becomes visible to students in its group and section.</p>`,
          confirmLabel: 'Publish',
          run: () => api.review.publish(item.id),
        });
        if (confirmed) { toast('Published'); reload(); }
      });
    },
  };
}
