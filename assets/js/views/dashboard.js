import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { sectionLabel, resourceList, updateFeed, subjectCard, emptyState } from '../ui/components.js';
import { workspacesFor } from '../services/roles.js';

const settle = p => p.then(value => ({ value }), error => ({ error }));
const panelError = err => html`<div class="state"><p class="state-text">${err.message}</p></div>`;

const WS_ICON = { editor: 'upload', review: 'inbox', admin: 'shield' };
const known = v => v && v !== '—';

export default async function dashboard({ access }) {
  // The profile is required; the content panels may fail on their own.
  const [profile, subjects, recent, announcements] = await Promise.all([
    api.profile.getMine(),
    api.subjects.list(),
    settle(api.resources.recent(4)),
    settle(api.announcements.list({ limit: 3 })),
  ]);
  const firstName = profile.fullName.split(' ')[0] || 'there';
  const workspaces = workspacesFor(access?.roles || []); // role-gated (UX only)
  const context = [profile.group, profile.section].filter(known);

  return {
    title: 'Dashboard',
    html: html`
      <div class="page-head dash-head">
        <h1 class="page-title" tabindex="-1">Hello, ${firstName}</h1>
        <p class="dash-context">
          ${context.map(c => html`<span>${c}</span><span class="dot" aria-hidden="true">·</span>`)}<a href="#/profile">Profile</a>
        </p>
        ${workspaces.length ? html`
          <nav class="ws-chips" aria-label="Your workspaces">
            ${workspaces.map(w => html`<a class="ws-chip" href="#${w.home}">${icons[WS_ICON[w.id]]}<span>${w.label}</span></a>`)}
          </nav>` : ''}
      </div>

      <section aria-labelledby="dashSubjects">
        <h2 class="section-label" id="dashSubjects"><span>Your subjects</span><span class="ln"></span><a class="see-all" href="#/subjects">All subjects</a></h2>
        <div class="subj-grid subj-grid-compact">${subjects.map(subjectCard)}</div>
      </section>

      <div class="dash-cols">
        <section>
          ${sectionLabel('Latest updates', html`<a class="see-all" href="#/announcements">All updates</a>`)}
          ${announcements.error ? panelError(announcements.error)
            : announcements.value.length
              ? updateFeed(announcements.value, { level: 3 })
              : emptyState('No updates yet')}
        </section>
        <section>
          ${sectionLabel('Recently added', html`<a class="see-all" href="#/resources">Browse</a>`)}
          ${recent.error ? panelError(recent.error)
            : recent.value.length ? resourceList(recent.value, { showSubject: true }) : emptyState('Nothing added yet')}
        </section>
      </div>`,
  };
}
