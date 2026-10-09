-- Rollback for 20261010_01 — restores the pre-migration WhatsApp state from the backup.
-- DRY RUN unless hub.apply = 'yes'. Counts only; no phone values are printed.

do $$ begin
  if to_regclass('ops_backup.approved_students_whatsapp_20261010') is null then
    raise exception 'rollback: backup table ops_backup.approved_students_whatsapp_20261010 not found';
  end if;
end $$;

drop trigger if exists approved_students_fill_whatsapp on public.approved_students;
drop trigger if exists applications_propagate_whatsapp on public.applications;
drop function if exists hub_private.approved_students_fill_whatsapp();
drop function if exists hub_private.applications_propagate_whatsapp();

-- Restore the values exactly as they were (they were NULL for all 59 before the backfill).
update public.approved_students p
   set whatsapp_number = b.whatsapp_number_before
  from ops_backup.approved_students_whatsapp_20261010 b
 where b.id = p.id and p.whatsapp_number is distinct from b.whatsapp_number_before;

alter table public.approved_students drop constraint if exists approved_students_whatsapp_e164_format;
alter table public.approved_students drop column if exists whatsapp_e164;

-- Column types back to what they were, only if every value still converts losslessly.
do $$
declare t_approved text := (select column_type_before from ops_backup.approved_students_whatsapp_20261010 limit 1);
        t_app text := (select column_type_before from ops_backup.applications_whatsapp_type_20261010 limit 1);
begin
  if t_approved = 'bigint' then
    if exists (select 1 from public.approved_students where whatsapp_number is not null and whatsapp_number !~ '^[0-9]{1,18}$') then
      raise exception 'rollback: approved_students has non-numeric phone values; keep the text column (safer) or clean them first';
    end if;
    alter table public.approved_students alter column whatsapp_number type bigint using whatsapp_number::bigint;
  end if;
  if t_app = 'bigint' then
    if exists (select 1 from public.applications where whatsapp_number is not null and whatsapp_number !~ '^[0-9]{1,18}$') then
      raise exception 'rollback: applications has non-numeric phone values; keep the text column (safer) or clean them first';
    end if;
    alter table public.applications alter column whatsapp_number type bigint using whatsapp_number::bigint;
  end if;
end $$;

do $$ begin
  raise notice 'rollback: approved=% with_number=%', (select count(*) from public.approved_students),
    (select count(*) from public.approved_students where whatsapp_number is not null);
  if coalesce(current_setting('hub.apply', true), '') <> 'yes' then
    raise exception 'DRY RUN complete — nothing was saved. Re-run with: set hub.apply = ''yes''';
  end if;
end $$;
-- The backup tables are kept on purpose; drop ops_backup.*_20261010 in a later, separate step.
