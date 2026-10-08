import { html } from '../ui/html.js';
import { icons } from '../ui/icons.js';
import { CONFIG } from '../config.js';
import { SUBJECTS } from '../data/catalog.js';
import { pad2 } from '../ui/format.js';
import { microsoftButton, formError } from '../ui/components.js';
import { bindMicrosoftSignIn } from '../ui/sign-in.js';
import { t } from '../i18n/index.js';

export default async function landing({ session }) {
  const domain = `@${CONFIG.auth.emailDomain}`;
  return {
    title: t('landing.title'),
    html: html`
      <section class="hero">
        <p class="eyebrow mono">${t('landing.eyebrow')}</p>
        <h1 class="hero-title" tabindex="-1">${t('landing.headline')}</h1>
        <p class="hero-lead">${t('landing.lead')}</p>
        <div class="hero-cta">
          ${session
            ? html`<a class="btn btn-primary btn-lg" href="#/start">${t('landing.open')}</a>`
            : html`<div class="hero-signin">${microsoftButton('heroSignIn')}${formError('heroSignInError')}</div>`}
        </div>
      </section>

      ${session ? '' : html`
      <section class="steps" aria-labelledby="stepsTitle">
        <h2 class="section-label" id="stepsTitle"><span>${t('landing.howTitle')}</span><span class="ln"></span></h2>
        <ol class="step-list">
          <li><span class="step-n mono">01</span><div><strong>${t('landing.step1Title')}</strong><p>${t('landing.step1Text', { domain })}</p></div></li>
          <li><span class="step-n mono">02</span><div><strong>${t('landing.step2Title')}</strong><p>${t('landing.step2Text')}</p></div></li>
          <li><span class="step-n mono">03</span><div><strong>${t('landing.step3Title')}</strong><p>${t('landing.step3Text')}</p></div></li>
        </ol>
      </section>`}

      <section aria-labelledby="subjTitle">
        <h2 class="section-label" id="subjTitle"><span>${t('landing.subjectsTitle')}</span><span class="ln"></span></h2>
        <ul class="subject-strip">
          ${SUBJECTS.map((s, i) => html`<li><span class="mono subj-n">${pad2(i + 1)}</span><span class="subj-strip-name">${s.name}</span><span class="mono subj-code">${s.code}</span></li>`)}
        </ul>
      </section>

      <section class="features" aria-label="${t('landing.featuresLabel')}">
        <div class="feature">${icons.book}<h3>${t('landing.f1Title')}</h3><p>${t('landing.f1Text')}</p></div>
        <div class="feature">${icons.trophy}<h3>${t('landing.f2Title')}</h3><p>${t('landing.f2Text')}</p></div>
        <div class="feature">${icons.bell}<h3>${t('landing.f3Title')}</h3><p>${t('landing.f3Text')}</p></div>
      </section>`,
    bind(root) {
      const btn = root.querySelector('#heroSignIn');
      if (btn) bindMicrosoftSignIn(btn, root.querySelector('#heroSignInError'));
    },
  };
}
