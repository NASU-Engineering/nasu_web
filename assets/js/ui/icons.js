import { trusted } from './html.js';

const svg = body => trusted(
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
);

export const icons = {
  mark: svg('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 21V9"/>'),
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  book: svg('<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  logout: svg('<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  arrow: svg('<path d="M7 17L17 7"/><path d="M8 7h9v9"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  back: svg('<path d="M15 6l-6 6 6 6"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  pin: svg('<path d="M12 17v5"/><path d="M8 3h8l-1 6 3 4H6l3-4z"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  // staff workspaces
  grid: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  list: svg('<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
  upload: svg('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'),
  inbox: svg('<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a6 6 0 0 1 4 6.5"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4"/><path d="M12 13v4M8 21h8M9 17h6v4H9z"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  file: svg('<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
  alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  swap: svg('<path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/>'),
  chevronDown: svg('<path d="M6 9l6 6 6-6"/>'),
  // resource categories
  lecture: svg('<rect x="3" y="5" width="18" height="12" rx="1"/><path d="M10 9l5 2-5 2z"/><path d="M8 21h8"/>'),
  tutorial: svg('<path d="M12 3l9 4-9 4-9-4z"/><path d="M7 9v5c0 1.5 2.2 3 5 3s5-1.5 5-3V9"/>'),
  board: svg('<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M7 9h6M7 12h10"/><path d="M8 20l4-4 4 4"/>'),
  pdf: svg('<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
  assignment: svg('<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V3h6v1"/><path d="M9 11l2 2 4-4"/><path d="M9 17h6"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>'),
};
