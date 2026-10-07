// Deep links into the Hub. The Hub is the system of record; announcements
// (and, later, posts in the WhatsApp "Updates" community) point students to a
// specific item here. Pure functions — no DOM.
//
// A link target is { type, id, subjectId? }. Unknown types or unsafe ids give
// null, so a bad link renders as nothing rather than a broken route.

import { subjectById } from '../data/catalog.js';

export const LINK_TYPES = ['subject', 'resource', 'assignment', 'announcement', 'quiz', 'activity'];

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const q = id => `?item=${encodeURIComponent(id)}`;

/** In-app route (without '#') for a link target, or null. */
export function hubPath(target) {
  if (!target || !LINK_TYPES.includes(target.type)) return null;
  const { type, id, subjectId } = target;
  if (type !== 'quiz' && type !== 'activity' && !SAFE_ID.test(String(id ?? ''))) return null;
  switch (type) {
    case 'subject':
      return subjectById(id) ? `/subjects/${id}` : null;
    case 'resource':
    case 'assignment':
      return subjectById(subjectId) ? `/subjects/${subjectId}${q(id)}` : null;
    case 'announcement':
      return `/announcements${q(id)}`;
    // Modules not built yet: land on their page; item-level routes come with the module.
    case 'quiz':
      return '/quizzes';
    case 'activity':
      return '/activities';
    default:
      return null;
  }
}

/** Absolute, shareable URL (e.g. to paste into an announcement). `base` = site origin + path. */
export function hubUrl(target, base) {
  const path = hubPath(target);
  return path ? `${base.replace(/#.*$/, '')}#${path}` : null;
}

export const LINK_LABELS = {
  subject: 'Open subject', resource: 'Open resource', assignment: 'View assignment',
  announcement: 'Open update', quiz: 'Take quiz', activity: 'View activity',
};

// Resource links may say what they point at (link_category), e.g. "Open board".
const CATEGORY_CTA = {
  lecture: 'Open lecture', tutorial: 'Open tutorial', board: 'Open board', pdf: 'Open PDF', assignment: 'View assignment',
};

/** The one contextual call-to-action for a link target, or null when there's no valid link. */
export function ctaLabel(target) {
  if (!hubPath(target)) return null;
  if (target.type === 'resource' && CATEGORY_CTA[target.category]) return CATEGORY_CTA[target.category];
  return LINK_LABELS[target.type];
}
