// Role experience simulator: gate, isolation and exit. Runs against the shipped
// config (real backend = Supabase), which can't load under Node — so any call
// that reaches the real backend fails with 'network'. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser globals: a working sessionStorage (the mock keeps its data there).
const mem = new Map();
globalThis.sessionStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
globalThis.location ??= { href: 'http://example.test/', hostname: 'example.test', origin: 'http://example.test', pathname: '/', search: '', hash: '' };

const sim = await import('../assets/js/services/simulator.js');
const { api } = await import('../assets/js/services/api.js');
const { CONFIG } = await import('../assets/js/config.js');

const ADMIN = { roles: ['student', 'admin'], scopes: [], available: true };

test('only an account the backend reports as admin may open the simulator', () => {
  assert.equal(sim.canUseSimulator(ADMIN, CONFIG), true);
  assert.equal(sim.canUseSimulator({ ...ADMIN, roles: ['student', 'content_manager'] }, CONFIG), false);
  assert.equal(sim.canUseSimulator({ ...ADMIN, available: false }, CONFIG), false, 'no backend answer → closed');
  assert.equal(sim.canUseSimulator({ ...ADMIN, simulated: true }, CONFIG), false, 'a simulated admin cannot bootstrap the simulator');
  assert.equal(sim.canUseSimulator(ADMIN, { features: { roleSimulator: false } }), false);
  assert.equal(sim.canUseSimulator(null, CONFIG), false);
});

test('personas cover the four experiences with the expected mock roles', () => {
  assert.deepEqual(sim.PERSONA_IDS, ['student', 'editor', 'reviewer', 'admin']);
  assert.deepEqual(Object.values(sim.PERSONAS).map(p => p.experience), ['student', 'editor', 'review', 'admin']);
  assert.deepEqual(sim.PERSONAS.student.roles, ['student']);
  const s = sim.personaSession('editor', 'nasu.edu.eg');
  assert.equal(s.simulated, true);
  assert.equal(s.mock, true);
  assert.match(s.email, /@nasu\.edu\.eg$/);
  assert.throws(() => sim.personaSession('root', 'x'));
});

test('outside a simulation, calls go to the real backend', async () => {
  assert.equal(api.sim.current(), null);
  await assert.rejects(api.auth.getSession(), e => e.code === 'network', 'real Supabase path (unavailable under Node)');
});

test('entering is refused without real admin access, and nothing changes', async () => {
  await assert.rejects(api.sim.enter('student', { roles: ['student'], available: true }), e => e.code === 'forbidden');
  await assert.rejects(api.sim.enter('admin', { ...ADMIN, simulated: true }), e => e.code === 'forbidden');
  await assert.rejects(api.sim.enter('nobody', ADMIN), e => e.code === 'invalid');
  assert.equal(api.sim.current(), null);
  assert.equal(mem.has('nasu.mock.session'), false);
});

test('inside a simulation every call is served by the isolated mock, as the persona', async () => {
  await api.sim.enter('reviewer', ADMIN);
  assert.equal(api.sim.current().id, 'reviewer');
  const session = await api.auth.getSession();
  assert.equal(session.simulated, true);
  const access = await api.access.getMine(session);
  assert.deepEqual(access.roles, ['student', 'content_manager']);
  assert.equal(access.simulated, true, 'simulated access is marked and can never re-open the simulator');
  // persona permissions are enforced by the mock exactly like the backend would
  const queue = await api.review.listQueue();
  assert.ok(queue.items.length > 0);
  await assert.rejects(api.admin.getStats(), e => e.code === 'forbidden');
  await assert.rejects(api.editor.listMine(), e => e.code === 'forbidden');
  // switching persona inside a simulation is allowed and changes nothing real
  await api.sim.enter('student');
  assert.deepEqual((await api.access.getMine(await api.auth.getSession())).roles, ['student']);
});

test('exiting restores the real backend and removes the persona session', async () => {
  api.sim.exit();
  assert.equal(api.sim.current(), null);
  assert.equal(mem.has('nasu.mock.session'), false);
  await assert.rejects(api.auth.getSession(), e => e.code === 'network');
});

test('signing out always leaves the simulator first', async () => {
  await api.sim.enter('admin', ADMIN);
  await api.auth.signOut().catch(() => {}); // real sign-out can't reach Supabase under Node
  assert.equal(api.sim.current(), null);
});
