import { html } from '../ui/html.js';
import { api } from '../services/api.js';
import { pageHead, subjectCard } from '../ui/components.js';

export default async function subjects() {
  const list = await api.subjects.list();
  return {
    title: 'Subjects',
    html: html`
      ${pageHead({ eyebrow: `${list.length} SUBJECTS`, title: 'Subjects', lead: 'Pick a subject to see its lectures, tutorials, boards, PDFs and assignments.' })}
      <div class="subj-grid">${list.map(subjectCard)}</div>`,
  };
}
