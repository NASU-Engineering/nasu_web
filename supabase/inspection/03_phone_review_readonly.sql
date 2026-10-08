-- 03 · Phone numbers needing manual review — READ-ONLY.
-- Lists record ids and a format diagnosis (digit count, first 3 digits) — never
-- the number itself. Expected: the 2 cases from the verified findings.
-- Same assumed column names as 02 — confirm with 01 first.

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
select l.approved_id, l.app_id, c.status,
       length(c.d) as digit_count,
       left(c.d, 3) as first_digits,
       case
         when c.d = '' then 'application has no phone'
         when length(c.d) < 10 then 'too short'
         when length(c.d) > 14 then 'too long'
         when c.d !~ '^(0?1|20|0020)' then 'not an Egyptian mobile prefix (foreign or typo)'
         else 'unexpected network prefix'
       end as diagnosis
from link l
join app_phone_class c on c.app_id = l.app_id
where l.phone_raw is null and c.status <> 'ok'
order by l.approved_id;
