-- 20261010_03 · Engagement: quizzes, activities, XP ledger, levels, leaderboards — PREPARED, NOT APPLIED.
-- Requires 20261010_00 (helpers) and 20261010_02 (activity events). Design: docs/ENGAGEMENT.md.
--
-- Server-authoritative:
--   * the browser never sends a score, percent or XP amount — only "start quiz Q" and
--     "submit these answers for attempt A"; the server scores and decides XP
--   * answer keys never leave the database before an attempt is submitted
--   * attempts count from the moment they start; the deadline is enforced on submit
--   * every XP award has a unique idempotency key (duplicates are impossible) and a
--     200 XP/day cap, applied under a per-user advisory lock (no race between tabs)
--   * only approved students (get_my_profile) take part; data is keyed by auth.uid()
--   * leaderboards expose "First L." names only, no ids; students can opt out
-- Tables live in schema `engage` (not exposed by PostgREST), RLS on, no policies.

create schema if not exists engage;
revoke all on schema engage from public;
alter default privileges in schema engage revoke execute on functions from public;

do $$ begin
  if to_regprocedure('hub_private.require_student()') is null then raise exception 'preflight: run 20261010_00_common.sql first'; end if;
  if to_regprocedure('hub_activity.log_event(uuid,text,text)') is null then raise exception 'preflight: run 20261010_02_activity_presence.sql first'; end if;
end $$;

-- ---------- tables ----------

create table if not exists engage.participants (
  user_id uuid primary key,
  display_name text not null,
  group_name text,
  section text,
  leaderboard_opt_out boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists engage.quizzes (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,                                  -- course code, e.g. BSC111
  week smallint check (week between 1 and 20),
  title text not null check (length(title) between 1 and 160),
  time_limit_min smallint not null check (time_limit_min between 1 and 180),
  max_attempts smallint not null default 2 check (max_attempts between 1 and 10),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  audience_group text,                                       -- null = everyone
  audience_section text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table if not exists engage.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references engage.quizzes(id) on delete cascade,
  position smallint not null,
  text text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  answer text not null,                                      -- an option id; read by RPCs only
  explanation text,
  unique (quiz_id, position)
);

create table if not exists engage.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references engage.quizzes(id),
  user_id uuid not null,
  attempt_no smallint not null,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  answers jsonb,
  correct smallint, total smallint, percent smallint,
  xp_awarded smallint not null default 0,
  unique (quiz_id, user_id, attempt_no)
);
create index if not exists quiz_attempts_user_idx on engage.quiz_attempts (user_id, quiz_id);

create table if not exists engage.activities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('workshop', 'competition', 'club', 'event')),
  title text not null check (length(title) between 1 and 160),
  description text,
  starts_at timestamptz not null,
  location text,
  capacity int not null check (capacity > 0),
  xp smallint not null default 30 check (xp between 0 and 100),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists engage.activity_participants (
  activity_id uuid not null references engage.activities(id),
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  primary key (activity_id, user_id)
);

create table if not exists engage.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  type text not null check (type in ('quiz_completed', 'quiz_score', 'activity_completed', 'adjustment')),
  source_id uuid,
  variant text,
  amount smallint not null check (amount between -200 and 200 and amount <> 0),
  idempotency_key text not null unique,                      -- the "exactly once" guarantee
  awarded_by uuid,                                           -- staff id for adjustments
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists xp_events_user_idx on engage.xp_events (user_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['participants', 'quizzes', 'quiz_questions', 'quiz_attempts', 'activities', 'activity_participants', 'xp_events'] loop
    execute format('alter table engage.%I enable row level security', t);
    execute format('revoke all on engage.%I from public', t);
  end loop;
end $$;

-- ---------- internal helpers ----------

/** Approved student → refresh their participant row (name shortened) and return it. */
create or replace function engage.me()
returns engage.participants language plpgsql security definer set search_path = '' as $$
declare p jsonb := hub_private.require_student(); r engage.participants;
begin
  insert into engage.participants as x (user_id, display_name, group_name, section)
  values (auth.uid(), hub_private.display_name(p ->> 'full_name'), p ->> 'group_name', p ->> 'section')
  on conflict (user_id) do update
    set display_name = excluded.display_name, group_name = excluded.group_name, section = excluded.section, updated_at = now()
    where (x.display_name, x.group_name, x.section) is distinct from (excluded.display_name, excluded.group_name, excluded.section)
  returning * into r;
  if r.user_id is null then select * into r from engage.participants where user_id = auth.uid(); end if;
  return r;
end $$;

/** Level from total XP: total needed for level n is 25·(n−1)·n → 0, 50, 150, 300, 500, … */
create or replace function engage.level_info(p_xp bigint)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare lvl int := 1; x bigint := greatest(coalesce(p_xp, 0), 0); f bigint; n bigint;
begin
  while 25 * lvl * (lvl + 1) <= x loop lvl := lvl + 1; end loop;
  f := 25 * (lvl - 1) * lvl; n := 25 * lvl * (lvl + 1);
  return jsonb_build_object('level', lvl, 'floor', f, 'next', n, 'progress', round((x - f)::numeric / (n - f), 4));
end $$;

/**
 * The ONLY way XP is created. Idempotent by key, capped at 200/day (UTC) per user,
 * serialised per user with an advisory lock. Returns the amount actually awarded.
 */
create or replace function engage.award(p_user uuid, p_type text, p_source uuid, p_variant text, p_amount int, p_label text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_key text := p_user || ':' || p_type || ':' || coalesce(p_source::text, '-') || coalesce(':' || p_variant, '');
        v_today int; v_allowed int; v_id bigint;
begin
  if p_amount is null or p_amount <= 0 then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('engage.award:' || p_user, 0));
  if exists (select 1 from engage.xp_events where idempotency_key = v_key) then return 0; end if;
  select coalesce(sum(amount), 0) into v_today from engage.xp_events
   where user_id = p_user and amount > 0 and type <> 'adjustment'
     and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_allowed := least(p_amount, greatest(0, 200 - v_today));
  if v_allowed <= 0 then return 0; end if;
  insert into engage.xp_events (user_id, type, source_id, variant, amount, idempotency_key)
  values (p_user, p_type, p_source, p_variant, v_allowed, v_key)
  on conflict (idempotency_key) do nothing returning id into v_id;
  if v_id is null then return 0; end if;
  perform hub_activity.log_event(p_user, 'xp.awarded', p_label);
  return v_allowed;
end $$;

create or replace function engage.xp_total(p_user uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0) from engage.xp_events where user_id = p_user
$$;

create or replace function engage.quiz_state(q engage.quizzes)
returns text language sql stable set search_path = '' as $$
  select case when q.status <> 'published' then q.status
              when now() < q.opens_at then 'upcoming'
              when now() > q.closes_at then 'closed'
              else 'open' end
$$;

create or replace function engage.score_bonus(p_percent int)
returns int language sql immutable set search_path = '' as $$
  select (least(greatest(coalesce(p_percent, 0), 0), 100) / 10) * 2
$$;

create or replace function engage.quiz_summary(q engage.quizzes, p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id, 'subject_id', q.subject_id, 'week', q.week, 'title', q.title,
    'time_limit_min', q.time_limit_min, 'max_attempts', q.max_attempts, 'opens_at', q.opens_at, 'closes_at', q.closes_at,
    'question_count', (select count(*) from engage.quiz_questions where quiz_id = q.id),
    'status', engage.quiz_state(q),
    'attempts_used', a.used, 'best_percent', a.best,
    'can_attempt', case when engage.quiz_state(q) = 'upcoming' then 'not_open'
                        when engage.quiz_state(q) <> 'open' then 'closed'
                        when a.used >= q.max_attempts then 'limit' else 'ok' end,
    'xp_available', 10 + engage.score_bonus(100))
  from (select count(*)::int as used, max(percent) filter (where submitted_at is not null) as best
          from engage.quiz_attempts where quiz_id = q.id and user_id = p_user) a
$$;

create or replace function engage.visible_to(q engage.quizzes, me engage.participants)
returns boolean language sql stable set search_path = '' as $$
  select q.status = 'published'
     and (q.audience_group is null or q.audience_group = me.group_name)
     and (q.audience_section is null or q.audience_section = me.section)
$$;

/** Review of a submitted attempt (answers revealed only after submission). */
create or replace function engage.attempt_review(p_attempt engage.quiz_attempts)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'submitted_at', p_attempt.submitted_at, 'correct', p_attempt.correct, 'total', p_attempt.total,
    'percent', p_attempt.percent, 'xp_awarded', p_attempt.xp_awarded, 'attempt_no', p_attempt.attempt_no,
    'review', (select jsonb_agg(jsonb_build_object(
                  'question_id', qq.id, 'chosen', p_attempt.answers ->> qq.id::text, 'correct_option_id', qq.answer,
                  'is_correct', (p_attempt.answers ->> qq.id::text) = qq.answer, 'explanation', qq.explanation) order by qq.position)
               from engage.quiz_questions qq where qq.quiz_id = p_attempt.quiz_id))
$$;

-- ---------- student RPCs ----------

create or replace function public.list_quizzes(p_subject_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me();
begin
  return coalesce((select jsonb_agg(engage.quiz_summary(q, me.user_id) order by q.opens_at)
                     from engage.quizzes q
                    where engage.visible_to(q, me) and (p_subject_id is null or q.subject_id = p_subject_id)), '[]'::jsonb);
end $$;

create or replace function public.get_quiz(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me(); q engage.quizzes; last engage.quiz_attempts;
begin
  select * into q from engage.quizzes where id = p_quiz_id;
  if q.id is null or not engage.visible_to(q, me) then raise exception 'quiz not found' using errcode = 'P0002'; end if;
  select * into last from engage.quiz_attempts where quiz_id = q.id and user_id = me.user_id and submitted_at is not null
   order by attempt_no desc limit 1;
  return engage.quiz_summary(q, me.user_id) || jsonb_build_object(
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'text', text, 'options', options) order by position), '[]')
                    from engage.quiz_questions where quiz_id = q.id),
    'last_result', case when last.id is null then null else engage.attempt_review(last) end);
end $$;

create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me(); q engage.quizzes; used int; a engage.quiz_attempts;
begin
  select * into q from engage.quizzes where id = p_quiz_id for share;
  if q.id is null or not engage.visible_to(q, me) then raise exception 'quiz not found' using errcode = 'P0002'; end if;
  if engage.quiz_state(q) <> 'open' then raise exception 'quiz is not open' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('engage.attempt:' || me.user_id || ':' || q.id, 0));
  select count(*) into used from engage.quiz_attempts where quiz_id = q.id and user_id = me.user_id;
  if used >= q.max_attempts then raise exception 'attempt limit reached' using errcode = 'P0001'; end if;
  insert into engage.quiz_attempts (quiz_id, user_id, attempt_no, deadline_at)
  values (q.id, me.user_id, used + 1, least(now() + make_interval(mins => q.time_limit_min), q.closes_at + interval '30 seconds'))
  returning * into a;
  return jsonb_build_object('attempt_id', a.id, 'started_at', a.started_at, 'time_limit_min', q.time_limit_min,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'text', text, 'options', options) order by position), '[]')
                    from engage.quiz_questions where quiz_id = q.id));
end $$;

create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me(); a engage.quiz_attempts; q engage.quizzes;
        v_correct int; v_total int; v_percent int; v_prev int; v_xp int := 0;
begin
  if p_answers is not null and jsonb_typeof(p_answers) <> 'object' then raise exception 'answers must be an object' using errcode = '22023'; end if;
  select * into a from engage.quiz_attempts where id = p_attempt_id and user_id = me.user_id for update;
  if a.id is null then raise exception 'attempt not found' using errcode = 'P0002'; end if;     -- includes other students' attempts
  if a.submitted_at is not null then raise exception 'attempt already submitted' using errcode = '23505'; end if;
  if now() > a.deadline_at + interval '30 seconds' then raise exception 'time limit passed' using errcode = 'P0001'; end if;
  select * into q from engage.quizzes where id = a.quiz_id;

  select count(*), count(*) filter (where (p_answers ->> qq.id::text) = qq.answer)
    into v_total, v_correct from engage.quiz_questions qq where qq.quiz_id = q.id;
  v_percent := case when v_total = 0 then 0 else round(100.0 * v_correct / v_total) end;
  select max(percent) into v_prev from engage.quiz_attempts
   where quiz_id = q.id and user_id = me.user_id and submitted_at is not null;

  if v_prev is null then
    v_xp := v_xp + engage.award(me.user_id, 'quiz_completed', q.id, null, 10, q.title);
  end if;
  if engage.score_bonus(v_percent) > engage.score_bonus(coalesce(v_prev, 0)) then
    v_xp := v_xp + engage.award(me.user_id, 'quiz_score', q.id, 'best-' || v_percent,
                                engage.score_bonus(v_percent) - engage.score_bonus(coalesce(v_prev, 0)), q.title);
  end if;

  update engage.quiz_attempts
     set submitted_at = now(), answers = coalesce(p_answers, '{}'::jsonb), correct = v_correct, total = v_total,
         percent = v_percent, xp_awarded = v_xp
   where id = a.id returning * into a;
  perform hub_activity.log_event(me.user_id, 'quiz.completed', q.title);
  return engage.attempt_review(a) || jsonb_build_object(
    'attempts_left', greatest(0, q.max_attempts - (select count(*) from engage.quiz_attempts where quiz_id = q.id and user_id = me.user_id)));
end $$;

create or replace function public.list_activities()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'kind', a.kind, 'title', a.title, 'starts_at', a.starts_at, 'location', a.location,
      'capacity', a.capacity, 'xp', a.xp, 'participants', c.n, 'joined', p.user_id is not null,
      'past', a.starts_at < now(), 'full', p.user_id is null and c.n >= a.capacity,
      'completion', case when p.user_id is null then null when p.confirmed_at is not null then 'completed'
                         when a.starts_at < now() then 'not_confirmed' else 'registered' end)
      order by a.starts_at < now(), case when a.starts_at >= now() then a.starts_at end, a.starts_at desc)
    from engage.activities a
    cross join lateral (select count(*)::int as n from engage.activity_participants x where x.activity_id = a.id) c
    left join engage.activity_participants p on p.activity_id = a.id and p.user_id = me.user_id
    where a.status = 'published'), '[]'::jsonb);
end $$;

create or replace function public.join_activity(p_activity_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me(); a engage.activities;
begin
  select * into a from engage.activities where id = p_activity_id and status = 'published' for update;   -- serialises joins
  if a.id is null then raise exception 'activity not found' using errcode = 'P0002'; end if;
  if a.starts_at < now() then raise exception 'activity already started' using errcode = 'P0001'; end if;
  if exists (select 1 from engage.activity_participants where activity_id = a.id and user_id = me.user_id) then return; end if;
  if (select count(*) from engage.activity_participants where activity_id = a.id) >= a.capacity then
    raise exception 'activity is full' using errcode = 'P0001';
  end if;
  insert into engage.activity_participants (activity_id, user_id) values (a.id, me.user_id);
end $$;

create or replace function public.leave_activity(p_activity_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me(); a engage.activities;
begin
  select * into a from engage.activities where id = p_activity_id;
  if a.id is null then raise exception 'activity not found' using errcode = 'P0002'; end if;
  if a.starts_at < now() then raise exception 'activity already started' using errcode = 'P0001'; end if;
  delete from engage.activity_participants where activity_id = a.id and user_id = me.user_id and confirmed_at is null;
end $$;

create or replace function public.get_my_progress()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me(); v_xp bigint := engage.xp_total(auth.uid());
begin
  return engage.level_info(v_xp) || jsonb_build_object(
    'xp', v_xp,
    'ranks', jsonb_build_object(
       'section', (public.get_leaderboard('section') -> 'me' ->> 'rank')::int,
       'group', (public.get_leaderboard('group') -> 'me' ->> 'rank')::int,
       'university', (public.get_leaderboard('university') -> 'me' ->> 'rank')::int),
    'quizzes_completed', (select count(distinct quiz_id) from engage.quiz_attempts where user_id = me.user_id and submitted_at is not null),
    'activities_completed', (select count(*) from engage.activity_participants where user_id = me.user_id and confirmed_at is not null),
    'recent', coalesce((select jsonb_agg(r order by r ->> 'at' desc) from (
        select jsonb_build_object('type', e.type, 'source_id', e.source_id, 'amount', e.amount, 'at', e.created_at,
                                  'title', coalesce(q.title, a.title)) as r
          from engage.xp_events e
          left join engage.quizzes q on q.id = e.source_id
          left join engage.activities a on a.id = e.source_id
         where e.user_id = me.user_id order by e.created_at desc limit 8) s), '[]'::jsonb));
end $$;

/**
 * Leaderboard for 'section' | 'group' | 'university'. Ranked by verified XP; ties share
 * a rank (1, 2, 2, 4) and are ordered by name then an internal id, so the order is stable.
 * Rows expose rank, short name, XP and level only — never ids, codes or emails.
 */
create or replace function public.get_leaderboard(p_scope text default 'section')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me engage.participants := engage.me(); v jsonb;
begin
  if p_scope not in ('section', 'group', 'university') then raise exception 'unknown scope' using errcode = '22023'; end if;
  with board as (
    select p.user_id, p.display_name, engage.xp_total(p.user_id) as xp
      from engage.participants p
     where not p.leaderboard_opt_out
       and (p_scope = 'university'
            or (p_scope = 'group' and p.group_name is not distinct from me.group_name)
            or (p_scope = 'section' and p.group_name is not distinct from me.group_name and p.section is not distinct from me.section))
  ), ranked as (
    select rank() over (order by xp desc) as rank,
           row_number() over (order by xp desc, display_name, user_id) as ord,
           display_name, xp, user_id = me.user_id as is_me
      from board
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', rank, 'name', display_name, 'xp', xp,
                        'level', (engage.level_info(xp) ->> 'level')::int, 'is_me', is_me) order by ord)
                      from ranked where ord <= 10), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', rank, 'name', display_name, 'xp', xp, 'level', (engage.level_info(xp) ->> 'level')::int, 'is_me', true)
             from ranked where is_me),
    'me_outside_top', coalesce((select ord > 10 from ranked where is_me), false),
    'size', (select count(*) from ranked))
  into v;
  return v;
end $$;

/** Privacy: leave or re-join the leaderboards. */
create or replace function public.set_leaderboard_opt_out(p_opt_out boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform engage.me();
  update engage.participants set leaderboard_opt_out = coalesce(p_opt_out, false), updated_at = now() where user_id = auth.uid();
end $$;

-- ---------- staff RPCs ----------

/** Organiser (admin) confirms attendance; activity XP is awarded once per student. */
create or replace function public.confirm_attendance(p_activity_id uuid, p_user_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare a engage.activities; u uuid; n int := 0;
begin
  perform hub_private.require_role('admin');
  select * into a from engage.activities where id = p_activity_id;
  if a.id is null then raise exception 'activity not found' using errcode = 'P0002'; end if;
  foreach u in array coalesce(p_user_ids, '{}') loop
    update engage.activity_participants set confirmed_by = auth.uid(), confirmed_at = now()
     where activity_id = a.id and user_id = u and confirmed_at is null;
    if found then
      perform engage.award(u, 'activity_completed', a.id, null, a.xp, a.title);
      perform hub_activity.log_event(u, 'activity.completed', a.title);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

/** Admin manual correction: audited, reason required, never through the student API. */
create or replace function public.admin_adjust_xp(p_user uuid, p_amount int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform hub_private.require_role('admin');
  if p_amount is null or p_amount = 0 or abs(p_amount) > 200 then raise exception 'amount must be between -200 and 200' using errcode = '22023'; end if;
  if coalesce(length(btrim(p_reason)), 0) < 5 then raise exception 'reason required' using errcode = '22023'; end if;
  insert into engage.xp_events (user_id, type, amount, idempotency_key, awarded_by, reason)
  values (p_user, 'adjustment', p_amount, 'adjust:' || gen_random_uuid(), auth.uid(), left(p_reason, 300));
end $$;

create or replace function public.admin_list_quizzes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform hub_private.require_role('admin');
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'subject_id', q.subject_id, 'week', q.week, 'title', q.title,
            'status', engage.quiz_state(q), 'question_count', (select count(*) from engage.quiz_questions where quiz_id = q.id),
            'max_attempts', q.max_attempts, 'opens_at', q.opens_at, 'closes_at', q.closes_at) order by q.opens_at desc)
          from engage.quizzes q), '[]'::jsonb);
end $$;

create or replace function public.admin_list_activities()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform hub_private.require_role('admin');
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'title', a.title, 'starts_at', a.starts_at,
            'location', a.location, 'capacity', a.capacity, 'xp', a.xp, 'past', a.starts_at < now(),
            'participants', (select count(*) from engage.activity_participants where activity_id = a.id)) order by a.starts_at desc)
          from engage.activities a where a.status <> 'cancelled'), '[]'::jsonb);
end $$;

create or replace function public.admin_engagement_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform hub_private.require_role('admin');
  return jsonb_build_object(
    'students_with_xp', (select count(distinct user_id) from engage.xp_events),
    'xp_total', (select coalesce(sum(amount), 0) from engage.xp_events),
    'quiz_attempts', (select count(*) from engage.quiz_attempts where submitted_at is not null),
    'activity_participants', (select count(*) from engage.activity_participants),
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', rank, 'name', display_name, 'xp', xp,
                       'level', (engage.level_info(xp) ->> 'level')::int, 'is_me', false) order by rank, display_name)
                     from (select p.display_name, engage.xp_total(p.user_id) as xp, rank() over (order by engage.xp_total(p.user_id) desc) as rank
                             from engage.participants p where not p.leaderboard_opt_out) t where rank <= 5), '[]'::jsonb));
end $$;

-- ---------- grants ----------

do $$
declare f text;
begin
  -- internal helpers: no API access at all
  revoke all on all functions in schema engage from public;
  foreach f in array array[
    'public.list_quizzes(text)', 'public.get_quiz(uuid)', 'public.start_quiz_attempt(uuid)', 'public.submit_quiz_attempt(uuid,jsonb)',
    'public.list_activities()', 'public.join_activity(uuid)', 'public.leave_activity(uuid)', 'public.get_my_progress()',
    'public.get_leaderboard(text)', 'public.set_leaderboard_opt_out(boolean)', 'public.confirm_attendance(uuid,uuid[])',
    'public.admin_adjust_xp(uuid,int,text)', 'public.admin_list_quizzes()', 'public.admin_list_activities()', 'public.admin_engagement_stats()'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);    -- each re-checks student/admin inside
    end if;
  end loop;
end $$;

do $$ begin
  if coalesce(current_setting('hub.apply', true), '') <> 'yes' then
    raise exception 'DRY RUN complete — nothing was saved. Re-run with: set hub.apply = ''yes''';
  end if;
end $$;
