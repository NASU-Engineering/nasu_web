// Deep links into the Hub. The Hub is the system of record; announcements
// (and, later, posts in the WhatsApp "Updates" community) point students to a
// specific item here. Pure functions — no DOM.
//
// A link target is { type, id, subjectId? }. Unknown types or unsafe ids give
// null, so a bad link renders as nothing rather than a broken route.

import { subjectById } from '../data/catalog.js';
import { t } from '../i18n/index.js';

export const LINK_TYPES = ['subject', 'resource', 'assignment', 'announcement', 'quiz', 'activity'];

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const q = id => `?item=${encodeURIComponent(id)}`;

/** In-app route (without '#') for a link target, or null. */
export function hubPath(target) {
  if (!target || !LINK_TYPES.includes(target.type)) return null;
  const { type, id, subjectId } = target;
  const safeId = SAFE_ID.test(String(id ?? ''));
  if (!safeId && type !== 'quiz' && type !== 'activity') return null;
  switch (type) {
    case 'subject':
      return subjectById(id) ? `/subjects/${id}` : null;
    case 'resource':
    case 'assignment':
      return subjectById(subjectId) ? `/subjects/${subjectId}${q(id)}` : null;
    case 'announcement':
      return `/announcements${q(id)}`;
    // A specific quiz/activity when the id is safe, otherwise their list.
    case 'quiz':
      return safeId ? `/quizzes/${id}` : '/quizzes';
    case 'activity':
      return safeId ? `/activities${q(id)}` : '/activities';
    default:
      return null;
  }
}

/** Absolute, shareable URL (e.g. to paste into an announcement). `base` = site origin + path. */
export function hubUrl(target, base) {
  const path = hubPath(target);
  return path ? `${base.replace(/#.*$/, '')}#${path}` : null;
}

const CTA_CATEGORIES = ['lecture', 'tutorial', 'board', 'pdf', 'assignment'];

/** The one contextual call-to-action for a link target, or null when there's no valid link. */
export function ctaLabel(target) {
  if (!hubPath(target)) return null;
  if (target.type === 'resource' && CTA_CATEGORIES.includes(target.category)) return t(`cta.category.${target.category}`);
  return t(`cta.${target.type}`);
}
