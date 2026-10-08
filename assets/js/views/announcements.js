// Updates (route kept at /announcements). A compact chronological feed; the
// Hub is the source of truth and WhatsApp will only link back here.

import { html, mount } from '../ui/html.js';
import { api } from '../services/api.js';
import { SUBJECTS } from '../data/catalog.js';
import { UPDATE_FILTERS, sortUpdates, filterUpdates } from '../services/updates.js';
import { pageHead, updateFeed, chips, emptyState, focusLinkedItem } from '../ui/components.js';
import { t } from '../i18n/index.js';

export default async function announcements({ query }) {
  const all = sortUpdates(await api.announcements.list());
  const state = {
    kind: UPDATE_FILTERS.some(f => f.value === query.kind) ? query.kind : '',
    subjectId: SUBJECTS.some(s => s.id === query.subject) ? query.subject : '',
  };

  const body = () => {
    const items = filterUpdates(all, state);
    return items.length
      ? updateFeed(items)
      : emptyState(t('updates.emptyTitle'), state.kind || state.subjectId ? t('common.tryAnotherFilter') : t('updates.emptyText'));
  };

  return {
    title: t('updates.title'),
    html: html`
      ${pageHead({ title: t('updates.title') })}
      <div class="sticky-filters upd-filters">
        ${chips(UPDATE_FILTERS, state.kind, { name: t('filter.byType') })}
        <label class="select-wrap upd-subject">
          <span class="visually-hidden">${t('field.subject')}</span>
          <select id="updSubject">
            <option value="">${t('filter.allSubjects')}</option>
            ${SUBJECTS.map(s => html`<option value="${s.id}" ${s.id === state.subjectId ? 'selected' : ''}>${s.code} — ${s.name}</option>`)}
          </select>
        </label>
      </div>
      <div id="updBody">${body()}</div>`,
    bind(root) {
      const bodyEl = root.querySelector('#updBody');
      focusLinkedItem(root, query.item); // deep link: #/announcements?item=<id>

      const apply = () => {
        const p = new URLSearchParams();
        if (state.kind) p.set('kind', state.kind);
        if (state.subjectId) p.set('subject', state.subjectId);
        history.replaceState(null, '', `#/announcements${p.toString() ? `?${p}` : ''}`);
        mount(bodyEl, body());
      };
      root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
        state.kind = btn.dataset.value;
        root.querySelectorAll('.chip').forEach(b => {
          b.classList.toggle('on', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        apply();
      }));
      root.querySelector('#updSubject').addEventListener('change', e => { state.subjectId = e.target.value; apply(); });
    },
  };
}
