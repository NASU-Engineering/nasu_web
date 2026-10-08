-- PROPOSAL 02 · Backfill recoverable WhatsApp numbers — NOT APPLIED.
-- Needs backend-owner approval. Requires proposal 01 (whatsapp_e164) committed.
--
-- Scope (verified findings): 59 approved students, all with whatsapp_number NULL;
-- 57 have a linked application whose phone normalises to a valid Egyptian
-- mobile; 2 need manual review and are NOT touched here.
--
-- What it does, in one transaction:
--   1. backup   — snapshot of (id, whatsapp_number, whatsapp_e164) into ops_backup
--   2. dry run  — counts of what would change (no phone values printed)
--   3. guard    — aborts unless exactly the expected number of rows qualify
--   4. update   — sets whatsapp_e164 only where it is NULL (never overwrites)
--   5. verify   — post-update counts and constraint validation
-- Ends in ROLLBACK by default. Change the last line to COMMIT after review.
-- Undo after commit: 20261009_02_rollback.sql (restores from the backup).
--
-- ASSUMED COLUMNS — confirm with supabase/inspection/01 and adjust ONLY the
-- `candidates` CTE: approved_students(id, application_id, whatsapp_number,
-- whatsapp_e164) and applications(id, whatsapp_number).

begin;

-- 0. Normaliser (session-only; pg_temp objects disappear at the end of the session)
create or replace function pg_temp.eg_mobile_e164(raw text) returns text
language sql immutable as $$
  select case
    when d ~ '^01[0125][0-9]{8}$'     then '+2' || d
    when d ~ '^1[0125][0-9]{8}$'      then '+20' || d        -- bigint lost the leading 0
    when d ~ '^201[0125][0-9]{8}$'    then '+' || d
    when d ~ '^00201[0125][0-9]{8}$'  then '+' || substr(d, 3)
    else null
  end
  from (select regexp_replace(translate(coalesce(raw, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g') as d) x
$$;

-- 1. Backup (private schema, not exposed through the API)
create schema if not exists ops_backup;
revoke all on schema ops_backup from anon, authenticated;
create table if not exists ops_backup.approved_students_whatsapp_20261009 as
  select id, whatsapp_number, whatsapp_e164, now() as backed_up_at
  from public.approved_students;
revoke all on ops_backup.approved_students_whatsapp_20261009 from anon, authenticated;

-- 2. Dry run
create temp table candidates on commit drop as
  select p.id as approved_id, a.id as application_id, pg_temp.eg_mobile_e164(a.whatsapp_number::text) as e164
  from public.approved_students p
  join public.applications a on a.id = p.application_id      -- or: on a.student_code = p.student_code
  where p.whatsapp_number is null and p.whatsapp_e164 is null;

select
  (select count(*) from public.approved_students)                       as approved_total,
  (select count(*) from candidates)                                      as missing_phone_with_application,
  (select count(*) from candidates where e164 is not null)               as will_update,
  (select count(*) from candidates where e164 is null)                   as left_for_manual_review,
  (select count(*) from (select e164 from candidates where e164 is not null group by e164 having count(*) > 1) x)
                                                                         as duplicate_numbers_across_students;

-- 3. Guard — set the expected count from the verified findings / dry run.
do $$
declare n int;
begin
  select count(*) into n from candidates where e164 is not null;
  if n <> 57 then
    raise exception 'Backfill guard: expected 57 recoverable numbers, found %. Nothing changed.', n;
  end if;
end $$;

-- 4. Update — only empty values, never overwrite
update public.approved_students p
set whatsapp_e164 = c.e164
from candidates c
where p.id = c.approved_id and c.e164 is not null and p.whatsapp_e164 is null;

-- 5. Verify
select
  (select count(*) from public.approved_students where whatsapp_e164 is not null) as with_e164,
  (select count(*) from public.approved_students where whatsapp_e164 is null)     as still_missing,  -- expect 2
  (select count(*) from public.approved_students where whatsapp_e164 !~ '^\+201[0125][0-9]{8}$') as non_egyptian_format;
alter table public.approved_students validate constraint approved_students_whatsapp_e164_format;

rollback;  -- change to COMMIT only after review and approval
