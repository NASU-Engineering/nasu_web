import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { sectionLabel, resourceList, announcementCard, subjectCard, emptyState } from '../ui/components.js';
import { workspacesFor } from '../services/roles.js';

const settle = p => p.then(value => ({ value }), error => ({ error }));
const panelError = err => html`<div class="state"><p class="state-text">${err.message}</p></div>`;

const WS_TEXT = {
  editor: { icon: 'upload', text: 'Upload lectures, sheets and assignments for your sections.' },
  review: { icon: 'inbox', text: 'Preview, approve or reject submissions from editors.' },
  admin: { icon: 'shield', text: 'Platform overview, team & roles, students and audit log.' },
};

// Future modules — links to "coming soon" pages, no data.
const EXPLORE = [
  { href: '#/quizzes', icon: 'quiz', label: 'Quizzes' },
  { href: '#/activities', icon: 'flag', label: 'Activities' },
  { href: '#/leaderboard', icon: 'trophy', label: 'Leaderboard' },
];

export default async function dashboard({ access }) {
  // The profile is required; the content panels may fail on their own.
  const [profile, subjects, recent, announcements] = await Promise.all([
    api.profile.getMine(),
    api.subjects.list(),
    settle(api.resources.recent(4)),
    settle(api.announcements.list({ limit: 3 })),
  ]);
  const firstName = profile.fullName.split(' ')[0] || 'there';
  const workspaces = workspacesFor(access?.roles || []);

  return {
    title: 'Dashboard',
    html: html`
      <div class="page-head">
        <p class="eyebrow mono">DASHBOARD</p>
        <h1 class="page-title" tabindex="-1">Hello, ${firstName}</h1>
      </div>

      <section class="profile-card" aria-label="Your details">
        <div class="profile-id">
          <span class="avatar">${icons.user}</span>
          <div>
            <p class="profile-name">${profile.fullName}</p>
            <p class="profile-sub">Prep-year engineering student</p>
          </div>
        </div>
        <dl class="profile-grid">
          <div><dt>Student ID</dt><dd class="mono">${profile.studentId}</dd></div>
          <div><dt>Group</dt><dd>${profile.group}</dd></div>
          <div><dt>Section</dt><dd>${profile.section}</dd></div>
        </dl>
      </section>

      ${workspaces.length ? html`
        <section aria-label="Your workspaces">
          ${sectionLabel('Your workspaces')}
          <div class="ws-grid">${workspaces.map(w => html`
            <a class="ws-card" href="#${w.home}">
              ${icons[WS_TEXT[w.id].icon]}
              <span class="ws-text"><strong>${w.label}</strong><span>${WS_TEXT[w.id].text}</span></span>
              ${icons.chevron}
            </a>`)}
          </div>
        </section>` : ''}

      <div class="dash-cols">
        <section>
          ${sectionLabel('Announcements', html`<a class="see-all" href="#/announcements">See all</a>`)}
          ${announcements.error ? panelError(announcements.error)
            : announcements.value.length
              ? html`<div class="ann-list">${announcements.value.map(a => announcementCard(a, { compact: true }))}</div>`
              : emptyState('No announcements yet')}
        </section>
        <section>
          ${sectionLabel('Recently added', html`<a class="see-all" href="#/search">Browse</a>`)}
          ${recent.error ? panelError(recent.error)
            : recent.value.length ? resourceList(recent.value, { showSubject: true }) : emptyState('Nothing added yet')}
        </section>
      </div>

      <section>
        ${sectionLabel('Your subjects', html`<a class="see-all" href="#/subjects">All subjects</a>`)}
        <div class="subj-grid">${subjects.map(subjectCard)}</div>
      </section>

      <section aria-label="Coming soon">
        ${sectionLabel('Coming soon')}
        <div class="explore">${EXPLORE.map(x => html`<a class="explore-item" href="${x.href}">${icons[x.icon]}<span>${x.label}</span><span class="badge">Soon</span></a>`)}</div>
      </section>`,
  };
}
