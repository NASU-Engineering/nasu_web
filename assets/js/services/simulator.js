// Role experience simulator — an admin testing tool.
//
// While a simulation is active, api.js routes EVERY call to the isolated mock
// backend (fake people, fake content, sessionStorage only). Nothing reaches
// Supabase, the real session is left untouched, and no real permission is
// granted: the persona's "roles" exist only inside the mock.
//
// Entering requires the backend to have reported the admin role for the real
// account (canUseSimulator). Exiting is always allowed.

import { hasRole } from './roles.js';

const KEY = 'nasu.sim';

// Mock people from mock-workspace.js. The student persona sits in the group /
// section the sample editor scope targets, so Editor → Reviewer → Student works.
export const PERSONAS = {
  student: {
    id: 'student', label: 'Student', experience: 'student', home: '/dashboard',
    roles: ['student'],
    person: { userId: 'mock-student', fullName: 'Sim Student', studentId: 'sim.student', group: 'Group A (sample)', section: 'Section 1' },
    text: 'Prep-year student: subjects, search, updates and published content for their group and section.',
  },
  editor: {
    id: 'editor', label: 'Section Editor', experience: 'editor', home: '/editor',
    roles: ['student', 'section_editor'],
    person: { userId: 'mock-user-0', fullName: 'Demo Student', studentId: 'demo.student', group: 'Group A (sample)', section: 'Section 1' },
    text: 'Uploads drafts for Mathematics I and Statics (Group A) and submits them for review.',
  },
  reviewer: {
    id: 'reviewer', label: 'Content Reviewer', experience: 'review', home: '/review',
    roles: ['student', 'content_manager'],
    person: { userId: 'mock-user-3', fullName: 'Sample Student 03', studentId: 'sample-0003', group: 'Group B (sample)', section: 'Section 4' },
    text: 'Previews pending submissions, approves or rejects them with a note, and publishes approved content.',
  },
  admin: {
    id: 'admin', label: 'Admin', experience: 'admin', home: '/admin',
    roles: ['student', 'admin'],
    person: { userId: 'mock-user-1', fullName: 'Sample Student 01', studentId: 'sample-0001', group: 'Group A (sample)', section: 'Section 2' },
    text: 'The Admin Control Center over mock data: students, staff & roles, content, audit log.',
  },
};

export const PERSONA_IDS = Object.keys(PERSONAS);

/** UX gate: only accounts the backend reports as admin, outside a simulation, when the tool is enabled. */
export function canUseSimulator(access, config) {
  return config?.features?.roleSimulator !== false
    && Boolean(access?.available)
    && !access?.simulated
    && hasRole(access?.roles, 'admin');
}

/** The mock session a persona signs in with (read by mock-backend.js / mock-workspace.js). */
export function personaSession(personaId, emailDomain) {
  const p = PERSONAS[personaId];
  if (!p) throw new Error(`unknown persona ${personaId}`);
  return {
    email: `${p.person.studentId}@${emailDomain}`,
    studentId: p.person.studentId,
    userId: p.person.userId,
    fullName: p.person.fullName,
    group: p.person.group,
    section: p.person.section,
    mock: true,
    simulated: true,
  };
}

/* ---------- state (sessionStorage: per tab, gone when the tab closes) ---------- */

let memory = null;
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return memory; } };
const write = v => { memory = v; try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch { /* memory only */ } };

/** { personaId, restore } while simulating, else null. */
export function currentSimulation() {
  const s = read();
  return s && PERSONAS[s.personaId] ? s : null;
}

export const isSimulating = () => currentSimulation() !== null;

/** `restore` = whatever the mock store held before, put back on exit (dev mock mode). */
export function startSimulation(personaId, restore = null) {
  if (!PERSONAS[personaId]) throw new Error(`unknown persona ${personaId}`);
  const prev = currentSimulation();
  write({ personaId, restore: prev ? prev.restore : restore });
}

export function stopSimulation() {
  const s = currentSimulation();
  write(null);
  return s?.restore ?? null;
}
