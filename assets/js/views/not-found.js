import { html } from '../ui/html.js';
import { t } from '../i18n/index.js';

export default async function notFound({ session }) {
  return {
    title: t('notFound.title'),
    html: html`
      <div class="state state-page">
        <p class="eyebrow mono">${t('notFound.eyebrow')}</p>
        <h1 class="page-title" tabindex="-1">${t('notFound.headline')}</h1>
        <p class="state-text">${t('notFound.text')}</p>
        <a class="btn btn-primary" href="${session ? '#/start' : '#/'}">${session ? t('common.backToWorkspace') : t('notFound.backHome')}</a>
      </div>`,
  };
}
