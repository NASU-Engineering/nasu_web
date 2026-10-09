-- 20261010_00 · Shared private helpers — PREPARED, NOT APPLIED.
--
-- Used by migrations 01–05. Lives in schema hub_private, which PostgREST does
-- not expose (only `public` is in the API), so nothing here is callable from the
-- browser directly. Roles and identity are read through the EXISTING RPCs
-- get_my_access() and get_my_profile(), so these helpers don't depend on how
-- production stores roles or profiles — and they keep working if that changes.
--
-- Run (staging first):  psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
--                        -c "set hub.apply = 'yes'" -f 20261010_00_common.sql
-- Without hub.apply = 'yes' the final check raises and the transaction rolls back (dry run).

create schema if not exists hub_private;
revoke all on schema hub_private from public;
-- Functions created here later (by 01–04) start with no EXECUTE for PUBLIC either.
alter default privileges in schema hub_private revoke execute on functions from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema hub_private from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- authenticated may USE the schema only so SECURITY DEFINER functions resolve; it has no table grants here.
    execute 'revoke all on schema hub_private from authenticated';
  end if;
end $$;

-- Preflight: the two identity RPCs these helpers rely on must exist.
do $$ begin
  if to_regprocedure('public.get_my_access()') is null then raise exception 'preflight: public.get_my_access() not found'; end if;
  if to_regprocedure('public.get_my_profile()') is null then raise exception 'preflight: public.get_my_profile() not found'; end if;
end $$;

/** Result of get_my_access() for the caller as jsonb, whatever its return shape (record set or jsonb). */
create or replace function hub_private.caller_access()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if auth.uid() is null then return null; end if;
  execute 'select to_jsonb(x) from public.get_my_access() x limit 1' into r;
  -- a scalar jsonb function comes back wrapped as {"x": {...}}
  if r ? 'x' and not r ? 'roles' then r := r -> 'x'; end if;
  return r;
end $$;

/** The caller's roles (text[]); empty when signed out or unknown. */
create or replace function hub_private.caller_roles()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array(select jsonb_array_elements_text(
           case jsonb_typeof(hub_private.caller_access() -> 'roles') when 'array' then hub_private.caller_access() -> 'roles' else '[]'::jsonb end)), '{}')
$$;

create or replace function hub_private.has_any_role(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select hub_private.caller_roles() && p_roles
$$;

/** Raises 42501 (→ 'forbidden' in the frontend) unless the caller holds one of the roles. */
create or replace function hub_private.require_role(variadic p_roles text[])
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not (hub_private.caller_roles() && p_roles) then raise exception 'requires role %', p_roles using errcode = '42501'; end if;
end $$;

/** The caller's approved-student profile (get_my_profile) as jsonb, or null if they have none. */
create or replace function hub_private.caller_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if auth.uid() is null then return null; end if;
  execute 'select to_jsonb(x) from public.get_my_profile() x limit 1' into r;
  if r ? 'x' and not r ? 'full_name' then r := r -> 'x'; end if;
  return r;
end $$;

/** Signed in AND an approved student (has a hub profile) — else 42501. Returns the profile. */
create or replace function hub_private.require_student()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  p := hub_private.caller_profile();
  if p is null then raise exception 'no approved student profile' using errcode = '42501'; end if;
  return p;
end $$;

/** "Sara Mostafa Ali" → "Sara A." — leaderboards and activity feeds never show full names. */
create or replace function hub_private.display_name(p_full text)
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(btrim(p_full), '') = '' then '—'
    when array_length(regexp_split_to_array(btrim(p_full), '\s+'), 1) = 1 then btrim(p_full)
    else (regexp_split_to_array(btrim(p_full), '\s+'))[1] || ' '
         || left((regexp_split_to_array(btrim(p_full), '\s+'))[array_length(regexp_split_to_array(btrim(p_full), '\s+'), 1)], 1) || '.'
  end
$$;

/** Student code as compared everywhere: Latin digits, no spaces, upper case. */
create or replace function hub_private.norm_code(p_raw text)
returns text language sql immutable set search_path = '' as $$
  select nullif(upper(regexp_replace(translate(coalesce(p_raw, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\s', '', 'g')), '')
$$;

/**
 * Egyptian mobile → E.164 text, or null when it isn't one (left for manual review).
 * Handles the leading zero a bigint column drops, 20…/0020… prefixes and Arabic digits.
 */
create or replace function hub_private.eg_mobile_e164(p_raw text)
returns text language sql immutable set search_path = '' as $$
  select case
    when d ~ '^01[0125][0-9]{8}$'    then '+2' || d
    when d ~ '^1[0125][0-9]{8}$'     then '+20' || d
    when d ~ '^201[0125][0-9]{8}$'   then '+' || d
    when d ~ '^00201[0125][0-9]{8}$' then '+' || substr(d, 3)
    else null
  end
  from (select regexp_replace(translate(coalesce(p_raw, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g') as d) x
$$;

revoke all on all functions in schema hub_private from public;

do $$ begin
  if coalesce(current_setting('hub.apply', true), '') <> 'yes' then
    raise exception 'DRY RUN complete — nothing was saved. Re-run with: set hub.apply = ''yes''';
  end if;
end $$;
