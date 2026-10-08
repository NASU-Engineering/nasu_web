// Role experience simulator (Admin Control Center). Opens any experience as a
// mock persona over isolated mock data — see services/simulator.js for the
// isolation guarantees.

import { html } from '../../ui/html.js';
import { icons } from '../../ui/icons.js';
import { api } from '../../services/api.js';
import { PERSONAS, PERSONA_IDS } from '../../services/simulator.js';
import { experienceById } from '../../services/experiences.js';
import { consoleShell, panel } from '../../ui/console.js';
import { confirmDialog, toast } from '../../ui/dialog.js';

// Guided mock workflow: Editor uploads → Reviewer approves → Student sees content.
const WORKFLOW = [
  { persona: 'editor',   route: '/editor/upload', title: 'Upload as a Section Editor', text: 'Create a Mathematics I item for Group A (sample) · Section 1, attach any file and submit it for review.' },
  { persona: 'reviewer', route: '/review',        title: 'Approve as a Content Reviewer', text: 'Open the submission in the Review queue, approve it, then publish it.' },
  { persona: 'student',  route: '/subjects/math1', title: 'Check as a Student', text: 'The Group A · Section 1 student now sees it under Mathematics I. Students in other sections don’t.' },
];

export default async function adminSimulator({ access, path, navigate }) {
  const running = api.sim.current();
  const allowed = api.sim.available(access);

  const body = running ? html`
    <div class="state">
      <p class="state-title">A simulation is running (${running.label})</p>
      <p class="state-text">Exit it to return to your real Admin Control Center.</p>
      <p><button type="button" class="btn btn-primary" data-action="sim-exit">Exit simulation</button></p>
    </div>`
    : !allowed ? html`
    <div class="state">
      <p class="state-title">The simulator isn’t available</p>
      <p class="state-text">It needs the backend to confirm your account’s Admin role, and must be enabled in the Hub configuration.</p>
    </div>`
    : html`
    <div class="sim-note">
      ${icons.shield}
      <p><strong>Isolated testing.</strong> Personas run on mock accounts and sample data kept in this browser tab.
      No request reaches the real backend, no real data is shown or changed, and no permissions are granted. Your real session is untouched.</p>
    </div>

    <h2 class="section-label"><span>Preview an experience</span><span class="ln"></span></h2>
    <div class="persona-grid">
      ${PERSONA_IDS.map(id => {
        const p = PERSONAS[id];
        const exp = experienceById(p.experience);
        return html`
          <article class="persona">
            <p class="persona-exp">${icons[exp.icon]}<span>${exp.label}</span></p>
            <h3 class="persona-title">${p.label}</h3>
            <p class="persona-text">${p.text}</p>
            <button type="button" class="btn btn-ghost" data-persona="${id}" data-route="${p.home}">Preview as ${p.label}</button>
          </article>`;
      })}
    </div>

    ${panel('Guided workflow — Editor → Reviewer → Student', html`
      <ol class="sim-steps">${WORKFLOW.map((s, i) => html`
        <li>
          <span class="sim-step-n mono">${String(i + 1).padStart(2, '0')}</span>
          <div><p class="sim-step-title">${s.title}</p><p class="muted">${s.text}</p></div>
          <button type="button" class="btn btn-sm btn-ghost" data-persona="${s.persona}" data-route="${s.route}">Start</button>
        </li>`)}</ol>`)}

    <div class="sim-foot">
      <button type="button" class="btn btn-quiet" id="simReset">Reset sample data</button>
    </div>`;

  return {
    title: 'Role simulator',
    html: consoleShell({
      access, path,
      eyebrow: 'ADMIN CONTROL CENTER · TESTING TOOL',
      title: 'Role simulator',
      lead: 'See each experience exactly as that role does — on mock data only.',
      body,
    }),
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
          title: 'Reset sample data?',
          body: html`<p>Mock submissions, decisions and audit entries made in this tab go back to their starting state. Real Hub data isn’t affected.</p>`,
          confirmLabel: 'Reset',
          run: async () => api.sim.reset(),
        });
        if (confirmed) toast('Sample data reset');
      });
    },
  };
}
