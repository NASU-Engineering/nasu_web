// Student Hub · Home. Student-only content: no staff links or shortcuts here
// (multi-role users switch workspace from the top bar).

import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { subjectById } from '../data/catalog.js';
import { sectionLabel, resourceList, updateFeed, subjectCard, emptyState } from '../ui/components.js';
import { t, formatNumber } from '../i18n/index.js';

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

/** Level / XP snapshot with the next quiz to take. Only rendered when the engagement backend answers. */
export function progressCard(p, nextQuiz) {
  const pct = Math.round(p.progress * 100);
  return html`
    <section class="progress-card" aria-label="${t('progress.title')}">
      <a class="pc-main" href="#/progress">
        <span class="pc-level"><span class="mono">${t('progress.levelShort', { level: p.level })}</span></span>
        <span class="pc-body">
          <span class="pc-xp">${t('progress.xpTotal', { xp: formatNumber(p.xp) })}</span>
          <span class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${t('progress.toNext', { level: p.level + 1 })}"><span style="width:${pct}%"></span></span>
          <span class="pc-meta">${t('progress.xpToNext', { xp: formatNumber(p.next - p.xp), level: p.level + 1 })}${p.ranks.section ? html` · ${t('progress.rankInSection', { rank: p.ranks.section })}` : ''}</span>
        </span>
      </a>
      ${nextQuiz ? html`
        <a class="pc-next" href="#/quizzes/${nextQuiz.id}">
          ${icons.quiz}<span><span class="pc-next-label">${t('progress.nextQuiz')}</span><span class="pc-next-title">${nextQuiz.title}</span><span class="pc-meta mono">${subjectById(nextQuiz.subjectId)?.code || ''}</span></span>${icons.chevron}
        </a>` : ''}
    </section>`;
}

export default async function dashboard() {
  // The profile is required; the panels may fail (or not be live) on their own.
  const [profile, subjects, updates, assignments, progress, quizzes] = await Promise.all([
    api.profile.getMine(),
    api.subjects.list(),
    settle(api.announcements.list({ limit: 3 })),
    settle(api.resources.search({ category: 'assignment' })),
    settle(api.engage.progress()),
    settle(api.engage.quizzes()),
  ]);
  const firstName = profile.fullName.split(' ')[0] || t('home.there');
  const context = [profile.group, profile.section].filter(known);
  const deadlines = assignments.error ? [] : upcomingDeadlines(assignments.value);
  const nextQuiz = quizzes.error ? null : quizzes.value.find(q => q.status === 'open' && q.canAttempt === 'ok');

  return {
    title: t('nav.home'),
    html: html`
      <div class="page-head dash-head">
        <h1 class="page-title" tabindex="-1">${t('home.hello', { name: firstName })}</h1>
        ${context.length ? html`<p class="dash-context">${context.map((c, i) => html`${i ? html`<span class="dot" aria-hidden="true">·</span>` : ''}<span>${c}</span>`)}</p>` : ''}
      </div>

      ${progress.error ? '' : progressCard(progress.value, nextQuiz)}

      ${deadlines.length ? html`
        <section aria-labelledby="dashDeadlines">
          <h2 class="section-label" id="dashDeadlines"><span>${t('home.deadlines')}</span><span class="ln"></span><a class="see-all" href="#/assignments">${t('home.allAssignments')}</a></h2>
          ${resourceList(deadlines, { showSubject: true })}
        </section>` : ''}

      <section aria-labelledby="dashSubjects">
        <h2 class="section-label" id="dashSubjects"><span>${t('home.subjects')}</span><span class="ln"></span><a class="see-all" href="#/subjects">${t('subjects.all')}</a></h2>
        <div class="subj-grid subj-grid-compact">${subjects.map(subjectCard)}</div>
      </section>

      <section>
        ${sectionLabel(t('home.latestUpdates'), html`<a class="see-all" href="#/announcements">${t('home.allUpdates')}</a>`)}
        ${updates.error ? panelError(updates.error)
          : updates.value.length ? updateFeed(updates.value, { level: 3 }) : emptyState(t('updates.emptyTitle'))}
      </section>`,
  };
}
