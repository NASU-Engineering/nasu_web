// Internationalisation: English + Arabic (RTL).
//
//   t('nav.home')                          → "Home" / "الرئيسية"
//   t('editor.uploadsCount', { count: 3 })  → plural form chosen with Intl.PluralRules
//   t('hello', { name: 'Sara' })           → "{name}" placeholders filled in
//
// Catalogs are flat { key: string } maps (i18n/en.js, i18n/ar.js). Missing keys
// fall back to English, then to the key itself (and are reported in dev).
// No DOM access at import time, so pure modules and Node tests can use t().

import en from './en.js';
import ar from './ar.js';

export const LOCALES = {
  en: { id: 'en', label: 'English', dir: 'ltr', intl: 'en-GB' },
  // Arabic text with Latin digits, which match course codes, IDs and times.
  ar: { id: 'ar', label: 'العربية', dir: 'rtl', intl: 'ar-EG-u-nu-latn' },
};
const CATALOGS = { en, ar };
const KEY = 'nasu.lang';

/** Pure: saved preference wins, then the first supported browser language, then English. */
export function detectLocale(saved, browserLanguages = []) {
  if (LOCALES[saved]) return saved;
  for (const tag of browserLanguages || []) {
    const base = String(tag || '').toLowerCase().split('-')[0];
    if (LOCALES[base]) return base;
  }
  return 'en';
}

function savedLocale() {
  try { return globalThis.localStorage?.getItem(KEY) || null; } catch { return null; }
}

let current = detectLocale(savedLocale(), globalThis.navigator?.languages || [globalThis.navigator?.language]);
const listeners = new Set();

export const getLocale = () => current;
export const localeInfo = (id = current) => LOCALES[id] || LOCALES.en;
export const intlLocale = () => localeInfo().intl;
export const isRtl = () => localeInfo().dir === 'rtl';

/** Applies lang/dir to <html>. Safe to call before the app renders. */
export function applyLocale(id = current) {
  const doc = globalThis.document;
  if (!doc) return;
  doc.documentElement.lang = id;
  doc.documentElement.dir = localeInfo(id).dir;
}

export function setLocale(id) {
  if (!LOCALES[id]) return;
  current = id;
  try { globalThis.localStorage?.setItem(KEY, id); } catch { /* session only */ }
  applyLocale(id);
  listeners.forEach(cb => cb(id));
}

export function onLocaleChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

const pluralCache = new Map();
function pluralCategory(locale, n) {
  if (!pluralCache.has(locale)) pluralCache.set(locale, new Intl.PluralRules(locale));
  return pluralCache.get(locale).select(n);
}

function lookup(locale, key, params) {
  const cat = CATALOGS[locale] || {};
  if (params && typeof params.count === 'number') {
    const form = cat[`${key}.${pluralCategory(locale, params.count)}`] ?? cat[`${key}.other`];
    if (form != null) return form;
  }
  return cat[key];
}

const isDev = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

/** Translates `key` in the current (or given) locale, filling {placeholders}. */
export function t(key, params = null, locale = current) {
  let text = lookup(locale, key, params);
  if (text == null && locale !== 'en') text = lookup('en', key, params);
  if (text == null) {
    if (isDev) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (params[name] == null ? m : formatParam(params[name], locale)));
}

function formatParam(v, locale) {
  return typeof v === 'number' ? new Intl.NumberFormat(LOCALES[locale]?.intl || 'en-GB').format(v) : String(v);
}

/** Number formatted for the current locale (Latin digits in both languages). */
export const formatNumber = n => new Intl.NumberFormat(intlLocale()).format(n);

/** All keys of a catalog (tests). */
export const catalogKeys = id => Object.keys(CATALOGS[id] || {});
