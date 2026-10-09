// Dates, times and relative days in the current language (Intl, cached per locale).

import { t, intlLocale } from '../i18n/index.js';

const cache = new Map();
function fmt(kind, options) {
  const key = `${intlLocale()}|${kind}`;
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(intlLocale(), options));
  return cache.get(key);
}

const dayDiff = iso => Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);

export function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.getFullYear() === new Date().getFullYear()
    ? fmt('dm', { day: 'numeric', month: 'short' }).format(d)
    : fmt('dmy', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function relativeDays(iso) {
  if (!iso) return '';
  const days = dayDiff(iso);
  if (days === 0) return t('time.today');
  if (days === 1) return t('time.tomorrow');
  if (days === -1) return t('time.yesterday');
  return days > 0 ? t('time.inDays', { count: days }) : t('time.daysAgo', { count: -days });
}

export const pad2 = n => String(n).padStart(2, '0');

export const timeOfDay = iso => fmt('hm', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** "Today, 14:30" · "Yesterday, 09:10" · "8 Oct, 14:30" (localised) */
export function dateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const days = dayDiff(iso);
  const day = days === 0 ? t('time.today') : days === -1 ? t('time.yesterday') : shortDate(iso);
  return t('time.dayAtTime', { day, time: timeOfDay(iso) });
}

/** Weekday + date + time, e.g. "Thu 15 Oct, 10:00" (activities). */
export function eventDateTime(iso) {
  if (!iso) return '';
  return fmt('event', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "just now" · "5 min ago" · "3 h ago" · then dateTime() (localised). */
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const ms = now - Date.parse(iso);
  if (isNaN(ms)) return '';
  const mins = Math.floor(ms / 6e4);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minutesAgo', { count: mins });
  if (mins < 24 * 60) return t('time.hoursAgo', { count: Math.floor(mins / 60) });
  return dateTime(iso);
}
