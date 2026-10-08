-- ROLLBACK for proposal 02 — restores whatsapp_e164 from the backup. NOT APPLIED.
-- Only run if 02 was committed and must be undone.
begin;

select count(*) as backup_rows from ops_backup.approved_students_whatsapp_20261009;  -- expect 59

update public.approved_students p
set whatsapp_e164 = b.whatsapp_e164
from ops_backup.approved_students_whatsapp_20261009 b
where p.id = b.id and p.whatsapp_e164 is distinct from b.whatsapp_e164;

-- Verify: no row differs from the backup
select count(*) as differing_rows
from public.approved_students p
join ops_backup.approved_students_whatsapp_20261009 b on b.id = p.id
where p.whatsapp_e164 is distinct from b.whatsapp_e164;  -- expect 0

rollback;  -- change to COMMIT only after approval
-- Keep the backup table until the change is signed off; then:
-- drop table ops_backup.approved_students_whatsapp_20261009;
