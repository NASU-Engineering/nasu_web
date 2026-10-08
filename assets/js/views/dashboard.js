// Student Hub · Home. Student-only content: no staff links or shortcuts here
// (multi-role users switch workspace from the top bar).

import { html } from '../ui/html.js';
import { api } from '../services/api.js';
import { sectionLabel, resourceList, updateFeed, subjectCard, emptyState } from '../ui/components.js';

const settle = p => p.then(value => ({ value }), error => ({ error }));
const panelError = err => html`<div class="state"><p class="state-text">${err.message}</p></div>`;
const known = v => v && v !== '—';

/** Assignments still open, soonest deadline first. */
export function upcomingDeadlines(assignments, { now = Date.now(), limit = 3 } = {}) {
  return (assignments || [])
    .filter(a => a.dueAt && new Date(a.dueAt).getTime() >= now)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, limit);
}

export default async function dashboard() {
  // The profile is required; the content panels may fail on their own.
  const [profile, subjects, recent, updates, assignments] = await Promise.all([
    api.profile.getMine(),
    api.subjects.list(),
    settle(api.resources.recent(4)),
    settle(api.announcements.list({ limit: 3 })),
    settle(api.resources.search({ category: 'assignment' })),
  ]);
  const firstName = profile.fullName.split(' ')[0] || 'there';
  const context = [profile.group, profile.section].filter(known);
  const deadlines = assignments.error ? [] : upcomingDeadlines(assignments.value);

  return {
    title: 'Home',
    html: html`
      <div class="page-head dash-head">
        <h1 class="page-title" tabindex="-1">Hello, ${firstName}</h1>
        ${context.length ? html`<p class="dash-context">${context.map((c, i) => html`${i ? html`<span class="dot" aria-hidden="true">·</span>` : ''}<span>${c}</span>`)}</p>` : ''}
      </div>

      <section aria-labelledby="dashSubjects">
        <h2 class="section-label" id="dashSubjects"><span>Your subjects</span><span class="ln"></span><a class="see-all" href="#/subjects">All subjects</a></h2>
        <div class="subj-grid subj-grid-compact">${subjects.map(subjectCard)}</div>
      </section>

      ${deadlines.length ? html`
        <section aria-labelledby="dashDeadlines">
          <h2 class="section-label" id="dashDeadlines"><span>Upcoming deadlines</span><span class="ln"></span><a class="see-all" href="#/assignments">All assignments</a></h2>
          ${resourceList(deadlines, { showSubject: true })}
        </section>` : ''}

      <div class="dash-cols">
        <section>
          ${sectionLabel('Latest updates', html`<a class="see-all" href="#/announcements">All updates</a>`)}
          ${updates.error ? panelError(updates.error)
            : updates.value.length ? updateFeed(updates.value, { level: 3 }) : emptyState('No updates yet')}
        </section>
        <section>
          ${sectionLabel('Recently added', html`<a class="see-all" href="#/resources">Search</a>`)}
          ${recent.error ? panelError(recent.error)
            : recent.value.length ? resourceList(recent.value, { showSubject: true }) : emptyState('Nothing added yet')}
        </section>
      </div>`,
  };
}
