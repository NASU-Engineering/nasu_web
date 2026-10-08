// Roles and editor scopes as the UI understands them. Pure functions (no DOM,
// no backend) so they can be unit-tested.
//
// UX ONLY — this decides what to SHOW, never what is ALLOWED. Every privileged
// read/write is authorised by the backend (RLS / RPC checks). Hiding a button
// here is a convenience, not a security boundary.

import { t } from '../i18n/index.js';

export const ROLES = {
  student:         { id: 'student',         get label() { return t('role.student'); } },
  section_editor:  { id: 'section_editor',  get label() { return t('role.section_editor'); } },
  content_manager: { id: 'content_manager', get label() { return t('role.content_manager'); } },
  admin:           { id: 'admin',           get label() { return t('role.admin'); } },
};

export const ROLE_IDS = Object.keys(ROLES);

// Roles an admin may grant / revoke from Team & Roles.
export const ASSIGNABLE_ROLES = ['section_editor', 'content_manager'];

export const roleLabel = id => ROLES[id]?.label || id;

/** Known role ids only, lower-cased, de-duplicated, in ROLE_IDS order. Unknown values are dropped. */
export function normalizeRoles(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set(
    list.map(r => (typeof r === 'string' ? r : r?.role))
      .filter(r => typeof r === 'string')
      .map(r => r.trim().toLowerCase()),
  );
  return ROLE_IDS.filter(id => seen.has(id));
}

export const hasRole = (roles, role) => Array.isArray(roles) && roles.includes(role);
export const hasAnyRole = (roles, wanted) => wanted.some(r => hasRole(roles, r));

/* ---------- route guard ---------- */

// Experiences and their navigation live in experiences.js.

/** Route guard (UX): a route with no `roles` is open to any signed-in user. */
export function routeAllowed(routeRoles, roles) {
  if (!routeRoles || !routeRoles.length) return true;
  return hasAnyRole(roles, routeRoles);
}

/* ---------- editor scopes ---------- */
// Scope = { subjectId, group, section }. `null` group/section = every group /
// every section of that subject (confirmed by backend Phase 1).

const sameOrAny = (scopeValue, value) => scopeValue == null || scopeValue === value;

/** True if a target { subjectId, group, section } falls inside any scope. UX pre-check only. */
export function inScope(scopes, { subjectId, group, section }) {
  return (scopes || []).some(s =>
    // a target of "all groups/sections" (null) only fits a scope that also covers all of them
    s.subjectId === subjectId && sameOrAny(s.group, group ?? null) && sameOrAny(s.section, section ?? null));
}

/**
 * Options for the upload form's cascading selects, limited to the editor's scopes.
 * `groups` = [{ name, sections: [..] }] from the backend catalog (used to expand wildcards).
 * Returns { subjects: [id], groupsFor(subjectId) -> [{ value, label }], sectionsFor(subjectId, group) -> [...] }.
 * value null = "All groups" / "All sections".
 */
export function scopeOptions(scopes, groups = []) {
  const list = scopes || [];
  const subjects = [...new Set(list.map(s => s.subjectId))];
  const allGroupNames = groups.map(g => g.name);

  function groupsFor(subjectId) {
    const mine = list.filter(s => s.subjectId === subjectId);
    if (mine.some(s => s.group == null)) {
      return [{ value: null, label: t('scope.allGroups') }, ...allGroupNames.map(n => ({ value: n, label: n }))];
    }
    return [...new Set(mine.map(s => s.group))].map(n => ({ value: n, label: n }));
  }

  function sectionsFor(subjectId, group) {
    if (group == null) return [{ value: null, label: t('scope.allSections') }];
    const mine = list.filter(s => s.subjectId === subjectId && sameOrAny(s.group, group));
    if (mine.some(s => s.section == null)) {
      const known = groups.find(g => g.name === group)?.sections || [];
      return [{ value: null, label: t('scope.allSections') }, ...known.map(n => ({ value: n, label: n }))];
    }
    return [...new Set(mine.map(s => s.section))].map(n => ({ value: n, label: n }));
  }

  return { subjects, groupsFor, sectionsFor };
}

/**
 * Scopes the upload form should offer. Admins are unrestricted (every subject,
 * all groups/sections); section editors get their assigned scopes. UX only.
 */
export function uploadScopes(access, subjectIds) {
  if (hasRole(access?.roles, 'admin')) return subjectIds.map(subjectId => ({ subjectId, group: null, section: null }));
  return hasRole(access?.roles, 'section_editor') ? access.scopes || [] : [];
}

export const scopeLabel = s =>
  `${s.group == null ? t('scope.allGroups') : s.group} · ${s.section == null ? t('scope.allSections') : s.section}`;
