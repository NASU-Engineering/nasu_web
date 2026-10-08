import { html } from '../ui/html.js';
import { api } from '../services/api.js';
import { pageHead, subjectCard } from '../ui/components.js';
import { icons } from '../ui/icons.js';
import { t } from '../i18n/index.js';

export default async function subjects() {
  const list = await api.subjects.list();
  return {
    title: t('subjects.title'),
    html: html`
      ${pageHead({ back: { href: '#/learn', label: t('nav.learn') }, title: t('subjects.title'), lead: t('subjects.lead') })}
      <div class="subj-grid">${list.map(subjectCard)}</div>
      <p class="see-more"><a href="#/resources">${icons.search}<span>${t('learn.searchAll')}</span></a></p>`,
  };
}
