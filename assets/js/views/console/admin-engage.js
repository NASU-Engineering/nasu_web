// Admin · Content · Quizzes / Activities and Admin · Insights · Engagement.
// No engagement backend exists yet: on the real backend these pages say
// "not live"; on the mock backend they show the sample data (labelled).
// Authoring tools come with the backend — nothing here writes data.

import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { subjectById } from '../../data/catalog.js';
import { consoleShell, statTile, panel, notLiveState } from '../../ui/console.js';
import { emptyState } from '../../ui/components.js';
import { shortDate, eventDateTime, pad2 } from '../../ui/format.js';
import { t, formatNumber } from '../../i18n/index.js';

async function guarded(load) {
  try { return { value: await load() }; } catch (err) {
    if (err.code === 'backend_required') return { notLive: true };
    throw err;
  }
}

const sampleNote = () => html`<p class="notice">${icons.alert}<span>${t('engage.sampleNote')}</span></p>`;

export async function adminQuizzes({ access, path }) {
  const r = await guarded(() => api.engage.adminQuizzes());
  const body = r.notLive ? notLiveState(t('nav.quizzes')) : html`
    ${sampleNote()}
    ${r.value.length ? html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">${t('field.title')}</th><th scope="col">${t('field.subject')}</th><th scope="col">${t('field.week')}</th><th scope="col">${t('quiz.questionsCol')}</th><th scope="col">${t('quiz.attemptsCol')}</th><th scope="col">${t('quiz.windowCol')}</th><th scope="col">${t('analytics.status')}</th></tr></thead>
        <tbody>${r.value.map(q => html`
          <tr>
            <td data-label="${t('field.title')}"><strong>${q.title}</strong></td>
            <td data-label="${t('field.subject')}" class="mono">${subjectById(q.subjectId)?.code || q.subjectId}</td>
            <td data-label="${t('field.week')}" class="mono">${pad2(q.week)}</td>
            <td data-label="${t('quiz.questionsCol')}" class="mono">${q.questionCount}</td>
            <td data-label="${t('quiz.attemptsCol')}" class="mono">${q.maxAttempts}</td>
            <td data-label="${t('quiz.windowCol')}">${shortDate(q.opensAt)} – ${shortDate(q.closesAt)}</td>
            <td data-label="${t('analytics.status')}">${t(`quiz.status.${q.status}`)}</td>
          </tr>`)}</tbody>
      </table></div>` : emptyState(t('quiz.none'))}
    <p class="muted">${t('engage.authoringNote')}</p>`;
  return { title: t('nav.quizzes'), html: consoleShell({ access, path, eyebrow: t('experience.admin'), title: t('nav.content'), lead: t('engage.quizzesLead'), body }) };
}

export async function adminActivities({ access, path }) {
  const r = await guarded(() => api.engage.adminActivities());
  const body = r.notLive ? notLiveState(t('nav.activities')) : html`
    ${sampleNote()}
    ${r.value.length ? html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">${t('field.title')}</th><th scope="col">${t('activity.kindCol')}</th><th scope="col">${t('activity.whenCol')}</th><th scope="col">${t('activity.participantsCol')}</th><th scope="col">XP</th></tr></thead>
        <tbody>${r.value.map(a => html`
          <tr>
            <td data-label="${t('field.title')}"><strong>${a.title}</strong></td>
            <td data-label="${t('activity.kindCol')}">${t(`activity.kind.${a.kind}`)}</td>
            <td data-label="${t('activity.whenCol')}">${eventDateTime(a.startsAt)}</td>
            <td data-label="${t('activity.participantsCol')}" class="mono">${a.participants}/${a.capacity}</td>
            <td data-label="XP" class="mono">+${a.xp}</td>
          </tr>`)}</tbody>
      </table></div>` : emptyState(t('activity.noneUpcoming'))}
    <p class="muted">${t('engage.attendanceNote')}</p>`;
  return { title: t('nav.activities'), html: consoleShell({ access, path, eyebrow: t('experience.admin'), title: t('nav.content'), lead: t('engage.activitiesLead'), body }) };
}

export async function adminEngagement({ access, path }) {
  const r = await guarded(() => api.engage.adminStats());
  const body = r.notLive ? notLiveState(t('nav.engagement')) : html`
    ${sampleNote()}
    <div class="stat-grid">
      ${statTile({ label: t('engage.studentsWithXp'), value: r.value.students_with_xp, icon: 'users' })}
      ${statTile({ label: t('engage.xpTotal'), value: formatNumber(r.value.xp_total), icon: 'star' })}
      ${statTile({ label: t('engage.quizAttempts'), value: r.value.quiz_attempts, icon: 'quiz' })}
      ${statTile({ label: t('engage.participants'), value: r.value.activity_participants, icon: 'flag' })}
    </div>
    ${panel(t('engage.topStudents'), html`
      <ol class="board">${r.value.top.map(p => html`
        <li><span class="board-rank mono">${p.rank}</span><span class="board-name">${p.name}</span><span class="board-level mono">${t('progress.levelShort', { level: p.level })}</span><span class="board-xp mono">${formatNumber(p.xp)} XP</span></li>`)}</ol>`)}
    <p class="muted">${t('engage.designNote')}</p>`;
  return { title: t('nav.engagement'), html: consoleShell({ access, path, eyebrow: t('experience.admin'), title: t('nav.insights'), lead: t('engage.lead'), body }) };
}
