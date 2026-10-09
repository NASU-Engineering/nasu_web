-- 20261010_04 · Google Forms intake + applications review — PREPARED, NOT APPLIED.
-- Requires 20261010_00 and 20261010_02. Design: docs/data-integrity/FORMS_SYNC.md.
--
-- Rules this enforces:
--   * A form submission NEVER grants access. Nothing here inserts approved students;
--     approval stays an explicit admin action (admin_review_application), and a code
--     that is not in the university roster cannot be approved at all.
--   * Intake is idempotent: the Google Forms response id is the key. Re-sending is a
--     no-op; a changed answer set (new payload hash) is kept as a revision.
--   * Provenance is kept: form id, source row, submitted/received timestamps, source.
--   * Nothing is dropped: blank / invalid / unknown codes and responses with no
--     application become review items; failures are recorded in intake.errors.
--   * Every decision is logged (intake.review_log + activity events).
-- Column names of public.applications other than id / student_code / status are
-- read through to_jsonb(row), so a different name column (full_name | name | …)
-- or timestamp column (created_at | submitted_at) doesn't break anything.

create schema if not exists intake;
revoke all on schema intake from public;
alter default privileges in schema intake revoke execute on functions from public;

-- Preflight --------------------------------------------------------------------
do $$
declare missing text := ''; c text;
begin
  if to_regprocedure('hub_private.require_role(text[])') is null then raise exception 'preflight: run 20261010_00_common.sql first'; end if;
  if to_regprocedure('hub_activity.log_event(uuid,text,text)') is null then raise exception 'preflight: run 20261010_02_activity_presence.sql first'; end if;
  foreach c in array array['applications.id', 'applications.student_code', 'applications.status',
                           'approved_students.id', 'university_students.student_code'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public'
                    and table_name = split_part(c, '.', 1) and column_name = split_part(c, '.', 2)) then
      missing := missing || ' ' || c;
    end if;
  end loop;
  if missing <> '' then raise exception 'preflight: missing columns:% — adapt this migration first', missing; end if;
  -- approval writes these two literals; any other existing status values are listed for review
  raise notice 'preflight: applications.status values in use: %',
    (select string_agg(distinct status::text, ', ') from public.applications);
end $$;

-- Tables -------------------------------------------------------------------------

create table if not exists intake.form_responses (
  response_id text primary key,                         -- Google Forms response id = idempotency key
  form_id text,
  source text not null default 'trigger' check (source in ('trigger', 'nightly_backfill', 'manual_import', 'csv_reconcile')),
  source_row int,                                       -- row in the responses sheet / CSV export
  submitted_at timestamptz,                             -- as reported by Google
  received_at timestamptz not null default now(),       -- server time
  student_code_raw text,
  student_code text,                                    -- normalised (hub_private.norm_code)
  payload jsonb not null,                               -- answers exactly as submitted
  payload_sha256 text not null,
  review_state text not null default 'new' check (review_state in ('new', 'linked', 'needs_review', 'rejected')),
  review_reason text check (review_reason in ('blank_code', 'not_in_roster', 'no_application', 'duplicate', null)),
  application_id text,                                  -- applications.id as text, when linked
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz
);
create index if not exists form_responses_code_idx on intake.form_responses (student_code);

create table if not exists intake.response_revisions (
  response_id text not null references intake.form_responses(response_id),
  payload jsonb not null,
  payload_sha256 text not null,
  received_at timestamptz not null default now(),
  primary key (response_id, payload_sha256)
);

create table if not exists intake.errors (
  id bigint generated always as identity primary key,
  response_id text,
  stage text not null check (stage in ('signature', 'parse', 'validate', 'link', 'store')),
  error_code text not null check (length(error_code) <= 60),   -- codes only, never answer values
  attempts int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (response_id, stage, error_code)
);

create table if not exists intake.application_flags (
  application_id text primary key,
  state text not null check (state in ('needs_review', 'rejected')),
  note text,
  flagged_by uuid,
  flagged_at timestamptz not null default now()
);

create table if not exists intake.review_log (
  id bigint generated always as identity primary key,
  item_id text not null,                                -- application id or 'form:<response id>'
  decision text not null check (decision in ('approve', 'reject', 'needs_review')),
  note text,
  decided_by uuid not null,
  decided_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['form_responses', 'response_revisions', 'errors', 'application_flags', 'review_log'] loop
    execute format('alter table intake.%I enable row level security', t);
    execute format('revoke all on intake.%I from public', t);
  end loop;
end $$;

-- Internal helpers ------------------------------------------------------------

create or replace function intake.in_roster(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_code is not null and exists (select 1 from public.university_students u where hub_private.norm_code(u.student_code::text) = p_code)
$$;

/** Classifies a stored response (link / review reason). Never creates or approves anything. */
create or replace function intake.classify(p_response_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare r intake.form_responses; app text; dups int;
begin
  select * into r from intake.form_responses where response_id = p_response_id for update;
  if r.review_state = 'rejected' then return; end if;                     -- a human decision stands
  select a.id::text into app from public.applications a
   where hub_private.norm_code(a.student_code::text) = r.student_code order by a.id desc limit 1;
  select count(*) - 1 into dups from intake.form_responses where student_code = r.student_code and r.student_code is not null;
  update intake.form_responses set
    application_id = app,
    review_state = case when app is not null then 'linked' else 'needs_review' end,
    review_reason = case
      when r.student_code is null then 'blank_code'
      when not intake.in_roster(r.student_code) then 'not_in_roster'
      when app is null then 'no_application'
      when dups > 0 then 'duplicate'
      else null end
  where response_id = p_response_id;
end $$;

-- Intake API (Edge Function / import only — service role, never the browser) ----

/**
 * Stores one Google Forms response. Idempotent by response id:
 *   'inserted'  first time
 *   'duplicate' same id + same content (nothing changes)
 *   'revised'   same id, edited answers (kept as a revision; payload updated)
 */
create or replace function public.ingest_form_response(
  p_response_id text, p_form_id text, p_submitted_at timestamptz, p_payload jsonb,
  p_source text default 'trigger', p_source_row int default null, p_code_field text default 'student_code')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sha text; v_old intake.form_responses; v_code_raw text; v_result text;
begin
  if coalesce(btrim(p_response_id), '') = '' then raise exception 'response id required' using errcode = '22023'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    insert into intake.errors as e (response_id, stage, error_code) values (p_response_id, 'parse', 'payload_not_object')
    on conflict (response_id, stage, error_code) do update set attempts = e.attempts + 1, last_at = now();
    raise exception 'payload must be a json object' using errcode = '22023';
  end if;
  v_sha := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  v_code_raw := p_payload ->> p_code_field;
  select * into v_old from intake.form_responses where response_id = p_response_id for update;
  if v_old.response_id is null then
    insert into intake.form_responses (response_id, form_id, source, source_row, submitted_at, student_code_raw, student_code, payload, payload_sha256)
    values (p_response_id, p_form_id, p_source, p_source_row, p_submitted_at, v_code_raw, hub_private.norm_code(v_code_raw), p_payload, v_sha);
    insert into intake.response_revisions (response_id, payload, payload_sha256) values (p_response_id, p_payload, v_sha);
    v_result := 'inserted';
  elsif v_old.payload_sha256 = v_sha then
    return jsonb_build_object('result', 'duplicate', 'review_state', v_old.review_state);
  else
    insert into intake.response_revisions (response_id, payload, payload_sha256) values (p_response_id, p_payload, v_sha)
    on conflict do nothing;
    update intake.form_responses set payload = p_payload, payload_sha256 = v_sha, student_code_raw = v_code_raw,
           student_code = hub_private.norm_code(v_code_raw), received_at = now()
     where response_id = p_response_id;
    v_result := 'revised';
  end if;
  perform intake.classify(p_response_id);
  update intake.errors set resolved_at = now() where response_id = p_response_id and resolved_at is null;
  return jsonb_build_object('result', v_result,
    'review_state', (select review_state from intake.form_responses where response_id = p_response_id));
end $$;

/** Records a failure the Edge Function could not store (signature, parse…). Codes only. */
create or replace function public.record_intake_error(p_response_id text, p_stage text, p_error_code text)
returns void language sql security definer set search_path = '' as $$
  insert into intake.errors as e (response_id, stage, error_code) values (p_response_id, p_stage, left(p_error_code, 60))
  on conflict (response_id, stage, error_code) do update set attempts = e.attempts + 1, last_at = now(), resolved_at = null
$$;

/** Re-links every stored response (e.g. after applications or the roster change). */
create or replace function public.reclassify_form_responses()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  if current_user not in ('service_role', 'postgres') and not hub_private.has_any_role('admin') then
    raise exception 'requires admin' using errcode = '42501';
  end if;
  for r in select response_id from intake.form_responses loop perform intake.classify(r.response_id); n := n + 1; end loop;
  return n;
end $$;

-- Admin review API (browser, admin only) ---------------------------------------------

/** One application row in the shape the Admin "Applications" view reads. */
create or replace function intake.application_row(p_app jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_app ->> 'id',
    'student_code', p_app ->> 'student_code',
    'full_name', coalesce(p_app ->> 'full_name', p_app ->> 'name', p_app ->> 'student_name', ''),
    'status', case when f.state = 'rejected' or p_app ->> 'status' = 'rejected' then 'rejected'
                   when p_app ->> 'status' = 'approved' then 'approved'
                   when f.state = 'needs_review' or not intake.in_roster(hub_private.norm_code(p_app ->> 'student_code')) then 'needs_review'
                   else 'pending' end,
    'submitted_at', coalesce(p_app ->> 'submitted_at', p_app ->> 'created_at'),
    'reviewed_at', f.flagged_at,
    'source', coalesce(fr.source_kind, 'manual'),
    'source_row', fr.source_row,
    'roster_match', intake.in_roster(hub_private.norm_code(p_app ->> 'student_code')),
    'duplicate_count', greatest(coalesce(fr.n, 0) - 1, 0),
    'review_note', f.note)
  from (select 1) one
  left join intake.application_flags f on f.application_id = p_app ->> 'id'
  left join lateral (select 'google_form'::text as source_kind, min(source_row) as source_row, count(*) as n
                       from intake.form_responses where student_code = hub_private.norm_code(p_app ->> 'student_code')
                      having count(*) > 0) fr on true
$$;

/** A form response with no application, as a review item (id 'form:<response id>'). */
create or replace function intake.response_row(r intake.form_responses)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', 'form:' || r.response_id, 'student_code', coalesce(r.student_code, r.student_code_raw, ''),
    'full_name', coalesce(r.payload ->> 'full_name', r.payload ->> 'name', ''),
    'status', case when r.review_state = 'rejected' then 'rejected' else 'needs_review' end,
    'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at, 'source', case when r.source = 'manual_import' then 'import' else 'google_form' end,
    'source_row', r.source_row, 'roster_match', intake.in_roster(r.student_code), 'duplicate_count', 0,
    'review_note', coalesce(r.review_note, r.review_reason))
$$;

create or replace function intake.all_items()
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select intake.application_row(to_jsonb(a)) from public.applications a
  union all
  select intake.response_row(r) from intake.form_responses r where r.application_id is null
$$;

create or replace function public.admin_application_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform hub_private.require_role('admin');
  return (select jsonb_build_object(
      'pending', count(*) filter (where i ->> 'status' = 'pending'),
      'needs_review', count(*) filter (where i ->> 'status' = 'needs_review'),
      'approved', count(*) filter (where i ->> 'status' = 'approved'),
      'rejected', count(*) filter (where i ->> 'status' = 'rejected'),
      'approved_total', (select count(*) from public.approved_students))
    from intake.all_items() i);
end $$;

create or replace function public.admin_list_applications(p_status text default null, p_query text default null, p_cursor text default null, p_limit int default 25)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_off int := coalesce(nullif(p_cursor, '')::int, 0); v_lim int := least(greatest(coalesce(p_limit, 25), 1), 100);
        v_q text := lower(nullif(btrim(p_query), '')); v_items jsonb; v_total int;
begin
  perform hub_private.require_role('admin');
  with f as (
    select i from intake.all_items() i
     where (p_status is null or i ->> 'status' = p_status)
       and (v_q is null or lower(i ->> 'full_name') like '%' || v_q || '%' or lower(i ->> 'student_code') like '%' || v_q || '%')
  )
  select (select count(*) from f),
         (select coalesce(jsonb_agg(i order by i ->> 'submitted_at' desc nulls last, i ->> 'id'), '[]')
            from (select i from f order by i ->> 'submitted_at' desc nulls last, i ->> 'id' offset v_off limit v_lim) p)
    into v_total, v_items;
  return jsonb_build_object('items', v_items, 'next_cursor', case when v_off + v_lim < v_total then (v_off + v_lim)::text end);
end $$;

/**
 * decision: 'approve' | 'reject' | 'needs_review'. Approval = applications.status → 'approved',
 * which lets the existing sync_approved_student() create the approved row (and migration 01's
 * trigger copy the phone). Refused for codes outside the roster and for form-only items.
 */
create or replace function public.admin_review_application(p_id text, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_app jsonb; v_status text; v_code text; v_label text;
begin
  perform hub_private.require_role('admin');
  if p_decision not in ('approve', 'reject', 'needs_review') then raise exception 'unknown decision' using errcode = '22023'; end if;
  if p_decision <> 'approve' and coalesce(length(btrim(p_note)), 0) < 3 then raise exception 'a note is required' using errcode = '22023'; end if;

  if p_id like 'form:%' then                                         -- a form response with no application
    if p_decision = 'approve' then
      raise exception 'a form response is not an application; it cannot be approved here' using errcode = 'P0001';
    end if;
    update intake.form_responses set review_state = case when p_decision = 'reject' then 'rejected' else 'needs_review' end,
           review_note = left(p_note, 500), reviewed_by = auth.uid(), reviewed_at = now()
     where response_id = substr(p_id, 6) and application_id is null;
    if not found then raise exception 'item not found' using errcode = 'P0002'; end if;
    insert into intake.review_log (item_id, decision, note, decided_by) values (p_id, p_decision, left(p_note, 500), auth.uid());
    perform hub_activity.log_event(auth.uid(), 'application.' || case p_decision when 'reject' then 'rejected' else 'needs_review' end, null);
    return (select intake.response_row(r) from intake.form_responses r where response_id = substr(p_id, 6));
  end if;

  select to_jsonb(a) into v_app from public.applications a where a.id::text = p_id for update;
  if v_app is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  v_status := v_app ->> 'status';
  v_code := hub_private.norm_code(v_app ->> 'student_code');
  v_label := hub_private.display_name(coalesce(v_app ->> 'full_name', v_app ->> 'name', ''));
  if v_status in ('approved', 'rejected') then raise exception 'already decided' using errcode = '23505'; end if;

  if p_decision = 'approve' then
    if not intake.in_roster(v_code) then
      raise exception 'student code is not in the university roster' using errcode = 'P0001';
    end if;
    update public.applications set status = 'approved' where id::text = p_id;
    delete from intake.application_flags where application_id = p_id;
  elsif p_decision = 'reject' then
    update public.applications set status = 'rejected' where id::text = p_id;
    insert into intake.application_flags (application_id, state, note, flagged_by) values (p_id, 'rejected', left(p_note, 500), auth.uid())
    on conflict (application_id) do update set state = 'rejected', note = excluded.note, flagged_by = excluded.flagged_by, flagged_at = now();
  else
    insert into intake.application_flags (application_id, state, note, flagged_by) values (p_id, 'needs_review', left(p_note, 500), auth.uid())
    on conflict (application_id) do update set state = 'needs_review', note = excluded.note, flagged_by = excluded.flagged_by, flagged_at = now();
  end if;
  insert into intake.review_log (item_id, decision, note, decided_by) values (p_id, p_decision, left(p_note, 500), auth.uid());
  perform hub_activity.log_event(auth.uid(),
    'application.' || case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'needs_review' end, v_label);
  return (select intake.application_row(to_jsonb(a)) from public.applications a where a.id::text = p_id);
end $$;

create or replace function public.admin_data_integrity_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_phone int;
begin
  perform hub_private.require_role('admin');
  -- read through jsonb so this works before and after migration 01 (whatsapp_e164)
  select count(*) into v_phone from public.approved_students p
   where coalesce(to_jsonb(p) ->> 'whatsapp_e164', '') = '';
  return jsonb_build_object(
    'approved_missing_phone', v_phone,
    'applications_not_in_roster', (select count(*) from intake.all_items() i
                                    where i ->> 'status' in ('pending', 'needs_review') and (i ->> 'roster_match')::boolean is false),
    'duplicate_submissions', (select count(*) from (select student_code from intake.form_responses
                                                    where student_code is not null group by student_code having count(*) > 1) d),
    'intake_errors', (select count(*) from intake.errors where resolved_at is null));
end $$;

-- Grants -----------------------------------------------------------------------------

revoke all on all functions in schema intake from public;
do $$
declare f text;
begin
  foreach f in array array['public.admin_application_summary()', 'public.admin_list_applications(text,text,text,int)',
                           'public.admin_review_application(text,text,text)', 'public.admin_data_integrity_summary()'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', f); end if;
  end loop;
  -- intake functions: the Edge Function's service role only — never anon/authenticated
  foreach f in array array['public.ingest_form_response(text,text,timestamptz,jsonb,text,int,text)',
                           'public.record_intake_error(text,text,text)', 'public.reclassify_form_responses()'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.reclassify_form_responses() to authenticated';   -- re-checks admin inside
  end if;
end $$;

do $$ begin
  if coalesce(current_setting('hub.apply', true), '') <> 'yes' then
    raise exception 'DRY RUN complete — nothing was saved. Re-run with: set hub.apply = ''yes''';
  end if;
end $$;
