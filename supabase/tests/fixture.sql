-- ISOLATED TEST DATABASE ONLY (PGlite, in memory). Synthetic data — no real people,
-- codes or phone numbers. Emulates:
--   * the Supabase pieces the migrations rely on: roles anon / authenticated /
--     service_role, auth.users, auth.uid() from the request JWT claim
--   * the production tables AS DESCRIBED by the backend owner (names to be confirmed
--     against supabase/inspection/01 before any real run), including the known bug:
--     sync_approved_student() creates the approved row WITHOUT the phone.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text unique, last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Existing identity model (stand-in): profiles + user_roles behind the two RPCs.
create table public.profiles (id uuid primary key references auth.users(id), full_name text, student_id text, group_name text, section text);
create table public.user_roles (user_id uuid references auth.users(id), role text, primary key (user_id, role));
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create function public.get_my_profile()
returns table (full_name text, student_id text, group_name text, section text)
language sql stable security definer set search_path = '' as $$
  select p.full_name, p.student_id, p.group_name, p.section from public.profiles p where p.id = auth.uid()
$$;
create function public.get_my_access()
returns table (roles text[], scopes jsonb)
language sql stable security definer set search_path = '' as $$
  select array['student'] || coalesce(array(select r.role from public.user_roles r where r.user_id = auth.uid() order by r.role), '{}'),
         '[]'::jsonb
  where auth.uid() is not null
$$;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_my_access() to authenticated;

-- Admissions (as described): phone stored as bigint (loses the leading zero).
create table public.university_students (student_code text primary key);
create table public.applications (
  id bigint generated always as identity primary key,
  student_code text not null,
  full_name text,
  whatsapp_number bigint,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create table public.approved_students (
  id bigint generated always as identity primary key,
  application_id bigint not null unique references public.applications(id),
  student_code text not null unique,
  full_name text,
  whatsapp_number bigint,
  approved_at timestamptz not null default now()
);
alter table public.applications enable row level security;
alter table public.approved_students enable row level security;
alter table public.university_students enable row level security;

-- The known bug: copies code and name, NOT the phone.
create function public.sync_approved_student() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.approved_students (application_id, student_code, full_name)
    values (new.id, new.student_code, new.full_name)
    on conflict (application_id) do nothing;
  end if;
  return null;
end $$;
create trigger sync_approved_student after update of status on public.applications
  for each row execute function public.sync_approved_student();

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid, action text not null, entity_type text, entity_id text, metadata jsonb, created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
