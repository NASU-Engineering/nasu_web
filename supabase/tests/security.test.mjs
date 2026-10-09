// Security properties of everything the prepared migrations create.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPGlite, freshDb, migrate, as, uid, ADMIN, MIGRATIONS, val } from './harness.mjs';

const PGlite = await loadPGlite();
const skip = PGlite ? false : 'PGlite not installed (npm install)';
const NEW_SCHEMAS = ['hub_private', 'hub_activity', 'engage', 'intake', 'ops_backup'];
let db;

before(async () => {
  if (!PGlite) return;
  db = await freshDb(PGlite);
  await migrate(db);
});

test('every table in the new schemas has RLS enabled and no API-role privileges', { skip }, async () => {
  const tables = (await db.query(`select n.nspname as s, c.relname as t, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                  where c.relkind = 'r' and n.nspname = any($1)`, [NEW_SCHEMAS])).rows;
  assert.ok(tables.length >= 15);
  const noRls = tables.filter(t => !t.rls && t.s !== 'ops_backup').map(t => `${t.s}.${t.t}`);
  assert.deepEqual(noRls, []);
  const grants = (await db.query(`select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants
                                  where table_schema = any($1) and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')`, [NEW_SCHEMAS])).rows;
  assert.deepEqual(grants, [], 'tables are reached only through RPCs');
  const schemaUsage = (await db.query(`select n.nspname from pg_namespace n where n.nspname = any($1)
      and (has_schema_privilege('anon', n.oid, 'USAGE') or has_schema_privilege('authenticated', n.oid, 'USAGE'))`, [NEW_SCHEMAS])).rows;
  assert.deepEqual(schemaUsage, []);
});

test('every SECURITY DEFINER function pins search_path; anon can execute none of the new RPCs', { skip }, async () => {
  const defs = (await db.query(`select n.nspname || '.' || p.proname as f, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                where p.prosecdef and n.nspname = any($1 || '{public}'::text[]) and p.proname not in ('get_my_profile', 'get_my_access', 'sync_approved_student')`, [NEW_SCHEMAS])).rows;
  assert.ok(defs.length >= 30);
  const unpinned = defs.filter(d => !(d.proconfig || []).some(c => c.startsWith('search_path='))).map(d => d.f);
  assert.deepEqual(unpinned, []);
  const anonExec = (await db.query(`select n.nspname || '.' || p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                    where (n.nspname = any($1) or (n.nspname = 'public' and p.proname not in ('get_my_profile', 'get_my_access', 'sync_approved_student')))
                                      and has_function_privilege('anon', p.oid, 'EXECUTE')`, [NEW_SCHEMAS])).rows.map(r => r.f);
  assert.deepEqual(anonExec, []);
  const authExecPrivate = (await db.query(`select n.nspname || '.' || p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                           where n.nspname = any($1) and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                                             and p.proname not in ('display_name', 'norm_code', 'eg_mobile_e164', 'level_info', 'score_bonus', 'quiz_state', 'visible_to')`, [NEW_SCHEMAS])).rows.map(r => r.f);
  assert.deepEqual(authExecPrivate, [], 'internal helpers are not callable by signed-in users (schema usage is revoked anyway)');
});

test('roles are re-read on every call: revoking admin takes effect immediately (mid-session)', { skip }, async () => {
  const OTHER = uid(7);
  await db.exec(`insert into public.user_roles values ('${OTHER}', 'admin')`);
  await as(db, OTHER, () => db.query('select public.admin_activity_summary()'));
  await db.exec(`delete from public.user_roles where user_id = '${OTHER}' and role = 'admin'`);
  await assert.rejects(as(db, OTHER, () => db.query('select public.admin_activity_summary()')), /requires role/);
});

test('JWT metadata cannot grant roles: only get_my_access decides', { skip }, async () => {
  const S = uid(8);
  await db.exec(`reset role; select set_config('request.jwt.claims', '{"role":"admin","app_metadata":{"roles":["admin"]},"user_metadata":{"roles":["admin"]}}', false)`);
  await assert.rejects(as(db, S, () => db.query('select public.admin_application_summary()')), /requires role/);
  await db.exec(`select set_config('request.jwt.claims', '', false)`);
});

test('an expired / missing session gets nothing', { skip }, async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role authenticated;`);
  try {
    await assert.rejects(db.query('select public.get_my_progress()'), /not signed in/);
    await assert.rejects(db.query('select public.record_presence()'), /not signed in/);
    await assert.rejects(db.query('select public.admin_list_applications()'), /not signed in/);
  } finally { await db.exec('reset role;'); }
});

test('every migration is a dry run unless hub.apply = yes', { skip }, async () => {
  const fresh = await freshDb(PGlite);
  for (const file of MIGRATIONS) {
    const sql = readFileSync(new URL(`../prepared/${file}`, import.meta.url), 'utf8');
    await fresh.exec("reset role; reset hub.apply; set hub.expected_backfill = '57';");
    await assert.rejects(fresh.transaction(tx => tx.exec(sql)), /DRY RUN complete|preflight/, file);
  }
  assert.equal(Number(await val(fresh, `select count(*) from pg_namespace where nspname in ('hub_private', 'engage', 'intake', 'hub_activity')`)), 0, 'nothing persisted');
});

test('admin RPCs exist only behind the admin role check', { skip }, async () => {
  const admins = (await db.query(`select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname = 'public' and (p.proname like 'admin\\_%' or p.proname = 'confirm_attendance')`)).rows;
  assert.ok(admins.length >= 10);
  for (const f of admins) assert.match(f.def, /hub_private\.require_role\('admin'\)/, f.proname);
  await as(db, ADMIN, () => db.query('select public.admin_activity_summary()'));
});

test('full rollback leaves no trace of 02–04 (and 00 once 01 is rolled back)', { skip }, async () => {
  const fresh = await freshDb(PGlite);
  await migrate(fresh);
  await fresh.exec("reset role; set hub.apply = 'yes';");
  await fresh.transaction(tx => tx.exec(readFileSync(new URL('../prepared/20261010_01_rollback.sql', import.meta.url), 'utf8')));
  await fresh.transaction(tx => tx.exec(readFileSync(new URL('../prepared/20261010_02_03_04_rollback.sql', import.meta.url), 'utf8')));
  assert.equal(Number(await val(fresh, `select count(*) from pg_namespace where nspname in ('hub_private', 'engage', 'intake', 'hub_activity')`)), 0);
  assert.equal(Number(await val(fresh, `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname not in ('get_my_profile', 'get_my_access', 'sync_approved_student')`)), 0);
  assert.equal(Number(await val(fresh, `select count(*) from pg_trigger where not tgisinternal and tgname <> 'sync_approved_student'`)), 0);
  assert.equal(Number(await val(fresh, 'select count(*) from public.approved_students')), 59, 'production rows untouched');
});
