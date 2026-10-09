// Isolated database for the prepared migrations: PGlite (Postgres 17 in WASM, in
// memory). Nothing here can reach a real database — there is no network driver.
//
//   npm install            (dev dependency @electric-sql/pglite)
//   npm run test:db
//
// Synthetic data only. It reproduces the VERIFIED PRODUCTION COUNTS (59 approved,
// all without a phone; 57 recoverable, 2 for manual review) with invented values.

import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const prepared = new URL('../prepared/', import.meta.url);
export const MIGRATIONS = [
  '20261010_00_common.sql',
  '20261010_01_whatsapp_text_and_sync.sql',
  '20261010_02_activity_presence.sql',
  '20261010_03_engagement.sql',
  '20261010_04_intake_and_applications.sql',
];

export async function loadPGlite() {
  try { return (await import('@electric-sql/pglite')).PGlite; } catch { return null; }
}

export const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ADMIN = uid(1);
export const EDITOR = uid(2);

/** Fresh database with the fixture and synthetic seed. */
export async function freshDb(PGlite) {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('fixture.sql', here), 'utf8'));
  await seed(db);
  return db;
}

async function seed(db) {
  // 70 people with auth accounts; 1 = admin, 2 = editor, 3..61 = approved students.
  const people = [];
  for (let i = 1; i <= 70; i++) people.push(`('${uid(i)}', 'user${i}@example.test')`);
  await db.exec(`insert into auth.users (id, email) values ${people.join(',')};`);
  // Roster: codes T0001..T0064 (synthetic). Applications 1..66; 60..66 stay pending.
  const roster = Array.from({ length: 64 }, (_, i) => `('T${String(i + 1).padStart(4, '0')}')`);
  await db.exec(`insert into public.university_students (student_code) values ${roster.join(',')};`);
  const apps = [];
  for (let i = 1; i <= 66; i++) {
    // Phones as a bigint column holds them: 10-digit (lost leading 0) or 12-digit (20…).
    let phone = i % 2 ? 1000000000 + i * 1111 : 201100000000 + i * 777;
    if (i === 58) phone = 12345;            // too short → manual review
    if (i === 59) phone = 966501234567;     // foreign number → manual review
    // codes 65 and 66 are NOT in the roster
    apps.push(`('T${String(i).padStart(4, '0')}', 'Student ${i} Example', ${phone})`);
  }
  await db.exec(`insert into public.applications (student_code, full_name, whatsapp_number) values ${apps.join(',')};`);
  // Approve 1..59 through the existing (buggy) trigger: approved rows get NO phone.
  await db.exec(`update public.applications set status = 'approved' where id <= 59;`);
  // Profiles for the approved students (users 3..61 ↔ applications 1..59).
  const profiles = [];
  for (let i = 1; i <= 59; i++) {
    const group = i <= 30 ? 'Group A' : 'Group B';
    const section = `Section ${(i % 3) + 1}`;
    profiles.push(`('${uid(i + 2)}', 'Student ${i} Example', 'T${String(i).padStart(4, '0')}', '${group}', '${section}')`);
  }
  await db.exec(`insert into public.profiles (id, full_name, student_id, group_name, section) values
    ('${ADMIN}', 'Admin Person', 'A0001', 'Group A', 'Section 1'),
    ('${EDITOR}', 'Editor Person', 'E0001', 'Group A', 'Section 1'), ${profiles.join(',')};`);
  await db.exec(`insert into public.user_roles values ('${ADMIN}', 'admin'), ('${EDITOR}', 'section_editor');`);
}

/** Applies the prepared migrations exactly as the runbook does (hub.apply = 'yes'). */
export async function migrate(db, { only = MIGRATIONS, expectedBackfill = 57 } = {}) {
  for (const file of only) {
    const sql = readFileSync(new URL(file, prepared), 'utf8');
    await db.exec(`reset role; set hub.apply = 'yes'; set hub.expected_backfill = '${expectedBackfill}';`);
    try { await db.transaction(async tx => { await tx.exec(sql); }); }
    catch (err) { throw new Error(`${file}: ${err.message}`); }
  }
}

/** Runs `fn` as an authenticated user (JWT sub = id), then returns to the superuser. */
export async function as(db, id, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
export async function asRole(db, role, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}

export const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
export const val = async (db, sql, params) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
