-- ROLLBACK for proposal 01 — removes the additive column. NOT APPLIED.
-- Only run if 01 was committed and must be undone. Loses any whatsapp_e164
-- values written since (run 02_rollback first if 02 was applied).
begin;
alter table public.approved_students drop constraint if exists approved_students_whatsapp_e164_format;
alter table public.approved_students drop column if exists whatsapp_e164;
select count(*) as remaining_e164_columns
from information_schema.columns
where table_schema = 'public' and table_name = 'approved_students' and column_name = 'whatsapp_e164';  -- expect 0
rollback;  -- change to COMMIT only after approval
