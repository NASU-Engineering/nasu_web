// Public course catalog — the six prep-year subjects and resource categories.
// This is non-sensitive reference data; the backend may take ownership of it later.

export const SUBJECTS = [
  { id: 'math1', code: 'BSC111', name: 'Mathematics I' },
  { id: 'vib',   code: 'BSC121', name: 'Vibration and Waves' },
  { id: 'stat',  code: 'BSC131', name: 'Statics' },
  { id: 'chem',  code: 'BSC141', name: 'Engineering Chemistry' },
  { id: 'soc',   code: 'ASU101', name: 'Societal Issues' },
  { id: 'draw',  code: 'ARC171', name: 'Engineering and Architectural Drawings and Projection' },
];

export const CATEGORIES = [
  { id: 'lecture',    label: 'Lectures',    single: 'Lecture' },
  { id: 'tutorial',   label: 'Tutorials',   single: 'Tutorial' },
  { id: 'board',      label: 'Boards',      single: 'Board' },
  { id: 'pdf',        label: 'PDFs',        single: 'PDF' },
  { id: 'assignment', label: 'Assignments', single: 'Assignment' },
];

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
