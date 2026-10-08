// Localisation (English + Arabic, RTL) and theme preference.
// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../assets/js/i18n/en.js';
import ar from '../assets/js/i18n/ar.js';
import { t, detectLocale, LOCALES } from '../assets/js/i18n/index.js';
import { resolveTheme, THEMES } from '../assets/js/ui/theme.js';

const JS = fileURLToPath(new URL('../assets/js/', import.meta.url));
const files = (function walk(d) {
  return readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
})(JS).filter(p => !/[\\/]i18n[\\/]/.test(p));
const PLURAL = /\.(zero|one|two|few|many|other)$/;
const base = k => k.replace(PLURAL, '');
const has = (cat, k) => k in cat || `${k}.other` in cat;
const placeholders = s => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]));

test('every literal t() key used in the code exists in the English catalog', () => {
  const missing = [];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) if (!has(en, m[1])) missing.push(`${m[1]} (${f})`);
  }
  assert.deepEqual(missing, []);
});

test('English and Arabic catalogs have the same keys (ignoring plural forms)', () => {
  const a = new Set(Object.keys(en).map(base)), b = new Set(Object.keys(ar).map(base));
  assert.deepEqual([...a].filter(k => !b.has(k)), [], 'missing in Arabic');
  assert.deepEqual([...b].filter(k => !a.has(k)), [], 'missing in English');
  for (const k of Object.keys(ar)) {
    const e = en[k] ?? en[`${base(k)}.other`] ?? en[base(k)];
    for (const p of placeholders(e)) if (p !== 'count') assert.ok(placeholders(ar[k]).has(p), `${k}: {${p}} missing in Arabic`);
  }
});

test('every plural key has an "other" form in both languages', () => {
  for (const cat of [en, ar]) {
    for (const k of Object.keys(cat).filter(k => PLURAL.test(k))) assert.ok(`${base(k)}.other` in cat, k);
  }
});

test('dynamic key families are complete', () => {
  const families = {
    subject: ['math1', 'vib', 'stat', 'chem', 'soc', 'draw'],
    theme: THEMES,
    'experience': ['student', 'editor', 'review', 'admin'],
    'role': ['student', 'section_editor', 'content_manager', 'admin'],
    'status': ['draft', 'pending_review', 'approved', 'rejected', 'published', 'archived'],
    'quiz.status': ['open', 'upcoming', 'closed'],
    'activity.kind': ['workshop', 'competition', 'club', 'event'],
    'leaderboard.scope': ['section', 'group', 'university'],
  };
  for (const [prefix, ids] of Object.entries(families)) for (const id of ids) {
    assert.ok(`${prefix}.${id}` in en, `en ${prefix}.${id}`);
    assert.ok(`${prefix}.${id}` in ar, `ar ${prefix}.${id}`);
  }
});

test('t(): interpolation, English fallback and Arabic plural categories', () => {
  assert.equal(t('home.hello', { name: 'Sara' }, 'en'), 'Hello, Sara');
  assert.equal(t('home.hello', { name: 'Sara' }, 'ar'), 'مرحبًا، Sara');
  assert.equal(t('quiz.questions', { count: 1 }, 'en'), '1 question');
  assert.equal(t('quiz.questions', { count: 4 }, 'en'), '4 questions');
  assert.equal(t('quiz.questions', { count: 1 }, 'ar'), 'سؤال واحد');
  assert.equal(t('quiz.questions', { count: 2 }, 'ar'), 'سؤالان');
  assert.equal(t('quiz.questions', { count: 5 }, 'ar'), '5 أسئلة', 'few + Latin digits');
  assert.equal(t('quiz.questions', { count: 12 }, 'ar'), '12 سؤالًا', 'many');
  assert.equal(t('quiz.questions', { count: 100 }, 'ar'), '100 سؤال', 'other');
  assert.equal(t('no.such.key', null, 'ar'), 'no.such.key');
});

test('locale detection: saved choice, then browser languages, then English', () => {
  assert.equal(detectLocale('ar', ['en-US']), 'ar');
  assert.equal(detectLocale(null, ['ar-EG', 'en']), 'ar');
  assert.equal(detectLocale(null, ['fr-FR', 'en-GB']), 'en');
  assert.equal(detectLocale('xx', ['de']), 'en');
  assert.equal(LOCALES.ar.dir, 'rtl');
  assert.equal(LOCALES.en.dir, 'ltr');
});

test('index.html applies saved language/direction and theme before first paint', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /nasu\.lang/);
  assert.match(index, /nasu\.theme/);
  assert.match(index, /IBM\+Plex\+Sans\+Arabic/);
});

test('theme preference resolves to an applied theme', () => {
  assert.deepEqual(THEMES, ['system', 'dark', 'light', 'contrast', 'warm']);
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('contrast', false), 'contrast');
  assert.equal(resolveTheme('warm', true), 'warm');
  assert.equal(resolveTheme('bogus', false), 'light');
});

test('every applied theme defines the core tokens in the stylesheet', () => {
  const css = readFileSync(new URL('../assets/css/styles.css', import.meta.url), 'utf8');
  for (const th of ['light', 'contrast', 'warm']) {
    const block = css.match(new RegExp(`:root\\[data-theme="${th}"\\]\\s*\\{([^}]*)\\}`))?.[1] || '';
    for (const token of ['--bg', '--ink', '--ink-dim', '--accent-text', '--link']) assert.match(block, new RegExp(`${token}\\s*:`), `${th} ${token}`);
  }
});
