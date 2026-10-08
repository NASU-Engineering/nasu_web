// Public course catalog — the six prep-year subjects and resource categories.
// This is non-sensitive reference data; the backend may take ownership of it later.
// Display names come from the i18n catalogs (getters), so they follow the
// selected language; `nameEn` stays available for search in both languages.

import { t } from '../i18n/index.js';

const subject = (id, code, nameEn) => ({
  id, code, nameEn,
  get name() { return t(`subject.${id}`); },
});

export const SUBJECTS = [
  subject('math1', 'BSC111', 'Mathematics I'),
  subject('vib',   'BSC121', 'Vibration and Waves'),
  subject('stat',  'BSC131', 'Statics'),
  subject('chem',  'BSC141', 'Engineering Chemistry'),
  subject('soc',   'ASU101', 'Societal Issues'),
  subject('draw',  'ARC171', 'Engineering and Architectural Drawings and Projection'),
];

const category = id => ({
  id,
  get label() { return t(`category.${id}.plural`); },
  get single() { return t(`category.${id}.single`); },
});

export const CATEGORIES = ['lecture', 'tutorial', 'board', 'pdf', 'assignment'].map(category);

export function subjectById(id) {
  return SUBJECTS.find(s => s.id === id) || null;
}

export function subjectByCode(code) {
  return SUBJECTS.find(s => s.code === code) || null;
}

// The backend identifies subjects by course code (e.g. 'BSC131'); the frontend
// uses short ids ('stat'). These two helpers are the only translation point.
/** Frontend subject id → backend subject code (unknown values pass through). */
export const subjectCodeFor = id => subjectById(id)?.code ?? id;
/** Backend subject code (or a frontend id) → frontend subject id. */
export const subjectIdFrom = v => subjectByCode(v)?.id ?? (subjectById(v) ? v : (v == null ? '' : String(v)));

export function categoryById(id) {
  return CATEGORIES.find(c => c.id === id) || null;
}
