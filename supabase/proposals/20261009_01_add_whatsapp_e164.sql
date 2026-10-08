-- PROPOSAL 01 · Store WhatsApp numbers as E.164 TEXT — NOT APPLIED.
-- Needs backend-owner approval. Run on a branch/staging database first.
--
-- Why: approved_students.whatsapp_number is bigint, which silently drops the
-- leading 0 of Egyptian mobiles (01012345678 → 1012345678), cannot hold "+",
-- and invites arithmetic on an identifier. A phone number is text.
--
-- This step is additive: it adds `whatsapp_e164 text` alongside the bigint
-- column. Nothing is removed; existing readers keep working. The bigint column
-- is retired only after every reader uses whatsapp_e164 (separate change).
--
-- SAFETY: the transaction ends in ROLLBACK. Review the output, then change the
-- last line to COMMIT to apply. Rollback script: 20261009_01_rollback.sql

begin;

alter table public.approved_students
  add column if not exists whatsapp_e164 text;

-- E.164: '+' then 8–15 digits, first digit non-zero. Egyptian mobiles: +201[0125]XXXXXXXX.
-- NOT VALID first so the constraint applies to new writes immediately without
-- scanning old rows; VALIDATE after the backfill (proposal 02).
alter table public.approved_students
  add constraint approved_students_whatsapp_e164_format
  check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$') not valid;

comment on column public.approved_students.whatsapp_e164 is
  'WhatsApp number in E.164 text form (e.g. +201012345678). Replaces bigint whatsapp_number.';

-- Column privileges: keep whatever RLS/grants already protect approved_students.
-- Verify no new exposure (expect no rows granting anon):
select grantee, privilege_type from information_schema.role_column_grants
where table_schema = 'public' and table_name = 'approved_students' and column_name = 'whatsapp_e164';

-- Verification
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'approved_students' and column_name in ('whatsapp_number', 'whatsapp_e164');

rollback;  -- change to COMMIT only after review and approval
