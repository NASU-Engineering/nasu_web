// Assignments across every subject: upcoming first, then past.
// Uses the existing resources service (category 'assignment').

import { html } from '../ui/html.js';
import { api } from '../services/api.js';
import { pageHead, sectionLabel, resourceList, emptyState } from '../ui/components.js';
import { pad2 } from '../ui/format.js';
import { t } from '../i18n/index.js';

export default async function assignments() {
  const all = await api.resources.search({ category: 'assignment' });
  const now = Date.now();
  const due = r => (r.dueAt ? new Date(r.dueAt).getTime() : NaN);
  const upcoming = all.filter(r => !(due(r) < now)).sort((a, b) => (due(a) || Infinity) - (due(b) || Infinity));
  const past = all.filter(r => due(r) < now).sort((a, b) => due(b) - due(a));

  return {
    title: t('assignments.title'),
    html: html`
      ${pageHead({ back: { href: '#/learn', label: t('nav.learn') }, title: t('assignments.title'), lead: t('assignments.lead') })}
      ${all.length ? html`
        <section>
          ${sectionLabel(t('assignments.upcoming'), html`<span class="mono count">${pad2(upcoming.length)}</span>`)}
          ${upcoming.length ? resourceList(upcoming, { showSubject: true }) : emptyState(t('assignments.nothingDue'), t('assignments.caughtUp'))}
        </section>
        ${past.length ? html`
          <section>
            ${sectionLabel(t('assignments.past'), html`<span class="mono count">${pad2(past.length)}</span>`)}
            ${resourceList(past, { showSubject: true })}
          </section>` : ''}`
        : emptyState(t('assignments.emptyTitle'), t('assignments.emptyText'))}`,
  };
}
