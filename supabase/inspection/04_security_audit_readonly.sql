-- 04 · Supabase security audit — READ-ONLY (SELECT only, no data values).
-- Run in the SQL editor (or psql) as the project owner. Each query returns the
-- objects that need attention; an empty result means that check passed.
-- Findings template: docs/SECURITY_AUDIT.md (classify Critical / High / Medium / Low).

-- A1 · Tables in exposed schemas WITHOUT row-level security            (Critical if student data)
select n.nspname as schema, c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname in ('public', 'storage', 'graphql_public')
  and not c.relrowsecurity
order by 1, 2;

-- A2 · RLS enabled but FORCE not set on tables the API can reach (owner bypass is fine; listed for review)
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname = 'public' order by 2;

-- A3 · Policies that allow everything (USING true / WITH CHECK true)    (High for write, Medium for read)
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where coalesce(qual, '') in ('true', '(true)') or coalesce(with_check, '') in ('true', '(true)')
order by 1, 2, 3;

-- A4 · Policies granted to anon on student tables                       (Critical unless intended public content)
select schemaname, tablename, policyname, cmd, roles
from pg_policies where 'anon' = any(roles) or 'public' = any(roles)
order by 1, 2;

-- A5 · Policies that trust user-editable JWT metadata                   (Critical: privilege escalation)
select schemaname, tablename, policyname, qual, with_check
from pg_policies
where coalesce(qual, '') ~* 'user_metadata|raw_user_meta_data' or coalesce(with_check, '') ~* 'user_metadata|raw_user_meta_data';

-- A6 · Table privileges for anon / authenticated (direct API access)    (review each; RLS must cover it)
select table_schema, table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated') and table_schema = 'public'
group by 1, 2, 3 order by 2, 3;

-- B1 · SECURITY DEFINER functions without a pinned search_path          (High: search_path hijack)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions', 'graphql', 'vault', 'pgsodium')
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
order by 1, 2;

-- B2 · Functions anon may execute in public                             (each must be meant for signed-out visitors)
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;

-- B3 · Privileged RPCs: does each admin_* / review / publish function check the caller's role?
--      (heuristic — read the bodies listed here; any without a role check is High/Critical)
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       (pg_get_functiondef(p.oid) ~* 'has_role|require_role|is_admin|user_roles|get_my_access|auth\.uid') as mentions_role_or_uid
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname ~ 'review|publish|grant|revoke|scope')
order by 3, 1;

-- B4 · Functions that take a user id / student id argument (possible IDOR — must not trust it for "who am I")
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and pg_get_function_identity_arguments(p.oid) ~* '(user|student|profile)_?id'
order by 1;

-- C1 · Who holds which role (counts only) and roles with no holder
select role, count(*) from public.user_roles group by role order by 1;   -- adjust table name if different

-- C2 · Can a user grant roles to themselves? (look for INSERT/UPDATE policies on the role table)
select policyname, cmd, roles, qual, with_check from pg_policies where tablename in ('user_roles', 'roles', 'profiles');

-- D1 · Storage buckets: public buckets and size/MIME limits             (High if content-files is public)
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

-- D2 · Storage policies                                                 (check scope: owner / role / bucket)
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'storage' order by 1;

-- E1 · Realtime: tables published to realtime (any student table here is visible to subscribers per RLS)
select pubname, schemaname, tablename from pg_publication_tables where pubname like 'supabase_realtime%' order by 2, 3;

-- E2 · Realtime authorization policies (private channels), if used
select policyname, cmd, roles, qual from pg_policies where schemaname = 'realtime';

-- F1 · Audit coverage: action names recorded in the last 30 days (counts only)
select action, count(*) from public.audit_logs where created_at > now() - interval '30 days' group by 1 order by 2 desc;

-- F2 · Extensions installed (unexpected ones can widen the attack surface)
select extname, extversion from pg_extension order by 1;

-- G1 · How a Microsoft sign-in becomes an approved student                   (Critical to confirm)
--      Read both definitions. Authorization must rest on a verified link
--      (auth.users.id → profile / approved_students row created by an admin
--      decision), NOT on "any account whose email ends in @nasu.edu.eg" and NOT
--      on raw_user_meta_data. Also confirm the Azure provider is single-tenant.
select pg_get_functiondef('public.get_my_profile()'::regprocedure);
select pg_get_functiondef('public.get_my_access()'::regprocedure);

-- G2 · Auth hooks / triggers on auth.users (account creation must not grant access by itself)
select tgname, pg_get_triggerdef(t.oid) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;

-- G3 · The approval function this migration set relies on (read before applying 20261010_01)
select pg_get_functiondef(p.oid) from pg_proc p where p.proname = 'sync_approved_student';
