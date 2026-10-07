import { html, mount } from '../ui/html.js';
import { api } from '../services/api.js';
import { SUBJECTS } from '../data/catalog.js';
import { pageHead, announcementCard, chips, emptyState } from '../ui/components.js';

export default async function announcements() {
  const all = await api.announcements.list();
  const chipItems = [
    { value: '', label: 'All' },
    { value: 'general', label: 'General' },
    ...SUBJECTS.map(s => ({ value: s.id, label: s.code })),
  ];

  const list = filter => {
    const items = all.filter(a => !filter || (filter === 'general' ? !a.subjectId : a.subjectId === filter));
    return items.length
      ? html`<div class="ann-list">${items.map(a => announcementCard(a))}</div>`
      : emptyState('No announcements here', 'Check back later or pick another filter.');
  };

  return {
    title: 'Announcements',
    html: html`
      ${pageHead({ eyebrow: 'NEWS', title: 'Announcements', lead: 'Updates from the prep-year office and your course teams.' })}
      <div class="sticky-filters">${chips(chipItems, '', { name: 'Filter announcements' })}</div>
      <div id="annBody">${list('')}</div>`,
    bind(root) {
      const bodyEl = root.querySelector('#annBody');
      root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
        root.querySelectorAll('.chip').forEach(b => {
          b.classList.toggle('on', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        mount(bodyEl, list(btn.dataset.value));
      }));
    },
  };
}
