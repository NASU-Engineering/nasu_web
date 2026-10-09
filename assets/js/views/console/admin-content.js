// Admin · Content — ONE list for every content type, with filters instead of tabs:
//   type · status · subject · section · creator (+ text search)
// "Pending" is the review queue: its rows open the shared review page
// (/admin/content/:id = the Review Desk's review-item view), so review and
// publishing are implemented once. Only actions this admin can perform appear.
//
// Sources: content items (live RPC), quizzes/activities (engagement backend —
// "not live" until approved), announcements (only when content is connected).
// A source that isn't connected is named, never filled with sample rows.

import { html, mount } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api, isDemoMode, usesSampleContent } from '../../services/api.js';
import { SUBJECTS, subjectById } from '../../data/catalog.js';
import { STATUSES } from '../../services/content-workflow.js';
import { hasAnyRole } from '../../services/roles.js';
import { consoleShell, workspaceErrorState } from '../../ui/console.js';
import { statusBadge } from '../../ui/workflow.js';
import { chips, emptyState, loadingState } from '../../ui/components.js';
import { dateTime } from '../../ui/format.js';
import { t } from '../../i18n/index.js';

export const CONTENT_TYPES = ['resource', 'assignment', 'quiz', 'activity', 'announcement'];
export const CONTENT_STATUS_FILTERS = ['draft', 'pending_review', 'approved', 'rejected', 'published'];
const settle = p => p.then(value => ({ value }), error => ({ error }));

/** Normalises every source into one row shape. Pure (tested). */
export function toContentRows({ items = [], quizzes = [], activities = [], announcements = [] }) {
  const rows = [];
  for (const i of items) {
    rows.push({
      key: `c-${i.id}`, type: i.contentType === 'assignment' ? 'assignment' : 'resource', id: i.id, title: i.title,
      status: i.status, subjectId: i.subjectId || '', group: i.group || '', section: i.section || '',
      creator: i.submitter?.fullName || '', date: i.updatedAt || i.submittedAt || i.createdAt || null,
      href: `#/admin/content/${encodeURIComponent(i.id)}`, reviewable: i.status === 'pending_review',
    });
  }
  for (const q of quizzes) {
    rows.push({ key: `q-${q.id}`, type: 'quiz', id: q.id, title: q.title, status: 'published', subjectId: q.subjectId || '',
      group: '', section: '', creator: '', date: q.opensAt || null, href: null, reviewable: false, detail: t(`quiz.status.${q.status}`) });
  }
  for (const a of activities) {
    rows.push({ key: `a-${a.id}`, type: 'activity', id: a.id, title: a.title, status: 'published', subjectId: '',
      group: '', section: '', creator: '', date: a.startsAt || null, href: null, reviewable: false, detail: t(`activity.kind.${a.kind}`) });
  }
  for (const u of announcements) {
    rows.push({ key: `u-${u.id}`, type: 'announcement', id: u.id, title: u.title, status: 'published', subjectId: u.subjectId || '',
      group: '', section: '', creator: u.author || '', date: u.publishedAt || null, href: null, reviewable: false });
  }
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** Applies the filters. Pure (tested). */
export function filterContentRows(rows, { type = '', status = '', subjectId = '', section = '', creator = '', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter(r => (!type || r.type === type)
    && (!status || r.status === status)
    && (!subjectId || r.subjectId === subjectId)
    && (!section || r.section === section)
    && (!creator || r.creator === creator)
    && (!q || r.title.toLowerCase().includes(q) || r.creator.toLowerCase().includes(q)));
}

const TYPE_ICON = { resource: 'book', assignment: 'assignment', quiz: 'quiz', activity: 'flag', announcement: 'bell' };

function table(rows, canReview) {
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th scope="col">${t('field.title')}</th><th scope="col">${t('field.type')}</th><th scope="col">${t('field.subject')}</th>
          <th scope="col">${t('field.section')}</th><th scope="col">${t('content.creator')}</th><th scope="col">${t('analytics.status')}</th>
          <th scope="col">${t('content.updated')}</th><th scope="col"><span class="visually-hidden">${t('common.actions')}</span></th>
        </tr></thead>
        <tbody>${rows.map(r => html`
          <tr>
            <td data-label="${t('field.title')}"><strong>${r.title}</strong>${r.detail ? html` <span class="muted">· ${r.detail}</span>` : ''}</td>
            <td data-label="${t('field.type')}"><span class="type-tag">${icons[TYPE_ICON[r.type]]}${t(`content.type.${r.type}`)}</span></td>
            <td data-label="${t('field.subject')}" class="mono">${subjectById(r.subjectId)?.code || '—'}</td>
            <td data-label="${t('field.section')}">${[r.group, r.section].filter(Boolean).join(' · ') || '—'}</td>
            <td data-label="${t('content.creator')}">${r.creator || '—'}</td>
            <td data-label="${t('analytics.status')}">${statusBadge(r.status)}</td>
            <td data-label="${t('content.updated')}">${dateTime(r.date) || '—'}</td>
            <td>${r.href ? html`<a class="btn btn-sm ${r.reviewable && canReview ? 'btn-primary' : 'btn-ghost'}" href="${r.href}">${r.reviewable && canReview ? t('content.review') : t('common.open')}</a>` : ''}</td>
          </tr>`)}</tbody>
      </table>
    </div>`;
}

export default async function adminContent({ access, path, query, reload }) {
  const canReview = hasAnyRole(access.roles, ['content_manager', 'admin']);
  const canUpload = hasAnyRole(access.roles, ['section_editor', 'admin']);
  const state = {
    type: CONTENT_TYPES.includes(query.type) ? query.type : '',
    status: STATUSES[query.status] ? query.status : '',
    subjectId: SUBJECTS.some(s => s.id === query.subject) ? query.subject : '',
    section: query.section || '',
    creator: query.creator || '',
    query: query.q || '',
  };
  const select = (name, label, options, value) => html`
    <label class="select-wrap"><span class="visually-hidden">${label}</span>
      <select name="${name}">${options.map(o => html`<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`)}</select></label>`;

  return {
    title: t('nav.content'),
    html: consoleShell({
      access, path,
      eyebrow: t('experience.admin'),
      title: t('nav.content'),
      actions: canUpload ? html`<a class="btn btn-primary btn-sm" href="#/editor/upload">${icons.upload}<span>${t('content.upload')}</span></a>` : '',
      body: html`
        <form class="toolbar content-filters" id="cfForm" role="search">
          <div class="search-box search-box-sm">${icons.search}<input type="search" name="q" value="${state.query}" placeholder="${t('admin.libraryPlaceholder')}" aria-label="${t('admin.librarySearch')}" autocomplete="off"></div>
          ${select('type', t('field.type'), [{ value: '', label: t('filter.allTypes') }, ...CONTENT_TYPES.map(c => ({ value: c, label: t(`content.type.${c}`) }))], state.type)}
          ${select('subject', t('field.subject'), [{ value: '', label: t('filter.allSubjects') }, ...SUBJECTS.map(s => ({ value: s.id, label: `${s.code} — ${s.name}` }))], state.subjectId)}
          <span id="cfDynamic" class="cf-dynamic"></span>
        </form>
        <div class="toolbar">${chips([{ value: '', label: t('common.all') }, ...CONTENT_STATUS_FILTERS.map(s => ({ value: s, label: s === 'pending_review' ? t('content.pendingQueue') : STATUSES[s].label }))], state.status, { name: t('filter.byStatus') })}</div>
        <div id="cfNotes"></div>
        <div id="cfList">${loadingState()}</div>`,
    }),
    async bind(root) {
      const form = root.querySelector('#cfForm');
      const listEl = root.querySelector('#cfList');
      const notesEl = root.querySelector('#cfNotes');
      const dynEl = root.querySelector('#cfDynamic');
      let rows = [];

      const syncUrl = () => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries({ type: state.type, status: state.status, subject: state.subjectId, section: state.section, creator: state.creator, q: state.query })) if (v) p.set(k, v);
        history.replaceState(null, '', `#/admin/content${p.toString() ? `?${p}` : ''}`);
      };
      const draw = () => {
        syncUrl();
        const shown = filterContentRows(rows, state);
        mount(listEl, shown.length ? table(shown, canReview) : emptyState(t('admin.libraryEmpty'), t('common.tryAnotherFilter')));
      };

      // Content items are paged by the backend; load every page so filters see everything (bounded).
      async function loadItems() {
        const out = [];
        let cursor = null;
        for (let i = 0; i < 10; i++) {
          const page = await api.admin.listContent({ cursor });
          out.push(...page.items);
          cursor = page.nextCursor;
          if (!cursor) break;
        }
        return out;
      }
      const announcementsLive = isDemoMode || !usesSampleContent;
      const [items, quizzes, activities, announcements] = await Promise.all([
        settle(loadItems()), settle(api.engage.adminQuizzes()), settle(api.engage.adminActivities()),
        announcementsLive ? settle(api.announcements.list({})) : Promise.resolve({ error: { code: 'backend_required' } }),
      ]);
      if (!root.isConnected) return;
      if (items.error) {
        mount(listEl, workspaceErrorState(items.error));
        listEl.querySelector('[data-action=retry]')?.addEventListener('click', () => reload());
        return;
      }
      rows = toContentRows({ items: items.value, quizzes: quizzes.value || [], activities: activities.value || [], announcements: announcements.value || [] });

      const missing = [
        quizzes.error || activities.error ? t('content.notLive.engagement') : '',
        announcements.error ? t('content.notLive.announcements') : '',
      ].filter(Boolean);
      mount(notesEl, missing.length ? html`<p class="notice">${icons.alert}<span>${missing.join(' ')}</span></p>` : '');

      // Section and creator options come from the loaded rows.
      const sections = [...new Set(rows.map(r => r.section).filter(Boolean))].sort();
      const creators = [...new Set(rows.map(r => r.creator).filter(Boolean))].sort();
      mount(dynEl, html`
        ${select('section', t('field.section'), [{ value: '', label: t('scope.allSections') }, ...sections.map(s => ({ value: s, label: s }))], state.section)}
        ${select('creator', t('content.creator'), [{ value: '', label: t('content.allCreators') }, ...creators.map(c => ({ value: c, label: c }))], state.creator)}`);

      form.addEventListener('change', e => {
        const map = { type: 'type', subject: 'subjectId', section: 'section', creator: 'creator' };
        if (map[e.target.name]) { state[map[e.target.name]] = e.target.value; draw(); }
      });
      let timer;
      form.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.query = form.q.value.trim(); draw(); }, 200); });
      form.addEventListener('submit', e => { e.preventDefault(); state.query = form.q.value.trim(); draw(); });
      root.querySelectorAll('.toolbar > .chips .chip').forEach(btn => btn.addEventListener('click', () => {
        state.status = btn.dataset.value;
        root.querySelectorAll('.toolbar > .chips .chip').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
        draw();
      }));
      draw();
    },
  };
}
