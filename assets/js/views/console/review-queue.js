// Review queue (pending) and processed history. One view, two modes.

import { html, mount } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { SUBJECTS } from '../../data/catalog.js';
import { STATUSES, PROCESSED_STATUSES } from '../../services/content-workflow.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';

function makeView(mode) {
  const processed = mode === 'processed';
  return async function reviewList({ access, path, query }) {
    const state = {
      subject: SUBJECTS.some(s => s.id === query.subject) ? query.subject : '',
      status: processed && PROCESSED_STATUSES.includes(query.status) ? query.status : '',
    };
    return {
      title: processed ? 'Processed submissions' : 'Review queue',
      html: consoleShell({
        access, path,
        eyebrow: 'REVIEW DESK',
        title: processed ? 'Processed' : 'Review queue',
        lead: processed
          ? 'Everything that has been approved, rejected or published, newest first.'
          : 'Submissions waiting for a decision, oldest first. Open one to preview the file and approve or reject it.',
        body: html`
          <div class="toolbar">
            <label class="select-wrap"><span class="visually-hidden">Subject</span>
              <select id="rqSubject"><option value="">All subjects</option>
                ${SUBJECTS.map(s => html`<option value="${s.id}" ${s.id === state.subject ? 'selected' : ''}>${s.code} — ${s.name}</option>`)}
              </select></label>
            ${processed ? chips([{ value: '', label: 'All' }, ...PROCESSED_STATUSES.map(s => ({ value: s, label: STATUSES[s].label }))], state.status, { name: 'Filter by status' }) : ''}
            <p class="toolbar-count mono" id="rqCount" aria-live="polite"></p>
          </div>
          <div id="rqList"></div>
          <div class="load-more" id="rqMore"></div>`,
      }),
      bind(root) {
        const listEl = root.querySelector('#rqList');
        const moreEl = root.querySelector('#rqMore');
        const countEl = root.querySelector('#rqCount');
        let all = [];
        let cursor = null;
        const hrefFor = it => `#/review/${encodeURIComponent(it.id)}`;

        const syncUrl = () => {
          const p = new URLSearchParams();
          if (state.subject) p.set('subject', state.subject);
          if (state.status) p.set('status', state.status);
          history.replaceState(null, '', `#${processed ? '/review/processed' : '/review'}${p.toString() ? `?${p}` : ''}`);
        };

        // Filters apply to what's loaded; the backend may add server-side filters later.
        const draw = () => {
          const shown = all.filter(i => (!state.subject || i.subjectId === state.subject) && (!state.status || i.status === state.status));
          countEl.textContent = `${shown.length}${cursor ? '+' : ''} ${processed ? 'item' : 'pending'}${shown.length === 1 || !processed ? '' : 's'}`;
          mount(listEl, shown.length
            ? contentRows(shown, { hrefFor, show: ['submitter'] })
            : processed
              ? emptyState('Nothing processed yet', 'Approved, rejected and published items appear here.')
              : emptyState('All caught up', 'There are no submissions waiting for review.'));
          mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost" id="rqMoreBtn">Load more</button>` : '');
          moreEl.querySelector('#rqMoreBtn')?.addEventListener('click', () => load(true));
        };

        async function load(more = false) {
          if (more) {
            const btn = moreEl.querySelector('#rqMoreBtn');
            if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
          } else {
            mount(listEl, loadingState());
          }
          try {
            const page = await api.review.listQueue({ status: processed ? 'processed' : 'pending_review', cursor: more ? cursor : null });
            all = more ? [...all, ...page.items] : page.items;
            cursor = page.nextCursor;
            draw();
          } catch (err) {
            countEl.textContent = '';
            mount(more ? moreEl : listEl, workspaceErrorState(err, 'The review queue'));
            (more ? moreEl : listEl).querySelector('[data-action=retry]')?.addEventListener('click', () => load(more));
          }
        }

        root.querySelector('#rqSubject').addEventListener('change', e => { state.subject = e.target.value; syncUrl(); draw(); });
        root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
          state.status = btn.dataset.value;
          root.querySelectorAll('.chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
          syncUrl();
          draw();
        }));
        load();
      },
    };
  };
}

export const reviewQueue = makeView('pending');
export const reviewProcessed = makeView('processed');
