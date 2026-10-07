// Roles and editor scopes as the UI understands them. Pure functions (no DOM,
// no backend) so they can be unit-tested.
//
// UX ONLY — this decides what to SHOW, never what is ALLOWED. Every privileged
// read/write is authorised by the backend (RLS / RPC checks). Hiding a button
// here is a convenience, not a security boundary.

export const ROLES = {
  student:         { id: 'student',         label: 'Student' },
  section_editor:  { id: 'section_editor',  label: 'Section Editor' },
  content_manager: { id: 'content_manager', label: 'Content Manager' },
  admin:           { id: 'admin',           label: 'Admin' },
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

/* ---------- workspaces ---------- */

// Each staff workspace and the roles that see it. The student hub is not listed:
// it is available to anyone with a hub profile (unchanged behaviour).
export const WORKSPACES = [
  // Admins may create/upload content without the editor role or a scope (backend rule).
  { id: 'editor', label: 'Editor', roles: ['section_editor', 'admin'], home: '/editor' },
  { id: 'review', label: 'Review', roles: ['content_manager', 'admin'], home: '/review' },
  { id: 'admin',  label: 'Admin',  roles: ['admin'], home: '/admin' },
];

export const workspacesFor = roles => WORKSPACES.filter(w => hasAnyRole(roles, w.roles));
export const isStaff = roles => workspacesFor(roles).length > 0;

/** Where "Workspace" in the top bar goes: the most powerful workspace the user has. */
export function primaryWorkspace(roles) {
  const ws = workspacesFor(roles);
  return ws.length ? ws[ws.length - 1] : null;
}

/** Route guard (UX): a route with no `roles` is open to any signed-in user. */
export function routeAllowed(routeRoles, roles) {
  if (!routeRoles || !routeRoles.length) return true;
  return hasAnyRole(roles, routeRoles);
}

// Sidebar of the staff console, grouped by workspace. Only groups the user has.
const CONSOLE_ITEMS = {
  editor: [
    { href: '/editor', label: 'Overview', icon: 'grid' },
    { href: '/editor/uploads', label: 'My uploads', icon: 'list' },
    { href: '/editor/upload', label: 'Upload content', icon: 'upload' },
  ],
  review: [
    { href: '/review', label: 'Review queue', icon: 'inbox' },
    { href: '/review/history', label: 'Processed', icon: 'history' },
  ],
  admin: [
    { href: '/admin', label: 'Overview', icon: 'grid' },
    { href: '/admin/content', label: 'Content', icon: 'list' },
    { href: '/admin/team', label: 'Team & roles', icon: 'shield' },
    { href: '/admin/students', label: 'Students', icon: 'users' },
    { href: '/admin/activities', label: 'Activities', icon: 'flag' },
    { href: '/admin/quizzes', label: 'Quizzes', icon: 'quiz' },
    { href: '/admin/leaderboards', label: 'Leaderboards', icon: 'trophy' },
    { href: '/admin/audit', label: 'Audit log', icon: 'clock' },
  ],
};

export function consoleNav(roles) {
  return workspacesFor(roles).map(w => ({ id: w.id, label: w.label, items: CONSOLE_ITEMS[w.id] }));
}

/** The nav item that best matches `path` (longest href prefix), or null. */
export function activeConsoleHref(nav, path) {
  const hrefs = nav.flatMap(g => g.items.map(i => i.href));
  return hrefs
    .filter(h => path === h || path.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0] || null;
}

/* ---------- editor scopes ---------- */
// Scope = { subjectId, group, section }. `null` group/section = every group /
// every section of that subject (pending backend confirmation, see docs).

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
      return [{ value: null, label: 'All groups' }, ...allGroupNames.map(n => ({ value: n, label: n }))];
    }
    return [...new Set(mine.map(s => s.group))].map(n => ({ value: n, label: n }));
  }

  function sectionsFor(subjectId, group) {
    if (group == null) return [{ value: null, label: 'All sections' }];
    const mine = list.filter(s => s.subjectId === subjectId && sameOrAny(s.group, group));
    if (mine.some(s => s.section == null)) {
      const known = groups.find(g => g.name === group)?.sections || [];
      return [{ value: null, label: 'All sections' }, ...known.map(n => ({ value: n, label: n }))];
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
  `${s.group == null ? 'All groups' : s.group} · ${s.section == null ? 'All sections' : s.section}`;
