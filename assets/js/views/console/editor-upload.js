// Upload Content: create a draft, or edit a draft / rejected item (?id=…).
// Options are limited to the editor's scopes as a convenience; the backend
// re-checks the scope on every save.

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { CONFIG } from '../../config.js';
import { api } from '../../services/api.js';
import { SUBJECTS, subjectById } from '../../data/catalog.js';
import { scopeOptions, uploadScopes } from '../../services/roles.js';
import { CONTENT_TYPES, MAX_WEEK, isEditable, validateSubmission, formatBytes } from '../../services/content-workflow.js';
import { consoleShell } from '../../ui/console.js';
import { statusBadge, reviewNoteBox, fileLabel } from '../../ui/workflow.js';
import { emptyState, formError, showFormError } from '../../ui/components.js';
import { confirmDialog, toast } from '../../ui/dialog.js';

const ALL = '*'; // <option> value for "All groups" / "All sections" (null in the data)
const enc = v => (v == null ? ALL : v);
const dec = v => (v === ALL || v === '' ? null : v);

const fieldErr = name => html`<p class="help bad" data-err="${name}" hidden></p>`;

export default async function editorUpload({ access, path, query, navigate }) {
  const editingId = query.id || null;
  const [existing, groups] = await Promise.all([
    editingId ? api.editor.get(editingId) : null,
    api.catalog.listGroups().catch(() => []), // wildcard scopes just show "All …" without it
  ]);
  const opts = scopeOptions(uploadScopes(access, SUBJECTS.map(s => s.id)), groups);
  const shell = body => consoleShell({
    access, path, eyebrow: 'EDITOR WORKSPACE',
    title: existing ? 'Edit upload' : 'Upload content',
    lead: existing ? '' : 'Save a draft any time. When it’s ready, submit it for review — a content manager approves it before it’s published.',
    body,
  });

  if (!opts.subjects.length) {
    return { title: 'Upload content', html: shell(emptyState('You don’t have an upload scope yet', 'An admin assigns each editor the subjects, groups and sections they can upload for. Ask a hub admin to set yours.')) };
  }
  if (existing && !isEditable(existing.status)) {
    return {
      title: 'Edit upload',
      html: shell(html`
        <div class="state"><p class="state-title">This item can’t be edited now</p>
        <p class="state-text">It’s ${statusBadge(existing.status)} — only drafts and rejected items can be changed.</p>
        <p><a class="btn btn-ghost" href="#/editor/uploads/${encodeURIComponent(existing.id)}">View item</a></p></div>`),
    };
  }

  const { maxMb, accept } = CONFIG.uploads;
  const maxBytes = maxMb * 1048576;
  const subjects = SUBJECTS.filter(s => opts.subjects.includes(s.id));
  // An item saved under a scope that has since changed still shows its subject.
  if (existing && !subjects.some(s => s.id === existing.subjectId) && subjectById(existing.subjectId)) subjects.push(subjectById(existing.subjectId));

  return {
    title: existing ? 'Edit upload' : 'Upload content',
    html: shell(html`
      ${existing ? html`
        <a class="back-link" href="#/editor/uploads/${encodeURIComponent(existing.id)}">${icons.back}<span>Back to item</span></a>
        <div class="item-status">${statusBadge(existing.status)}</div>
        ${reviewNoteBox(existing)}` : ''}
      <form class="form-card" id="upForm" novalidate>
        ${formError('upError')}
        <fieldset>
          <legend>Where it goes</legend>
          <div class="field">
            <label for="fSubject">Subject</label>
            <select id="fSubject" name="subjectId" required>
              ${subjects.map(s => html`<option value="${s.id}" ${existing?.subjectId === s.id ? 'selected' : ''}>${s.code} — ${s.name}</option>`)}
            </select>
            ${fieldErr('subjectId')}
          </div>
          <div class="form-grid form-grid-2">
            <div class="field"><label for="fGroup">Group</label><select id="fGroup" name="group"></select></div>
            <div class="field"><label for="fSection">Section</label><select id="fSection" name="section"></select></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>What it is</legend>
          <div class="field">
            <span class="label" id="typeLabel">Content type</span>
            <div class="seg" role="radiogroup" aria-labelledby="typeLabel">
              ${CONTENT_TYPES.map((c, i) => html`
                <label class="seg-opt"><input type="radio" name="contentType" value="${c.id}" ${(existing ? existing.contentType === c.id : i === 0) ? 'checked' : ''}>
                <span>${icons[c.id]}${c.single}</span></label>`)}
            </div>
            ${fieldErr('contentType')}
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="fWeek">Week <span class="opt">(optional)</span></label>
              <input id="fWeek" name="week" type="number" inputmode="numeric" min="1" max="${MAX_WEEK}" value="${existing?.week ?? ''}">
              ${fieldErr('week')}
            </div>
            <div class="field span-2">
              <label for="fTitle">Title</label>
              <input id="fTitle" name="title" type="text" maxlength="160" required value="${existing?.title ?? ''}" placeholder="e.g. Lecture 4 — Derivatives">
              ${fieldErr('title')}
            </div>
          </div>
          <div class="field">
            <label for="fDesc">Description <span class="opt">(optional)</span></label>
            <textarea id="fDesc" name="description" rows="3" maxlength="2000" placeholder="What students should know about this file">${existing?.description ?? ''}</textarea>
            ${fieldErr('description')}
          </div>
        </fieldset>

        <fieldset>
          <legend>File</legend>
          <label class="drop" id="drop">
            <input type="file" id="fFile" name="file" accept="${accept.join(',')}" class="visually-hidden">
            ${icons.upload}
            <span class="drop-main" id="dropMain">${existing?.file ? `Current: ${fileLabel(existing.file)}` : 'Choose a file or drop it here'}</span>
            <span class="drop-sub">${accept.join(' ')} · up to ${maxMb} MB${existing?.file ? ' · choose a new file to replace it' : ''}</span>
          </label>
          ${fieldErr('file')}
          <div class="progress" id="progress" hidden><span class="progress-bar" id="progressBar"></span><span class="progress-text mono" id="progressText"></span></div>
        </fieldset>

        <div class="form-actions">
          <a class="btn btn-quiet" href="${existing ? `#/editor/uploads/${encodeURIComponent(existing.id)}` : '#/editor/uploads'}">Cancel</a>
          <button type="button" class="btn btn-ghost-dark" id="saveBtn">Save draft</button>
          <button type="submit" class="btn btn-primary" id="submitBtn">Submit for review</button>
        </div>
      </form>`),

    bind(root) {
      const form = root.querySelector('#upForm');
      const errBox = root.querySelector('#upError');
      const fileInput = root.querySelector('#fFile');
      const drop = root.querySelector('#drop');
      const progress = root.querySelector('#progress');
      let chosen = null;          // File picked in this visit (cleared once it's attached)
      let savedId = existing?.id || null;
      let busy = false;

      /* cascading selects */
      const fillSelect = (sel, options, current) => {
        const values = options.map(o => enc(o.value));
        const pick = values.includes(enc(current)) ? enc(current) : values[0];
        mount(sel, options.map(o => html`<option value="${enc(o.value)}" ${enc(o.value) === pick ? 'selected' : ''}>${o.label}</option>`));
        sel.disabled = options.length <= 1;
      };
      const syncGroups = (g = existing?.group, s = existing?.section) => {
        let list = opts.groupsFor(form.subjectId.value);
        if (!list.length) list = [{ value: g ?? null, label: g ?? 'All groups' }];
        fillSelect(form.group, list, g);
        syncSections(s);
      };
      const syncSections = s => {
        let list = opts.sectionsFor(form.subjectId.value, dec(form.group.value));
        if (!list.length) list = [{ value: s ?? null, label: s ?? 'All sections' }];
        fillSelect(form.section, list, s);
      };
      form.subjectId.addEventListener('change', () => syncGroups(null, null));
      form.group.addEventListener('change', () => syncSections(null));
      syncGroups();

      /* file picking + drag and drop */
      const setFile = f => {
        chosen = f || null;
        root.querySelector('#dropMain').textContent = chosen
          ? `${chosen.name} · ${formatBytes(chosen.size)}`
          : (existing?.file ? `Current: ${fileLabel(existing.file)}` : 'Choose a file or drop it here');
        drop.classList.toggle('has-file', Boolean(chosen));
        showFieldErrors({});
      };
      fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
      ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')));
      drop.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

      /* validation + saving */
      const read = () => ({
        subjectId: form.subjectId.value,
        group: dec(form.group.value),
        section: dec(form.section.value),
        contentType: form.contentType.value,
        week: form.week.value.trim(),
        title: form.title.value.trim(),
        description: form.description.value.trim(),
      });
      function showFieldErrors(errors) {
        root.querySelectorAll('[data-err]').forEach(el => {
          const msg = errors[el.dataset.err] || '';
          el.textContent = msg;
          el.hidden = !msg;
          el.closest('.field, fieldset')?.classList.toggle('invalid', Boolean(msg));
        });
        root.querySelector('.invalid input, .invalid select, .invalid textarea')?.focus();
      }
      const setBusy = on => {
        busy = on;
        form.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = on; });
        if (!on) [form.group, form.section].forEach(sel => { sel.disabled = sel.options.length <= 1; });
      };
      const onProgress = f => {
        progress.hidden = false;
        root.querySelector('#progressBar').style.width = `${Math.round(f * 100)}%`;
        root.querySelector('#progressText').textContent = f >= 1 ? 'Uploaded' : `Uploading… ${Math.round(f * 100)}%`;
      };

      async function save(values) {
        // Backend flow (in the adapter): save draft → upload file → save with storage path.
        let item;
        try {
          item = await api.editor.saveDraft({ id: savedId, values, file: chosen, onProgress });
        } catch (err) {
          if (err.contentItemId) savedId = err.contentItemId; // draft was created before the upload failed
          throw err;
        }
        savedId = item.id || savedId;
        chosen = null;
        return item;
      }

      async function go(submit) {
        if (busy) return;
        showFormError(errBox, '');
        const values = read();
        const check = validateSubmission({ ...values, file: chosen, existingFile: existing?.file }, { maxBytes, accept, requireFile: submit });
        showFieldErrors(check.errors);
        if (!check.ok) return;

        if (submit) {
          const { confirmed } = await confirmDialog({
            title: 'Submit for review?',
            body: html`<p>“${values.title}” will be sent to a content manager. You can’t edit it while it’s being reviewed.</p>`,
            confirmLabel: 'Submit for review',
            run: async () => { const item = await save(values); await api.editor.submit(item.id); },
          });
          if (!confirmed) return;
          toast('Submitted for review');
        } else {
          setBusy(true);
          try { await save(values); }
          catch (err) { setBusy(false); showFormError(errBox, err.message); errBox.scrollIntoView({ block: 'center' }); return; }
          setBusy(false);
          toast('Draft saved');
        }
        navigate(`/editor/uploads/${encodeURIComponent(savedId)}`);
      }

      root.querySelector('#saveBtn').addEventListener('click', () => go(false));
      form.addEventListener('submit', e => { e.preventDefault(); go(true); });
    },
  };
}
