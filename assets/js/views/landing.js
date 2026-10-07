import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { SUBJECTS } from '../data/catalog.js';
import { pad2 } from '../ui/format.js';
import { microsoftButton, formError } from '../ui/components.js';
import { bindMicrosoftSignIn } from '../ui/sign-in.js';

export default async function landing({ session }) {
  return {
    title: 'Home',
    html: html`
      <section class="hero">
        <p class="eyebrow mono">PREP YEAR · ENGINEERING</p>
        <h1 class="hero-title" tabindex="-1">Every lecture, tutorial and sheet for your first year — in one place.</h1>
        <p class="hero-lead">The NASU Engineering Freshmen Hub collects course material for all six prep-year subjects, plus announcements from your course teams.</p>
        <div class="hero-cta">
          ${session
            ? html`<a class="btn btn-primary btn-lg" href="#/dashboard">Open your dashboard</a>`
            : html`
              <div class="hero-signin">${microsoftButton('heroSignIn')}${formError('heroSignInError')}</div>`}
        </div>
      </section>

      ${session ? '' : html`
      <section class="steps" aria-labelledby="stepsTitle">
        <h2 class="section-label" id="stepsTitle"><span>How to sign in</span><span class="ln"></span></h2>
        <ol class="step-list">
          <li><span class="step-n mono">01</span><div><strong>Use your NASU account</strong><p>Sign in with the Microsoft account you use for your <span class="mono">@nasu.edu.eg</span> email.</p></div></li>
          <li><span class="step-n mono">02</span><div><strong>No extra password</strong><p>There’s nothing to register or remember — the hub uses your university sign-in.</p></div></li>
          <li><span class="step-n mono">03</span><div><strong>Open your dashboard</strong><p>See your group, section, subjects and announcements — on your phone or laptop.</p></div></li>
        </ol>
      </section>`}

      <section aria-labelledby="subjTitle">
        <h2 class="section-label" id="subjTitle"><span>Subjects covered</span><span class="ln"></span></h2>
        <ul class="subject-strip">
          ${SUBJECTS.map((s, i) => html`<li><span class="mono subj-n">${pad2(i + 1)}</span><span class="subj-strip-name">${s.name}</span><span class="mono subj-code">${s.code}</span></li>`)}
        </ul>
      </section>

      <section class="features" aria-label="What you get">
        <div class="feature">${icons.book}<h3>Organised by subject</h3><p>Lectures, tutorials, board notes, PDFs and assignments, grouped and dated.</p></div>
        <div class="feature">${icons.search}<h3>Search everything</h3><p>Find a sheet or lecture across all subjects in seconds.</p></div>
        <div class="feature">${icons.bell}<h3>Never miss a notice</h3><p>Room changes, deadlines and reminders in one feed.</p></div>
      </section>`,
    bind(root) {
      const btn = root.querySelector('#heroSignIn');
      if (btn) bindMicrosoftSignIn(btn, root.querySelector('#heroSignInError'));
    },
  };
}
