// Review lists: the pending queue (oldest first) and History (decided items,
// filtered by Approved · Rejected · Published). One view, used by the Review
// Desk and by Admin → Content → Review queue (which stays in the Admin shell).

import { html, mount } from '../../ui/html.js';
import { api } from '../../services/api.js';
import { SUBJECTS } from '../../data/catalog.js';
import { STATUSES, PROCESSED_STATUSES } from '../../services/content-workflow.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { contentRows } from '../../ui/workflow.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';
import { t } from '../../i18n/index.js';

function makeView({ processed, route, itemBase, admin = false }) {
  return async function reviewList({ access, path, query }) {
    const state = {
      subject: SUBJECTS.some(s => s.id === query.subject) ? query.subject : '',
      status: processed && PROCESSED_STATUSES.includes(query.status) ? query.status : '',
    };
    const title = processed ? t('nav.reviewHistory') : t('nav.reviewQueue');
    return {
      title,
      html: consoleShell({
        access, path,
        eyebrow: admin ? t('experience.admin') : t('experience.review'),
        title: admin ? t('nav.content') : title,
        lead: processed ? t('review.historyLead') : t('review.queueLead'),
        body: html`
          <div class="toolbar">
            <label class="select-wrap"><span class="visually-hidden">${t('field.subject')}</span>
              <select id="rqSubject"><option value="">${t('filter.allSubjects')}</option>
                ${SUBJECTS.map(s => html`<option value="${s.id}" ${s.id === state.subject ? 'selected' : ''}>${s.code} — ${s.name}</option>`)}
              </select></label>
            ${processed ? chips([{ value: '', label: t('common.all') }, ...PROCESSED_STATUSES.map(s => ({ value: s, label: STATUSES[s].label }))], state.status, { name: t('filter.byStatus') }) : ''}
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
        const hrefFor = it => `#${itemBase}/${encodeURIComponent(it.id)}`;

        const syncUrl = () => {
          const p = new URLSearchParams();
          if (state.subject) p.set('subject', state.subject);
          if (state.status) p.set('status', state.status);
          history.replaceState(null, '', `#${route}${p.toString() ? `?${p}` : ''}`);
        };

        // Filters apply to what's loaded; the backend may add server-side filters later.
        const draw = () => {
          const shown = all.filter(i => (!state.subject || i.subjectId === state.subject) && (!state.status || i.status === state.status));
          countEl.textContent = processed ? t('review.itemsCount', { count: shown.length }) : t('review.pendingCount', { count: shown.length });
          mount(listEl, shown.length
            ? contentRows(shown, { hrefFor, show: ['submitter'] })
            : processed ? emptyState(t('review.historyEmpty'), t('review.historyEmptyText'))
              : emptyState(t('review.caughtUp'), t('review.caughtUpText')));
          mount(moreEl, cursor ? html`<button type="button" class="btn btn-ghost" id="rqMoreBtn">${t('common.loadMore')}</button>` : '');
          moreEl.querySelector('#rqMoreBtn')?.addEventListener('click', () => load(true));
        };

        async function load(more = false) {
          if (more) {
            const btn = moreEl.querySelector('#rqMoreBtn');
            if (btn) { btn.disabled = true; btn.textContent = t('common.loading'); }
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
            mount(more ? moreEl : listEl, workspaceErrorState(err));
            (more ? moreEl : listEl).querySelector('[data-action=retry]')?.addEventListener('click', () => load(more));
          }
        }

        root.querySelector('#rqSubject').addEventListener('change', e => { state.subject = e.target.value; syncUrl(); draw(); });
        root.querySelectorAll('.toolbar .chip').forEach(btn => btn.addEventListener('click', () => {
          state.status = btn.dataset.value;
          root.querySelectorAll('.toolbar .chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
          syncUrl();
          draw();
        }));
        load();
      },
    };
  };
}

export const reviewQueue = makeView({ processed: false, route: '/review', itemBase: '/review' });
export const reviewHistory = makeView({ processed: true, route: '/review/history', itemBase: '/review' });
export const adminReviewQueue = makeView({ processed: false, route: '/admin/content/review', itemBase: '/admin/content', admin: true });
