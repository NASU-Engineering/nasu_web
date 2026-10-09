// Theme preference: system | dark | light | contrast | warm.
// Stored per browser (localStorage, a convenience — falls back to "system").
// The stylesheet reads html[data-theme]; "system" resolves to dark or light.

// Order shown in Settings. "system" is not a palette: it resolves to dark or light.
export const THEMES = ['system', 'dark', 'light', 'warm', 'contrast'];
const KEY = 'nasu.theme';

// <meta name="theme-color"> per resolved theme (browser chrome on phones).
const CHROME = { dark: '#0c2841', light: '#f3f6f9', contrast: '#000000', warm: '#f5eee3' };

/** Pure: the theme actually applied for a preference. */
export function resolveTheme(pref, prefersDark) {
  if (pref === 'system' || !THEMES.includes(pref)) return prefersDark ? 'dark' : 'light';
  return pref;
}

/** The palette in use right now (what "System" currently means). */
export const currentTheme = () => resolveTheme(getThemePreference(), media()?.matches ?? true);

export function getThemePreference() {
  try { const v = localStorage.getItem(KEY); return THEMES.includes(v) ? v : 'system'; } catch { return 'system'; }
}

const media = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');

export function applyTheme(pref = getThemePreference()) {
  const resolved = resolveTheme(pref, media()?.matches ?? true);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePref = pref;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[resolved]);
  document.dispatchEvent(new CustomEvent('nasu:theme', { detail: { pref, resolved } }));
  return resolved;
}

export function setThemePreference(pref) {
  if (!THEMES.includes(pref)) return;
  try { localStorage.setItem(KEY, pref); } catch { /* session only */ }
  applyTheme(pref);
}

// Follow the OS while the preference is "system".
media()?.addEventListener?.('change', () => {
  if (getThemePreference() === 'system') applyTheme('system');
  else document.dispatchEvent(new CustomEvent('nasu:theme', { detail: { pref: getThemePreference(), resolved: currentTheme() } }));
});
