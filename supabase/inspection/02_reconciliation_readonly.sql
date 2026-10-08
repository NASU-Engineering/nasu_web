-- 02 · Reconciliation — READ-ONLY (SELECT only). Returns counts and record ids;
-- it never selects phone numbers.
--
-- ASSUMED COLUMN NAMES — confirm with 01_schema_inspection.sql and edit the
-- `src_*` CTEs below (the only place names appear) before running:
--   applications(id, student_code, whatsapp_number)          -- phone column name/type to confirm
--   approved_students(id, student_code, whatsapp_number bigint, application_id?)
--   university_students(student_code)
-- If approved_students has no application_id, switch the `link` CTE to the
-- student_code variant (commented below).

with
src_app as (
  select id::text as app_id,
         upper(regexp_replace(student_code::text, '\s', '', 'g')) as code,
         whatsapp_number::text as phone_raw
  from public.applications
),
src_approved as (
  select id::text as approved_id,
         upper(regexp_replace(student_code::text, '\s', '', 'g')) as code,
         whatsapp_number::text as phone_raw,
         application_id::text as app_id          -- remove if the column does not exist
  from public.approved_students
),
src_roster as (
  select distinct upper(regexp_replace(student_code::text, '\s', '', 'g')) as code
  from public.university_students
),
-- Phone classification (digits only; mirrors tools/reconcile/lib.mjs normalizePhone)
app_phone as (
  select app_id, code,
         regexp_replace(translate(coalesce(phone_raw, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g') as d
  from src_app
),
app_phone_class as (
  select app_id, code, d,
         case
           when d = '' then 'blank'
           when d ~ '^01[0125][0-9]{8}$' then 'ok'          -- 01XXXXXXXXX
           when d ~ '^1[0125][0-9]{8}$' then 'ok'           -- bigint dropped the leading 0
           when d ~ '^201[0125][0-9]{8}$' then 'ok'         -- 20 country code
           when d ~ '^00201[0125][0-9]{8}$' then 'ok'
           else 'review'
         end as status
  from app_phone
),
link as (
  select p.approved_id, p.code, p.phone_raw, a.app_id, a.code as app_code
  from src_approved p
  left join src_app a on a.app_id = p.app_id
  -- student_code variant:  left join src_app a on a.code = p.code
)
select 'applications' as check_name, count(*)::int as n from src_app
union all select 'approved_students', count(*) from src_approved
union all select 'university_students (distinct codes)', count(*) from src_roster
union all select 'approved with whatsapp_number NULL', count(*) from src_approved where phone_raw is null
union all select 'approved without a linked application', count(*) from link where app_id is null
union all select 'approved whose linked application has a different code', count(*) from link where app_id is not null and app_code <> code
union all select 'approved not in university_students', count(*) from src_approved p where not exists (select 1 from src_roster r where r.code = p.code)
union all select 'codes approved more than once', count(*) from (select code from src_approved group by code having count(*) > 1) x
union all select 'codes with more than one application', count(*) from (select code from src_app group by code having count(*) > 1) x
union all select 'applications not approved', count(*) from src_app a where not exists (select 1 from link l where l.app_id = a.app_id)
union all select 'phone backfill candidates (approved NULL, application phone ok)', count(*)
  from link l join app_phone_class c on c.app_id = l.app_id where l.phone_raw is null and c.status = 'ok'
union all select 'phone needs manual review (approved NULL, application phone not ok)', count(*)
  from link l join app_phone_class c on c.app_id = l.app_id where l.phone_raw is null and c.status <> 'ok';

-- Ids of the phone numbers that need manual review: 03_phone_review_readonly.sql
