-- 20261010_02 · Activity events and online presence — PREPARED, NOT APPLIED.
-- Requires 20261010_00_common.sql.
--
-- Definitions (shown to admins as written here):
--   Online now   = distinct users whose last heartbeat is < 120 s old.
--                  One row per user (primary key), so several tabs = one person.
--                  The server stamps the time (now()); the browser sends no data.
--   Active today = distinct users with a qualifying event or heartbeat in the last 24 h.
--                  Qualifying: sign-in, heartbeat from a visible tab, content
--                  created/submitted/approved/rejected/published, role/scope change,
--                  quiz completed, activity completed. Page views are NOT events.
--   Sign-ins     = successful authentications recorded from auth.users (server side).
--
-- Privacy: no page content, URLs, keystrokes or messages. Events keep a type, the
-- user id, a short label (e.g. a content title) and a server timestamp.
-- Retention: events 180 days, presence rows 30 days after last seen —
-- hub_activity.purge() (schedule daily with pg_cron where available).
-- Access: tables live in schema hub_activity (not exposed by PostgREST, RLS on,
-- no policies); admins read aggregates through admin_* RPCs only.
-- Realtime is NOT used: a presence channel would let any subscriber see who is
-- online; a server-written heartbeat table keeps that admin-only.

create schema if not exists hub_activity;
revoke all on schema hub_activity from public;
alter default privileges in schema hub_activity revoke execute on functions from public;

do $$ begin
  if to_regprocedure('hub_private.require_role(text[])') is null then raise exception 'preflight: run 20261010_00_common.sql first'; end if;
end $$;

create table if not exists hub_activity.events (
  id bigint generated always as identity primary key,
  user_id uuid,
  type text not null check (type in (
    'auth.sign_in', 'content.created', 'content.submitted', 'content.approved', 'content.rejected',
    'content.published', 'role.granted', 'role.revoked', 'scope.updated',
    'quiz.completed', 'activity.completed', 'xp.awarded',
    'application.approved', 'application.rejected', 'application.needs_review')),
  label text check (label is null or length(label) <= 200),
  occurred_at timestamptz not null default now()
);
create index if not exists events_occurred_idx on hub_activity.events (occurred_at desc);
create index if not exists events_user_idx on hub_activity.events (user_id, occurred_at desc);

create table if not exists hub_activity.presence (
  user_id uuid primary key,
  last_seen_at timestamptz not null default now()
);
create index if not exists presence_seen_idx on hub_activity.presence (last_seen_at desc);

alter table hub_activity.events enable row level security;
alter table hub_activity.presence enable row level security;
revoke all on all tables in schema hub_activity from public;

/** Internal: append an event (called by triggers and other SECURITY DEFINER RPCs only). */
create or replace function hub_activity.log_event(p_user uuid, p_type text, p_label text default null)
returns void language sql security definer set search_path = '' as $$
  insert into hub_activity.events (user_id, type, label) values (p_user, p_type, left(p_label, 200))
$$;
revoke all on function hub_activity.log_event(uuid, text, text) from public;

/** Admin: live aggregates. Counts only — no identities. */
create or replace function public.admin_activity_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform hub_private.require_role('admin');
  return jsonb_build_object(
    'online_now', (select count(*) from hub_activity.presence where last_seen_at > now() - interval '120 seconds'),
    'active_24h', (select count(distinct u) from (
        select user_id as u from hub_activity.presence where last_seen_at > now() - interval '24 hours'
        union all
        select user_id from hub_activity.events where occurred_at > now() - interval '24 hours' and user_id is not null) x),
    'sign_ins_24h', (select count(*) from hub_activity.events where type = 'auth.sign_in' and occurred_at > now() - interval '24 hours'),
    'online_window_seconds', 120,
    'generated_at', now());
end $$;

/** Admin: latest recorded events with a short display name (never full names or emails). */
create or replace function public.admin_recent_activity(p_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform hub_private.require_role('admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', e.occurred_at, 'type', e.type, 'actor', n.display_name, 'entity', e.label) order by e.occurred_at desc)
    from (select * from hub_activity.events order by occurred_at desc limit least(greatest(coalesce(p_limit, 8), 1), 50)) e
    left join hub_activity.display_names n on n.user_id = e.user_id), '[]'::jsonb);
end $$;

-- Display names for the feed: filled when someone uses the Hub (from their own profile).
create table if not exists hub_activity.display_names (
  user_id uuid primary key,
  display_name text not null,
  updated_at timestamptz not null default now()
);
alter table hub_activity.display_names enable row level security;
revoke all on hub_activity.display_names from public;

/**
 * Heartbeat from a signed-in, visible tab. No arguments: the user is auth.uid()
 * and the time is the server's. Rate-limited — a beat within 20 s of the last one
 * is ignored, so a script can't inflate anything. It also refreshes the caller's
 * short display name (first name + initial) for the admin activity feed.
 */
create or replace function public.record_presence()
returns void language plpgsql security definer set search_path = '' as $$
declare p jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into hub_activity.presence as pr (user_id, last_seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = now()
    where pr.last_seen_at < now() - interval '20 seconds';
  if found then
    p := hub_private.caller_profile();
    if p is not null then
      insert into hub_activity.display_names as d (user_id, display_name) values (auth.uid(), hub_private.display_name(p ->> 'full_name'))
      on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()
        where d.display_name is distinct from excluded.display_name;
    end if;
  end if;
end $$;

/** Retention. Schedule daily, e.g. select cron.schedule('hub-activity-purge', '17 3 * * *', 'select hub_activity.purge()'); */
create or replace function hub_activity.purge()
returns void language sql security definer set search_path = '' as $$
  delete from hub_activity.events where occurred_at < now() - interval '180 days';
  delete from hub_activity.presence where last_seen_at < now() - interval '30 days';
$$;
revoke all on function hub_activity.purge() from public;

-- Content / role / scope events: mirror the server-written audit log.
-- Column names are read from the row as jsonb so this works with the existing
-- audit_logs layout (actor_id | user_id | actor; action; metadata->>'title').
create or replace function hub_activity.from_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb := to_jsonb(new); t text; a text;
begin
  a := lower(coalesce(v ->> 'action', ''));
  t := case
    when a ~ '^content\.(created|draft)' then 'content.created'
    when a ~ '^content\.submit' then 'content.submitted'
    when a ~ '^content\.approv' then 'content.approved'
    when a ~ '^content\.reject' then 'content.rejected'
    when a ~ '^content\.publish' then 'content.published'
    when a ~ '^role\.(grant|add)' then 'role.granted'
    when a ~ '^role\.(revok|remov)' then 'role.revoked'
    when a ~ '^scope\.' then 'scope.updated'
    else null end;
  if t is not null then
    perform hub_activity.log_event(
      nullif(coalesce(v ->> 'actor_id', v ->> 'user_id', v ->> 'actor'), '')::uuid, t,
      coalesce(v -> 'metadata' ->> 'title', null));
  end if;
  return null;
exception when others then
  return null;  -- never let activity tracking break the audited action itself
end $$;

do $$ begin
  if to_regclass('public.audit_logs') is not null then
    execute 'drop trigger if exists audit_logs_to_activity on public.audit_logs';
    execute 'create trigger audit_logs_to_activity after insert on public.audit_logs for each row execute function hub_activity.from_audit_log()';
  else
    raise notice 'public.audit_logs not found — content/role events will not be mirrored';
  end if;
end $$;

-- Sign-ins: Supabase updates auth.users.last_sign_in_at on every successful sign-in.
create or replace function hub_activity.from_auth_sign_in()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    perform hub_activity.log_event(new.id, 'auth.sign_in', null);
  end if;
  return null;
exception when others then
  return null;  -- never block a sign-in because of tracking
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'last_sign_in_at') then
    execute 'drop trigger if exists hub_activity_sign_in on auth.users';
    execute 'create trigger hub_activity_sign_in after update of last_sign_in_at on auth.users for each row execute function hub_activity.from_auth_sign_in()';
  else
    raise notice 'auth.users.last_sign_in_at not found — sign-ins will not be recorded';
  end if;
end $$;

revoke all on function hub_activity.from_audit_log() from public;
revoke all on function hub_activity.from_auth_sign_in() from public;

-- API grants: signed-in users may send heartbeats; admin RPCs re-check the role inside.
revoke all on function public.record_presence() from public;
revoke all on function public.admin_activity_summary() from public;
revoke all on function public.admin_recent_activity(int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.record_presence() to authenticated;
    grant execute on function public.admin_activity_summary() to authenticated;
    grant execute on function public.admin_recent_activity(int) to authenticated;
  end if;
end $$;

do $$ begin
  if coalesce(current_setting('hub.apply', true), '') <> 'yes' then
    raise exception 'DRY RUN complete — nothing was saved. Re-run with: set hub.apply = ''yes''';
  end if;
end $$;
