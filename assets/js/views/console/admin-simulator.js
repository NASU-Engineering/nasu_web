// Admin · Settings · Role simulator. Opens any experience as a mock persona over
// isolated mock data — see services/simulator.js for the isolation guarantees.

import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { PERSONAS, PERSONA_IDS } from '../../services/simulator.js';
import { experienceById } from '../../services/experiences.js';
import { consoleShell, panel } from '../../ui/console.js';
import { confirmDialog, toast } from '../../ui/dialog.js';
import { t } from '../../i18n/index.js';

// Guided mock workflow: Editor uploads → Reviewer approves → Student sees content.
const WORKFLOW = [
  { persona: 'editor',   route: '/editor/upload',  key: 'upload' },
  { persona: 'reviewer', route: '/review',         key: 'approve' },
  { persona: 'student',  route: '/subjects/math1', key: 'check' },
  { persona: 'student',  route: '/quizzes',        key: 'quiz' },
];

export default async function adminSimulator({ access, path, navigate }) {
  const running = api.sim.current();
  const allowed = api.sim.available(access);

  const body = running ? html`
    <div class="state">
      <p class="state-title">${t('sim.running', { persona: running.label })}</p>
      <p class="state-text">${t('sim.runningText')}</p>
      <p><button type="button" class="btn btn-primary" data-action="sim-exit">${t('sim.exitSimulation')}</button></p>
    </div>`
    : !allowed ? html`
    <div class="state">
      <p class="state-title">${t('sim.unavailable')}</p>
      <p class="state-text">${t('sim.unavailableText')}</p>
    </div>`
    : html`
    <div class="sim-note">${icons.shield}<p><strong>${t('sim.isolatedTitle')}</strong> ${t('sim.isolatedText')}</p></div>

    <h2 class="section-label"><span>${t('sim.preview')}</span><span class="ln"></span></h2>
    <div class="persona-grid">
      ${PERSONA_IDS.map(id => {
        const p = PERSONAS[id];
        const exp = experienceById(p.experience);
        return html`
          <article class="persona">
            <p class="persona-exp">${icons[exp.icon]}<span>${exp.label}</span></p>
            <h3 class="persona-title">${p.label}</h3>
            <p class="persona-text">${p.text}</p>
            <button type="button" class="btn btn-ghost" data-persona="${id}" data-route="${p.home}">${t('sim.previewAs', { persona: p.label })}</button>
          </article>`;
      })}
    </div>

    ${panel(t('sim.workflow'), html`
      <ol class="sim-steps">${WORKFLOW.map((s, i) => html`
        <li>
          <span class="sim-step-n mono">${String(i + 1).padStart(2, '0')}</span>
          <div><p class="sim-step-title">${t(`sim.step.${s.key}.title`)}</p><p class="muted">${t(`sim.step.${s.key}.text`)}</p></div>
          <button type="button" class="btn btn-sm btn-ghost" data-persona="${s.persona}" data-route="${s.route}">${t('sim.start')}</button>
        </li>`)}</ol>`)}

    <div class="sim-foot"><button type="button" class="btn btn-quiet" id="simReset">${t('sim.reset')}</button></div>`;

  return {
    title: t('nav.simulator'),
    html: consoleShell({ access, path, eyebrow: t('experience.admin'), title: t('nav.settings'), lead: t('sim.lead'), body }),
    bind(root) {
      root.querySelectorAll('[data-persona]').forEach(btn => btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          // Pass the REAL access the backend reported for this account.
          await api.sim.enter(btn.dataset.persona, access);
          navigate(btn.dataset.route);
        } catch (err) {
          btn.disabled = false;
          toast(err.message, { tone: 'bad' });
        }
      }));
      root.querySelector('#simReset')?.addEventListener('click', async () => {
        const { confirmed } = await confirmDialog({
          title: t('sim.resetTitle'),
          body: html`<p>${t('sim.resetText')}</p>`,
          confirmLabel: t('sim.resetConfirm'),
          run: async () => api.sim.reset(),
        });
        if (confirmed) toast(t('sim.resetDone'));
      });
    },
  };
}
