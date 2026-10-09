-- 20261010_01 · WhatsApp numbers: text storage, copy-on-approval, safe backfill — PREPARED, NOT APPLIED.
-- Requires 20261010_00_common.sql. Supersedes the earlier 20261009 proposals.
--
-- Verified findings: 59 approved_students, ALL with whatsapp_number NULL; 57 have
-- a recoverable phone in the linked application; 2 need manual review.
-- Root cause: sync_approved_student() never copies the phone, so a backfill alone
-- would be undone by the next approval.
--
-- What this does (one transaction; DRY RUN unless hub.apply = 'yes'):
--   0. preflight   — fails loudly if the assumed tables/columns/link don't exist
--   1. backup      — ops_backup.approved_students_whatsapp_20261010 (private schema)
--   2. text        — approved_students.whatsapp_number and applications.whatsapp_number
--                    become TEXT (bigint drops leading zeros and can't hold '+')
--   3. e164        — adds approved_students.whatsapp_e164 (normalised copy for messaging)
--   4. copy fix    — BEFORE trigger on approved_students fills the phone from the linked
--                    application on insert / re-link. This fixes EVERY approval path,
--                    including sync_approved_student(), without editing a function body
--                    we haven't reviewed. Nonempty values are never overwritten.
--   5. follow-up   — AFTER UPDATE trigger on applications: a corrected application phone
--                    flows to the approved row ONLY if that row still holds the old copy
--                    (a value verified/edited by staff is left alone).
--   6. backfill    — copies the recoverable phones (guard: exactly hub.expected_backfill
--                    rows, default 57). Unrecoverable ones are left NULL for review.
--   7. verify      — counts only; no phone value is ever selected or logged.
--
-- Run:   set hub.expected_backfill = '57';  set hub.apply = 'yes';  \i this file   (in one transaction)
-- Undo:  20261010_01_rollback.sql

-- 0. Preflight ---------------------------------------------------------------
do $$
declare missing text := '';
  need text[][] := array[
    array['approved_students', 'id'], array['approved_students', 'application_id'], array['approved_students', 'whatsapp_number'],
    array['applications', 'id'], array['applications', 'whatsapp_number']];
  i int;
begin
  for i in 1 .. array_length(need, 1) loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = need[i][1] and column_name = need[i][2]) then
      missing := missing || format(' %s.%s', need[i][1], need[i][2]);
    end if;
  end loop;
  if missing <> '' then raise exception 'preflight: missing columns:% — adapt this migration to the real schema first', missing; end if;
  if to_regprocedure('hub_private.eg_mobile_e164(text)') is null then raise exception 'preflight: run 20261010_00_common.sql first'; end if;
  if exists (select 1 from public.approved_students p left join public.applications a on a.id = p.application_id where a.id is null) then
    raise exception 'preflight: some approved_students have no linked application — investigate before backfilling';
  end if;
end $$;

-- 1. Backup (raw values as text; private schema, never exposed through the API)
create schema if not exists ops_backup;
revoke all on schema ops_backup from public;
create table if not exists ops_backup.approved_students_whatsapp_20261010 as
  select p.id, p.application_id, p.whatsapp_number::text as whatsapp_number_before,
         pg_typeof(p.whatsapp_number)::text as column_type_before, now() as backed_up_at
  from public.approved_students p;
create table if not exists ops_backup.applications_whatsapp_type_20261010 as
  select (select data_type from information_schema.columns
          where table_schema = 'public' and table_name = 'applications' and column_name = 'whatsapp_number') as column_type_before,
         now() as backed_up_at;
revoke all on all tables in schema ops_backup from public;

-- 2. Phone columns as text (value preserved exactly as stored; no reformatting)
do $$ begin
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'approved_students' and column_name = 'whatsapp_number') <> 'text' then
    alter table public.approved_students alter column whatsapp_number type text using whatsapp_number::text;
  end if;
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'applications' and column_name = 'whatsapp_number') <> 'text' then
    alter table public.applications alter column whatsapp_number type text using whatsapp_number::text;
  end if;
end $$;

-- 3. Normalised copy for messaging (E.164). NOT VALID: existing rows are checked at step 7.
alter table public.approved_students add column if not exists whatsapp_e164 text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'approved_students_whatsapp_e164_format') then
    alter table public.approved_students add constraint approved_students_whatsapp_e164_format
      check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$') not valid;
  end if;
end $$;
comment on column public.approved_students.whatsapp_number is 'WhatsApp number as provided (text; copied from the linked application on approval).';
comment on column public.approved_students.whatsapp_e164 is 'Normalised E.164 copy for messaging; NULL when the source needs manual review.';

-- 4. Copy-on-approval: fill an empty phone from the linked application
create or replace function hub_private.approved_students_fill_whatsapp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare src text;
begin
  if coalesce(btrim(new.whatsapp_number), '') = '' and new.application_id is not null then
    select nullif(btrim(a.whatsapp_number::text), '') into src from public.applications a where a.id = new.application_id;
    new.whatsapp_number := src;
  end if;
  if new.whatsapp_e164 is null and new.whatsapp_number is not null then
    new.whatsapp_e164 := hub_private.eg_mobile_e164(new.whatsapp_number);   -- NULL → manual review
  end if;
  return new;
end $$;

drop trigger if exists approved_students_fill_whatsapp on public.approved_students;
create trigger approved_students_fill_whatsapp
  before insert or update of application_id, whatsapp_number on public.approved_students
  for each row execute function hub_private.approved_students_fill_whatsapp();

-- 5. Corrections on the application flow through only while the approved copy is untouched
create or replace function hub_private.applications_propagate_whatsapp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.whatsapp_number is distinct from old.whatsapp_number then
    update public.approved_students p
       set whatsapp_number = nullif(btrim(new.whatsapp_number::text), ''),
           whatsapp_e164 = hub_private.eg_mobile_e164(new.whatsapp_number::text)
     where p.application_id = new.id
       and (p.whatsapp_number is null or p.whatsapp_number = old.whatsapp_number::text);
  end if;
  return null;
end $$;

drop trigger if exists applications_propagate_whatsapp on public.applications;
create trigger applications_propagate_whatsapp
  after update of whatsapp_number on public.applications
  for each row execute function hub_private.applications_propagate_whatsapp();

revoke all on function hub_private.approved_students_fill_whatsapp() from public;
revoke all on function hub_private.applications_propagate_whatsapp() from public;

-- 6. Backfill the recoverable numbers (guarded)
create temp table wa_candidates on commit drop as
  select p.id as approved_id,
         hub_private.eg_mobile_e164(a.whatsapp_number::text) is not null as recoverable
  from public.approved_students p
  join public.applications a on a.id = p.application_id
  where coalesce(btrim(p.whatsapp_number), '') = '';

do $$
declare expected int := coalesce(nullif(current_setting('hub.expected_backfill', true), ''), '57')::int;
        n int := (select count(*) from wa_candidates where recoverable);
begin
  raise notice 'whatsapp backfill: % recoverable, % left for manual review (expected %)',
    n, (select count(*) from wa_candidates where not recoverable), expected;
  if n <> expected then
    raise exception 'guard: % recoverable rows, expected % — stop and investigate (nothing was changed)', n, expected;
  end if;
end $$;

-- Copy the application value as text, exactly as stored; the trigger derives whatsapp_e164.
update public.approved_students p
   set whatsapp_number = nullif(btrim(a.whatsapp_number::text), '')
  from public.applications a, wa_candidates c
 where c.approved_id = p.id and c.recoverable and a.id = p.application_id;

-- 7. Verify (counts only)
do $$
declare v_total int; v_number int; v_e164 int; v_review int;
begin
  select count(*), count(*) filter (where whatsapp_number is not null), count(*) filter (where whatsapp_e164 is not null),
         count(*) filter (where whatsapp_e164 is null)
    into v_total, v_number, v_e164, v_review from public.approved_students;
  raise notice 'verify: approved=% with_number=% with_e164=% needing_review=%', v_total, v_number, v_e164, v_review;
  if exists (select 1 from (select whatsapp_e164 from public.approved_students where whatsapp_e164 is not null
                            group by whatsapp_e164 having count(*) > 1) d) then
    raise warning 'verify: some WhatsApp numbers are shared by more than one approved student — review before messaging';
  end if;
end $$;
alter table public.approved_students validate constraint approved_students_whatsapp_e164_format;

do $$ begin
  if coalesce(current_setting('hub.apply', true), '') <> 'yes' then
    raise exception 'DRY RUN complete — nothing was saved. Re-run with: set hub.apply = ''yes''';
  end if;
end $$;
