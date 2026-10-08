-- 01 · Schema inspection — READ-ONLY. Safe to run in the Supabase SQL editor.
-- Purpose: confirm the real columns, types, keys, triggers, RLS policies and
-- approval functions BEFORE any reconciliation query or migration is edited
-- to match them. Returns metadata only — no student rows.

-- 1. Columns and types (note whatsapp_number / phone types: bigint loses leading zeros)
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('applications', 'approved_students', 'university_students', 'profiles')
order by table_name, ordinal_position;

-- 2. Primary keys, foreign keys, unique and check constraints
select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.applications'::regclass, 'public.approved_students'::regclass,
                   'public.university_students'::regclass)
order by 1, 3, 2;

-- 3. Indexes
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('applications', 'approved_students', 'university_students')
order by 1, 2;

-- 4. Triggers
select event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('applications', 'approved_students', 'university_students')
order by 1, 2;

-- 5. Row level security status and policies
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('applications', 'approved_students', 'university_students');

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('applications', 'approved_students', 'university_students')
order by 1, 2;

-- 6. Functions that write to these tables (approval logic, sync, triggers)
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer, l.lanname as language
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and (p.prosrc ilike '%approved_students%' or p.prosrc ilike '%applications%')
order by 1;
-- Then read each body:  select pg_get_functiondef('public.<name>(<args>)'::regprocedure);

-- 7. Privileges granted to API roles
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('applications', 'approved_students', 'university_students')
  and grantee in ('anon', 'authenticated')
order by 1, 2, 3;

-- 8. Applied migrations (if the project uses the Supabase CLI)
select version, name from supabase_migrations.schema_migrations order by version desc limit 50;
