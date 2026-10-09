// Student Hub · Quizzes: listing by subject, attempt flow, results and review.
// Scoring and XP are decided by the backend (the mock imitates it); the
// browser never holds the answers before an attempt is submitted.

import { html, mount } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { api } from '../services/api.js';
import { SUBJECTS, subjectById } from '../data/catalog.js';
import { pageHead, sectionLabel, emptyState, formError, showFormError } from '../ui/components.js';
import { confirmDialog, toast } from '../ui/dialog.js';
import { shortDate, dateTime, pad2 } from '../ui/format.js';
import { orNotLive, notLivePage } from './progress.js';
import { t } from '../i18n/index.js';

const back = () => ({ href: '#/progress', label: t('progress.title') });

function quizCard(q) {
  const s = subjectById(q.subjectId);
  const action = q.status === 'upcoming' ? t('quiz.opens', { date: shortDate(q.opensAt) })
    : q.canAttempt === 'ok' ? (q.attemptsUsed ? t('quiz.retake') : t('quiz.start'))
    : t('quiz.viewResults');
  return html`
    <a class="quiz-card quiz-${q.status}" href="#/quizzes/${q.id}">
      <span class="quiz-top"><span class="mono">${s?.code || ''} · ${t('common.weekN', { n: pad2(q.week) })}</span>${statusTag(q)}</span>
      <span class="quiz-title">${q.title}</span>
      <span class="quiz-meta">
        <span>${t('quiz.questions', { count: q.questionCount })}</span>
        <span>${t('quiz.minutes', { count: q.timeLimitMin })}</span>
        <span>${t('quiz.attemptsUsed', { used: q.attemptsUsed, max: q.maxAttempts })}</span>
        ${q.bestPercent != null ? html`<span>${t('quiz.best', { percent: q.bestPercent })}</span>` : ''}
      </span>
      <span class="quiz-cta">${action}${icons.chevron}</span>
    </a>`;
}

function statusTag(q) {
  const tone = { open: 'ok', upcoming: 'pending', closed: 'neutral' }[q.status];
  return html`<span class="status status-${tone}"><span class="status-dot" aria-hidden="true"></span>${t(`quiz.status.${q.status}`)}</span>`;
}

export async function quizzesView({ query }) {
  let subjectId = SUBJECTS.some(s => s.id === query.subject) ? query.subject : '';
  const all = await orNotLive(() => api.engage.quizzes());
  if (all.__notLive) return notLivePage(t('nav.quizzes'), t('nav.quizzes'), back());

  const body = () => {
    const list = all.filter(q => !subjectId || q.subjectId === subjectId);
    if (!list.length) return emptyState(t('quiz.none'), t('common.tryAnotherFilter'));
    return ['open', 'upcoming', 'closed'].map(st => {
      const group = list.filter(q => q.status === st);
      return group.length ? html`<section>${sectionLabel(t(`quiz.group.${st}`))}<div class="quiz-grid">${group.map(quizCard)}</div></section>` : '';
    });
  };

  return {
    title: t('nav.quizzes'),
    html: html`
      ${pageHead({ title: t('nav.quizzes'), back: back(), lead: t('quiz.lead') })}
      <div class="toolbar">
        <label class="select-wrap"><span class="visually-hidden">${t('field.subject')}</span>
          <select id="qzSubject"><option value="">${t('filter.allSubjects')}</option>
            ${SUBJECTS.map(s => html`<option value="${s.id}" ${s.id === subjectId ? 'selected' : ''}>${s.code} — ${s.name}</option>`)}
          </select></label>
      </div>
      <div id="qzBody">${body()}</div>`,
    bind(root) {
      root.querySelector('#qzSubject').addEventListener('change', e => {
        subjectId = e.target.value;
        history.replaceState(null, '', `#/quizzes${subjectId ? `?subject=${subjectId}` : ''}`);
        mount(root.querySelector('#qzBody'), body());
      });
    },
  };
}

/* ---------- one quiz: intro → attempt → results ---------- */

function resultView(quiz, r) {
  const byId = Object.fromEntries((r.questions || quiz.questions).map(q => [q.id, q]));
  return html`
    <section class="result" aria-live="polite">
      <div class="result-score">
        <span class="result-percent mono">${r.percent}%</span>
        <span>${t('quiz.scoreLine', { correct: r.correct, total: r.total })}</span>
        ${r.xpAwarded ? html`<span class="xp-pill">${icons.star}+${r.xpAwarded} XP</span>` : html`<span class="muted">${t('quiz.noNewXp')}</span>`}
      </div>
      ${r.attemptsLeft != null ? html`<p class="muted">${t('quiz.attemptsLeft', { count: r.attemptsLeft })}</p>` : ''}
      ${r.review ? html`
        <h2 class="section-label"><span>${t('quiz.review')}</span><span class="ln"></span></h2>
        <ol class="review-list">${r.review.map((rv, i) => {
          const q = byId[rv.questionId];
          const opt = id => q?.options.find(o => o.id === id)?.text ?? '—';
          return html`
            <li class="${rv.isCorrect ? 'is-correct' : 'is-wrong'}">
              <p class="rv-q"><span class="mono">${i + 1}.</span> ${q?.text}</p>
              <p class="rv-a">${rv.isCorrect ? icons.check : icons.close}<span>${t('quiz.yourAnswer')} <strong>${rv.chosen ? opt(rv.chosen) : t('quiz.unanswered')}</strong></span></p>
              ${rv.isCorrect ? '' : html`<p class="rv-correct">${t('quiz.correctAnswer')} <strong>${opt(rv.correctOptionId)}</strong></p>`}
              ${rv.explanation ? html`<p class="rv-why">${rv.explanation}</p>` : ''}
            </li>`;
        })}</ol>` : ''}
    </section>`;
}

export async function quizView({ params }) {
  const quiz = await orNotLive(() => api.engage.quiz(params.id));
  const backLink = { href: '#/quizzes', label: t('nav.quizzes') };
  if (quiz.__notLive) return notLivePage(t('nav.quizzes'), t('nav.quizzes'), backLink);
  const s = subjectById(quiz.subjectId);
  const reasons = { not_open: t('quiz.notOpen', { date: dateTime(quiz.opensAt) }), closed: t('quiz.closedText'), limit: t('quiz.limitText') };

  return {
    title: quiz.title,
    html: html`
      ${pageHead({ back: backLink, eyebrow: `${s?.code || ''} · ${t('common.weekN', { n: pad2(quiz.week) })}`, title: quiz.title })}
      <div id="quizBody">
        <section class="quiz-intro panel panel-plain">
          <ul class="quiz-facts">
            <li>${icons.list}<span>${t('quiz.questions', { count: quiz.questions.length })}</span></li>
            <li>${icons.clock}<span>${t('quiz.minutes', { count: quiz.timeLimitMin })}</span></li>
            <li>${icons.history}<span>${t('quiz.attemptsUsed', { used: quiz.attemptsUsed, max: quiz.maxAttempts })}</span></li>
            ${quiz.closesAt ? html`<li>${icons.alert}<span>${t('quiz.closes', { date: dateTime(quiz.closesAt) })}</span></li>` : ''}
          </ul>
          ${quiz.bestPercent != null ? html`<p>${t('quiz.best', { percent: quiz.bestPercent })}</p>` : ''}
          ${quiz.canAttempt === 'ok'
            ? html`<p class="muted">${t('quiz.xpNote')}</p><button type="button" class="btn btn-primary" id="startQuiz">${icons.play}<span>${quiz.attemptsUsed ? t('quiz.retake') : t('quiz.start')}</span></button>`
            : html`<p class="notice">${icons.alert}<span>${reasons[quiz.canAttempt] || ''}</span></p>`}
        </section>
        ${quiz.lastResult?.review ? html`<h2 class="section-label"><span>${t('quiz.lastResult')}</span><span class="ln"></span></h2>${resultView(quiz, quiz.lastResult)}` : ''}
      </div>`,
    bind(root) {
      const body = root.querySelector('#quizBody');
      const start = root.querySelector('#startQuiz');
      start?.addEventListener('click', async () => {
        start.disabled = true;
        try {
          // The server starts the attempt: it counts from now and its timer is authoritative.
          const attempt = await api.engage.startQuiz(quiz.id);
          startAttempt(body, { ...quiz, questions: attempt.questions, timeLimitMin: attempt.timeLimitMin ?? quiz.timeLimitMin }, attempt);
        } catch (err) {
          start.disabled = false;
          toast(err.message, { tone: 'bad' });
        }
      });
    },
  };
}

function startAttempt(body, quiz, attempt) {
  const deadline = Date.parse(attempt.startedAt) + quiz.timeLimitMin * 60e3;
  let left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  mount(body, html`
    <form class="attempt" id="attemptForm" novalidate>
      <div class="attempt-bar">
        <span class="mono" id="timer" role="timer" aria-live="off">${fmtClock(left)}</span>
        <span class="muted" id="answered">${t('quiz.answeredOf', { done: 0, total: quiz.questions.length })}</span>
      </div>
      ${formError('attemptError')}
      <ol class="questions">${quiz.questions.map((q, i) => html`
        <li class="question">
          <fieldset>
            <legend><span class="mono">${i + 1}.</span> ${q.text}</legend>
            <div class="options">${q.options.map(o => html`
              <label class="option"><input type="radio" name="${q.id}" value="${o.id}"><span>${o.text}</span></label>`)}
            </div>
          </fieldset>
        </li>`)}</ol>
      <div class="form-actions"><button type="submit" class="btn btn-primary" id="submitAttempt">${t('quiz.submit')}</button></div>
    </form>`);
  body.querySelector('.question input')?.focus();
  const form = body.querySelector('#attemptForm');
  const answers = () => Object.fromEntries(quiz.questions.map(q => [q.id, form.elements[q.id]?.value || null]).filter(([, v]) => v));
  form.addEventListener('change', () => {
    body.querySelector('#answered').textContent = t('quiz.answeredOf', { done: Object.keys(answers()).length, total: quiz.questions.length });
  });

  let submitted = false;
  const submit = async () => {
    if (submitted) return;
    submitted = true;
    clearInterval(tick);
    const btn = body.querySelector('#submitAttempt');
    if (btn) { btn.disabled = true; btn.textContent = t('common.working'); }
    try {
      const result = await api.engage.submitQuiz(attempt.attemptId, answers());
      toast(result.xpAwarded ? t('quiz.toastXp', { xp: result.xpAwarded }) : t('quiz.toastDone'));
      mount(body, html`${resultView(quiz, result)}<p><a class="btn btn-ghost" href="#/quizzes">${t('quiz.backToQuizzes')}</a></p>`);
      body.querySelector('.result')?.scrollIntoView({ block: 'start' });
    } catch (err) {
      submitted = false;
      if (btn) { btn.disabled = false; btn.textContent = t('quiz.submit'); }
      showFormError(body.querySelector('#attemptError'), err.message);
    }
  };

  let warned = left <= 60;
  const tick = setInterval(() => {
    left = Math.round((deadline - Date.now()) / 1000);
    const el = body.querySelector('#timer');
    if (!el) { clearInterval(tick); return; }
    el.textContent = fmtClock(Math.max(0, left));
    if (left <= 60 && !warned) { warned = true; toast(t('quiz.oneMinute'), { tone: 'bad' }); }
    if (left <= 0) submit(); // time is up: submit what's answered
  }, 1000);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const missing = quiz.questions.length - Object.keys(answers()).length;
    if (missing > 0) {
      const { confirmed } = await confirmDialog({
        title: t('quiz.confirmTitle'),
        body: html`<p>${t('quiz.confirmUnanswered', { count: missing })}</p>`,
        confirmLabel: t('quiz.submit'),
      });
      if (!confirmed) return;
    }
    submit();
  });
}

const fmtClock = sec => `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
