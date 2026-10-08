// Student Hub · Learn: the academic hub. Groups Subjects, Resources (search),
// Assignments and resource types behind one destination instead of separate tabs.

import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { CATEGORIES } from '../data/catalog.js';
import { pageHead, sectionLabel, resourceList, subjectCard, emptyState } from '../ui/components.js';
import { upcomingDeadlines } from './dashboard.js';
import { t } from '../i18n/index.js';

const settle = p => p.then(value => ({ value }), error => ({ error }));

export default async function learn({ navigate }) {
  const [subjects, recent, assignments] = await Promise.all([
    api.subjects.list(),
    settle(api.resources.recent(4)),
    settle(api.resources.search({ category: 'assignment' })),
  ]);
  const due = assignments.error ? [] : upcomingDeadlines(assignments.value, { limit: 99 });

  return {
    title: t('nav.learn'),
    html: html`
      ${pageHead({ title: t('nav.learn'), lead: t('learn.lead') })}

      <form class="search-box learn-search" role="search" id="learnSearch">
        ${icons.search}
        <input type="search" name="q" placeholder="${t('search.placeholder')}" aria-label="${t('search.label')}" autocomplete="off" enterkeyhint="search">
      </form>

      <div class="shortcut-grid">
        <a class="shortcut" href="#/subjects">${icons.book}<span><strong>${t('subjects.title')}</strong><span>${t('learn.subjectsCount', { count: subjects.length })}</span></span>${icons.chevron}</a>
        <a class="shortcut" href="#/assignments">${icons.assignment}<span><strong>${t('assignments.title')}</strong><span>${due.length ? t('learn.dueCount', { count: due.length }) : t('assignments.nothingDue')}</span></span>${icons.chevron}</a>
        <a class="shortcut" href="#/resources">${icons.search}<span><strong>${t('learn.resources')}</strong><span>${t('learn.resourcesText')}</span></span>${icons.chevron}</a>
      </div>

      <nav class="type-links" aria-label="${t('filter.byType')}">
        ${CATEGORIES.filter(c => c.id !== 'assignment').map(c => html`<a class="chip" href="#/resources?cat=${c.id}">${icons[c.id]}<span>${c.label}</span></a>`)}
      </nav>

      <section aria-labelledby="learnSubjects">
        <h2 class="section-label" id="learnSubjects"><span>${t('home.subjects')}</span><span class="ln"></span></h2>
        <div class="subj-grid subj-grid-compact">${subjects.map(subjectCard)}</div>
      </section>

      <section>
        ${sectionLabel(t('learn.recent'), html`<a class="see-all" href="#/resources">${t('learn.browse')}</a>`)}
        ${recent.error ? html`<div class="state"><p class="state-text">${recent.error.message}</p></div>`
          : recent.value.length ? resourceList(recent.value, { showSubject: true }) : emptyState(t('learn.nothingYet'))}
      </section>`,
    bind(root) {
      const form = root.querySelector('#learnSearch');
      form.addEventListener('submit', e => {
        e.preventDefault();
        const q = form.q.value.trim();
        navigate('/resources' + (q ? `?q=${encodeURIComponent(q)}` : ''));
      });
    },
  };
}
