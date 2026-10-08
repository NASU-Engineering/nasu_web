// Student Hub · Activities: events, workshops, competitions and clubs.
// Joining is the student's choice; completion (and its XP) is confirmed by the
// organiser on the backend — a student can't mark themselves as attended.

import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { pageHead, sectionLabel, emptyState, focusLinkedItem } from '../ui/components.js';
import { confirmDialog, toast } from '../ui/dialog.js';
import { eventDateTime } from '../ui/format.js';
import { orNotLive, notLivePage } from './progress.js';
import { t } from '../i18n/index.js';

function activityCard(a) {
  const spots = Math.max(0, a.capacity - a.participants);
  const completion = a.completion && {
    completed: html`<span class="status status-ok"><span class="status-dot" aria-hidden="true"></span>${t('activity.completed', { xp: a.xp })}</span>`,
    not_confirmed: html`<span class="status status-neutral"><span class="status-dot" aria-hidden="true"></span>${t('activity.notConfirmed')}</span>`,
    registered: html`<span class="status status-live"><span class="status-dot" aria-hidden="true"></span>${t('activity.registered')}</span>`,
  }[a.completion];
  return html`
    <article class="activity ${a.past ? 'is-past' : ''}" data-item="${a.id}">
      <div class="activity-main">
        <p class="activity-top"><span class="act-kind mono">${t(`activity.kind.${a.kind}`)}</span>${completion || ''}</p>
        <h3 class="activity-title">${a.title}</h3>
        <p class="activity-meta">
          <span>${icons.clock}${eventDateTime(a.startsAt)}</span>
          <span>${icons.pinMap}${a.location}</span>
          ${a.past ? '' : html`<span>${icons.users}${a.full ? t('activity.full') : t('activity.spotsLeft', { count: spots })}</span>`}
          <span class="xp-pill">${icons.star}+${a.xp} XP</span>
        </p>
      </div>
      ${a.past ? '' : a.joined
        ? html`<button type="button" class="btn btn-sm btn-ghost" data-leave="${a.id}">${t('activity.leave')}</button>`
        : html`<button type="button" class="btn btn-sm btn-primary" data-join="${a.id}" ${a.full ? 'disabled' : ''}>${t('activity.join')}</button>`}
    </article>`;
}

export async function activitiesView({ query, reload }) {
  const list = await orNotLive(() => api.engage.activities());
  const back = { href: '#/progress', label: t('progress.title') };
  if (list.__notLive) return notLivePage(t('nav.activities'), t('nav.activities'), back);
  const upcoming = list.filter(a => !a.past);
  const past = list.filter(a => a.past);

  return {
    title: t('nav.activities'),
    html: html`
      ${pageHead({ title: t('nav.activities'), back, lead: t('activity.lead') })}
      <p class="notice">${icons.shield}<span>${t('activity.rules')}</span></p>
      <section>${sectionLabel(t('activity.upcoming'))}${upcoming.length ? html`<div class="activity-list">${upcoming.map(activityCard)}</div>` : emptyState(t('activity.noneUpcoming'))}</section>
      ${past.length ? html`<section>${sectionLabel(t('activity.past'))}<div class="activity-list">${past.map(activityCard)}</div></section>` : ''}`,
    bind(root) {
      focusLinkedItem(root, query.item);
      root.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await api.engage.joinActivity(btn.dataset.join); toast(t('activity.joined')); reload(); }
        catch (err) { btn.disabled = false; toast(err.message, { tone: 'bad' }); }
      }));
      root.querySelectorAll('[data-leave]').forEach(btn => btn.addEventListener('click', async () => {
        const a = list.find(x => x.id === btn.dataset.leave);
        const { confirmed } = await confirmDialog({
          title: t('activity.leaveTitle'),
          body: html`<p>${t('activity.leaveText', { title: a.title })}</p>`,
          tone: 'danger', confirmLabel: t('activity.leave'),
          run: () => api.engage.leaveActivity(a.id),
        });
        if (confirmed) { toast(t('activity.left')); reload(); }
      }));
    },
  };
}
