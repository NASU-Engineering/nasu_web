// Student Hub · Progress: XP, level, ranks and the way into Quizzes,
// Activities and the Leaderboard. When the engagement backend isn't live
// (production today) the page says so instead of showing anything invented.

import { html, mount } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { XP_RULES, DAILY_XP_CAP } from '../services/xp.js';
import { pageHead, sectionLabel, chips, emptyState, loadingState, errorState } from '../ui/components.js';
import { notLiveState } from '../ui/console.js';
import { dateTime } from '../ui/format.js';
import { t, formatNumber } from '../i18n/index.js';

/** Runs `load`; a 'backend_required' answer becomes a "not live yet" page. */
export async function orNotLive(load) {
  try { return await load(); } catch (err) {
    if (err.code !== 'backend_required') throw err;
    return { __notLive: true };
  }
}
export const notLivePage = (title, feature, back) => ({
  title,
  html: html`${pageHead({ title, back })}${notLiveState(feature)}`,
});

const XP_SOURCE = { quiz_completed: 'xp.source.quizCompleted', quiz_score: 'xp.source.quizScore', activity_completed: 'xp.source.activity' };

export async function progressView() {
  const p = await orNotLive(() => api.engage.progress());
  if (p.__notLive) return notLivePage(t('progress.title'), t('progress.title'));
  const pct = Math.round(p.progress * 100);
  const rank = (label, n) => html`<div class="rank"><span class="rank-n mono">${n ? `#${n}` : '—'}</span><span class="rank-label">${label}</span></div>`;

  return {
    title: t('progress.title'),
    html: html`
      ${pageHead({ title: t('progress.title') })}
      <section class="level-card" aria-label="${t('progress.level')}">
        <div class="level-badge"><span class="level-n mono">${p.level}</span><span class="level-word">${t('progress.level')}</span></div>
        <div class="level-body">
          <p class="level-xp">${t('progress.xpTotal', { xp: formatNumber(p.xp) })}</p>
          <span class="meter meter-lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${t('progress.toNext', { level: p.level + 1 })}"><span style="width:${pct}%"></span></span>
          <p class="level-meta">${t('progress.xpToNext', { xp: formatNumber(p.next - p.xp), level: p.level + 1 })}</p>
        </div>
        <div class="ranks">
          ${rank(t('leaderboard.scope.section'), p.ranks.section)}
          ${rank(t('leaderboard.scope.group'), p.ranks.group)}
          ${rank(t('leaderboard.scope.university'), p.ranks.university)}
        </div>
      </section>

      <div class="shortcut-grid">
        <a class="shortcut" href="#/quizzes">${icons.quiz}<span><strong>${t('nav.quizzes')}</strong><span>${t('progress.quizzesDone', { count: p.quizzesCompleted })}</span></span>${icons.chevron}</a>
        <a class="shortcut" href="#/activities">${icons.flag}<span><strong>${t('nav.activities')}</strong><span>${t('progress.activitiesDone', { count: p.activitiesCompleted })}</span></span>${icons.chevron}</a>
        <a class="shortcut" href="#/leaderboard">${icons.trophy}<span><strong>${t('nav.leaderboard')}</strong><span>${t('progress.leaderboardText')}</span></span>${icons.chevron}</a>
      </div>

      <div class="console-cols">
        <section class="panel">
          <header class="panel-head"><h2>${t('progress.howTitle')}</h2></header>
          <ul class="rules">
            <li>${icons.quiz}<span>${t('progress.ruleQuiz', { xp: XP_RULES.quiz_completed.amount })}</span></li>
            <li>${icons.star}<span>${t('progress.ruleScore', { xp: 10 * XP_RULES.quiz_score.perTenPercent })}</span></li>
            <li>${icons.flag}<span>${t('progress.ruleActivity')}</span></li>
            <li>${icons.shield}<span>${t('progress.ruleFair', { cap: DAILY_XP_CAP })}</span></li>
          </ul>
        </section>
        <section class="panel">
          <header class="panel-head"><h2>${t('progress.recent')}</h2></header>
          <div class="panel-body">
            ${p.recent.length ? html`<ul class="xp-list">${p.recent.map(e => html`
              <li><span class="xp-amount mono">+${e.amount}</span><span class="xp-what"><strong>${t(XP_SOURCE[e.type] || 'xp.source.other')}</strong><span>${e.title}</span></span><span class="muted xp-when">${dateTime(e.at)}</span></li>`)}</ul>`
              : emptyState(t('progress.noXp'), t('progress.noXpText'))}
          </div>
        </section>
      </div>`,
  };
}

const SCOPES = ['section', 'group', 'university'];

export async function leaderboardView({ query }) {
  let scope = SCOPES.includes(query.scope) ? query.scope : 'section';
  const first = await orNotLive(() => api.engage.leaderboard({ scope }));
  const back = { href: '#/progress', label: t('progress.title') };
  if (first.__notLive) return notLivePage(t('nav.leaderboard'), t('nav.leaderboard'), back);

  const table = board => board.rows.length ? html`
    <ol class="board">
      ${board.rows.map(r => html`
        <li class="${r.isMe ? 'is-me' : ''}" ${r.isMe ? html`aria-current="true"` : ''}>
          <span class="board-rank mono">${r.rank}</span>
          <span class="board-name">${r.name}${r.isMe ? html` <span class="badge">${t('leaderboard.you')}</span>` : ''}</span>
          <span class="board-level mono">${t('progress.levelShort', { level: r.level })}</span>
          <span class="board-xp mono">${formatNumber(r.xp)} XP</span>
        </li>`)}
      ${board.meOutsideTop ? html`
        <li class="is-me board-gap" aria-current="true">
          <span class="board-rank mono">${board.me.rank}</span>
          <span class="board-name">${board.me.name} <span class="badge">${t('leaderboard.you')}</span></span>
          <span class="board-level mono">${t('progress.levelShort', { level: board.me.level })}</span>
          <span class="board-xp mono">${formatNumber(board.me.xp)} XP</span>
        </li>` : ''}
    </ol>` : emptyState(t('leaderboard.empty'));

  return {
    title: t('nav.leaderboard'),
    html: html`
      ${pageHead({ title: t('nav.leaderboard'), back, lead: t('leaderboard.lead') })}
      <div class="toolbar">${chips(SCOPES.map(s => ({ value: s, label: t(`leaderboard.scope.${s}`) })), scope, { name: t('leaderboard.scopeLabel') })}</div>
      <div id="board">${table(first)}</div>
      <p class="muted board-note">${icons.shield} ${t('leaderboard.privacy')}</p>`,
    bind(root) {
      const el = root.querySelector('#board');
      root.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', async () => {
        scope = btn.dataset.value;
        root.querySelectorAll('.chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
        history.replaceState(null, '', `#/leaderboard?scope=${scope}`);
        mount(el, loadingState());
        try { mount(el, table(await api.engage.leaderboard({ scope }))); }
        catch (err) { mount(el, errorState(err)); }
      }));
    },
  };
}
