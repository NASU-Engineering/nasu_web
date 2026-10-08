import { html } from '../ui/html.js';

export default async function notFound({ session }) {
  return {
    title: 'Page not found',
    html: html`
      <div class="state state-page">
        <p class="eyebrow mono">ERROR 404</p>
        <h1 class="page-title" tabindex="-1">This sheet doesn’t exist</h1>
        <p class="state-text">The page you’re looking for has moved or never existed.</p>
        <a class="btn btn-primary" href="${session ? '#/start' : '#/'}">Back to ${session ? 'my workspace' : 'home'}</a>
      </div>`,
  };
}
