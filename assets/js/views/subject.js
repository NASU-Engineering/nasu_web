import { html, mount } from '../ui/html.js';
import { api } from '../services/api.js';
import { SUBJECTS, CATEGORIES } from '../data/catalog.js';
import { pageHead, sectionLabel, resourceList, chips, emptyState, focusLinkedItem } from '../ui/components.js';
import { pad2 } from '../ui/format.js';

export default async function subject({ params, query }) {
  const [s, resources] = await Promise.all([
    api.subjects.get(params.id),
    api.resources.listBySubject(params.id),
  ]);

  const counts = Object.fromEntries(CATEGORIES.map(c => [c.id, resources.filter(r => r.category === c.id).length]));
  const chipItems = [
    { value: '', label: 'All', count: resources.length },
    ...CATEGORIES.map(c => ({ value: c.id, label: c.label, count: counts[c.id] })),
  ];

  const body = active => {
    const cats = active ? CATEGORIES.filter(c => c.id === active) : CATEGORIES;
    if (!resources.length) return emptyState('Nothing here yet', 'Material for this subject will appear here as soon as it’s added.');
    return cats.map(c => {
      const items = resources.filter(r => r.category === c.id);
      return html`
        <section class="cat-section" id="cat-${c.id}">
          ${sectionLabel(c.label, html`<span class="mono count">${pad2(items.length)}</span>`)}
          ${items.length ? resourceList(items) : emptyState(`No ${c.label.toLowerCase()} yet`)}
        </section>`;
    });
  };

  const initial = CATEGORIES.some(c => c.id === query.cat) ? query.cat : '';

  return {
    title: s.name,
    html: html`
      <nav class="subj-tabs" aria-label="Subjects">
        ${SUBJECTS.map((x, i) => html`<a href="#/subjects/${x.id}" class="${x.id === s.id ? 'active' : ''}" ${x.id === s.id ? html`aria-current="page"` : ''}><span class="mono">${pad2(i + 1)}</span>${x.name}</a>`)}
      </nav>
      ${pageHead({ title: s.name, code: s.code, back: { href: '#/subjects', label: 'All subjects' } })}
      <div class="sticky-filters">${chips(chipItems, initial, { name: 'Filter by type' })}</div>
      <div id="subjectBody">${body(initial)}</div>`,
    bind(root) {
      // Keep the active subject tab visible on narrow screens.
      root.querySelector('.subj-tabs .active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
      focusLinkedItem(root, query.item); // deep link: #/subjects/:id?item=<resource id>
      const bodyEl = root.querySelector('#subjectBody');
      root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        root.querySelectorAll('.chip').forEach(b => {
          b.classList.toggle('on', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        mount(bodyEl, body(value));
        history.replaceState(null, '', `#/subjects/${s.id}${value ? `?cat=${value}` : ''}`);
      }));
    },
  };
}
