// Assignments across every subject: upcoming first, then past.
// Uses the existing resources service (category 'assignment').

import { html } from '../ui/html.js';
import { api } from '../services/api.js';
import { pageHead, sectionLabel, resourceList, emptyState } from '../ui/components.js';
import { pad2 } from '../ui/format.js';

export default async function assignments() {
  const all = await api.resources.search({ category: 'assignment' });
  const now = Date.now();
  const due = r => (r.dueAt ? new Date(r.dueAt).getTime() : NaN);
  const upcoming = all.filter(r => !(due(r) < now)).sort((a, b) => (due(a) || Infinity) - (due(b) || Infinity));
  const past = all.filter(r => due(r) < now).sort((a, b) => due(b) - due(a));

  return {
    title: 'Assignments',
    html: html`
      ${pageHead({ eyebrow: 'ALL SUBJECTS', title: 'Assignments', lead: 'Every assignment from your subjects, soonest deadline first.' })}
      ${all.length ? html`
        <section>
          ${sectionLabel('Upcoming', html`<span class="mono count">${pad2(upcoming.length)}</span>`)}
          ${upcoming.length ? resourceList(upcoming, { showSubject: true }) : emptyState('Nothing due', 'You’re all caught up.')}
        </section>
        ${past.length ? html`
          <section>
            ${sectionLabel('Past deadlines', html`<span class="mono count">${pad2(past.length)}</span>`)}
            ${resourceList(past, { showSubject: true })}
          </section>` : ''}`
        : emptyState('No assignments yet', 'Assignments appear here as soon as your course teams publish them.')}`,
  };
}
