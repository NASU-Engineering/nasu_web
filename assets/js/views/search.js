import { html, mount } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { SUBJECTS, CATEGORIES } from '../data/catalog.js';
import { pageHead, resourceList, chips, emptyState, errorState, loadingState } from '../ui/components.js';

export default async function search({ query }) {
  const state = {
    q: query.q || '',
    subject: SUBJECTS.some(s => s.id === query.subject) ? query.subject : '',
    cat: CATEGORIES.some(c => c.id === query.cat) ? query.cat : '',
  };
  const catItems = [{ value: '', label: 'All types' }, ...CATEGORIES.map(c => ({ value: c.id, label: c.label }))];

  return {
    title: state.q ? `Search: ${state.q}` : 'Search',
    html: html`
      ${pageHead({ eyebrow: 'ALL SUBJECTS', title: 'Search' })}
      <form class="search-panel" role="search" id="searchForm">
        <div class="search-box">
          ${icons.search}
          <input type="search" name="q" id="q" value="${state.q}" placeholder="Try “sheet 1”, “statics” or “BSC111”" aria-label="Search resources" autocomplete="off" enterkeyhint="search">
        </div>
        <div class="search-filters">
          <label class="select-wrap">
            <span class="visually-hidden">Subject</span>
            <select name="subject" id="subjectFilter">
              <option value="">All subjects</option>
              ${SUBJECTS.map(s => html`<option value="${s.id}" ${s.id === state.subject ? 'selected' : ''}>${s.code} — ${s.name}</option>`)}
            </select>
          </label>
          ${chips(catItems, state.cat, { name: 'Filter by type' })}
        </div>
      </form>
      <p class="result-count" id="resultCount" aria-live="polite"></p>
      <div id="results"></div>`,
    bind(root) {
      const form = root.querySelector('#searchForm');
      const results = root.querySelector('#results');
      const countEl = root.querySelector('#resultCount');
      let seq = 0;

      const syncUrl = () => {
        const p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.subject) p.set('subject', state.subject);
        if (state.cat) p.set('cat', state.cat);
        const qs = p.toString();
        history.replaceState(null, '', `#/search${qs ? `?${qs}` : ''}`);
      };

      const run = async () => {
        const mine = ++seq;
        syncUrl();
        mount(results, loadingState('Searching…'));
        try {
          const items = await api.resources.search({ query: state.q, subjectId: state.subject, category: state.cat });
          if (mine !== seq) return;
          const filtered = state.q || state.subject || state.cat;
          countEl.textContent = filtered ? `${items.length} result${items.length === 1 ? '' : 's'}${state.q ? ` for “${state.q}”` : ''}` : `All resources (${items.length})`;
          mount(results, items.length
            ? resourceList(items, { showSubject: true })
            : emptyState('No matches', 'Try a different word, or clear the filters.'));
        } catch (err) {
          if (mine !== seq) return;
          countEl.textContent = '';
          mount(results, errorState(err));
          results.querySelector('[data-action=retry]')?.addEventListener('click', run);
        }
      };

      let t;
      form.q.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { state.q = form.q.value.trim(); run(); }, 200);
      });
      form.addEventListener('submit', e => {
        e.preventDefault();
        clearTimeout(t);
        state.q = form.q.value.trim();
        form.q.blur(); // closes the phone keyboard
        run();
      });
      form.subject.addEventListener('change', () => { state.subject = form.subject.value; run(); });
      root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
        state.cat = btn.dataset.value;
        root.querySelectorAll('.chip').forEach(b => {
          b.classList.toggle('on', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        run();
      }));

      if (!state.q && matchMedia('(min-width: 720px)').matches) form.q.focus();
      run();
    },
  };
}
