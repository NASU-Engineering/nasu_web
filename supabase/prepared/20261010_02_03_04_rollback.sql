-- Rollback for 20261010_04, _03, _02 and _00 (run in this order; one transaction).
-- DRY RUN unless hub.apply = 'yes'. Roll back 01 (WhatsApp) separately with 20261010_01_rollback.sql.
--
-- WARNING: this deletes the data those migrations collected (form intake records,
-- quiz attempts, XP, activity events). Export what must be kept first, e.g.
--   \copy (select * from intake.form_responses) to 'intake_backup.csv' csv header
-- Existing production tables (applications, approved_students, audit_logs, auth.users)
-- are not modified except for removing the triggers these migrations added.

-- 04 · intake & applications review
drop function if exists public.admin_application_summary();
drop function if exists public.admin_list_applications(text, text, text, int);
drop function if exists public.admin_review_application(text, text, text);
drop function if exists public.admin_data_integrity_summary();
drop function if exists public.ingest_form_response(text, text, timestamptz, jsonb, text, int, text);
drop function if exists public.record_intake_error(text, text, text);
drop function if exists public.reclassify_form_responses();
drop schema if exists intake cascade;

-- 03 · engagement
drop function if exists public.list_quizzes(text);
drop function if exists public.get_quiz(uuid);
drop function if exists public.start_quiz_attempt(uuid);
drop function if exists public.submit_quiz_attempt(uuid, jsonb);
drop function if exists public.list_activities();
drop function if exists public.join_activity(uuid);
drop function if exists public.leave_activity(uuid);
drop function if exists public.get_my_progress();
drop function if exists public.get_leaderboard(text);
drop function if exists public.set_leaderboard_opt_out(boolean);
drop function if exists public.confirm_attendance(uuid, uuid[]);
drop function if exists public.admin_adjust_xp(uuid, int, text);
drop function if exists public.admin_list_quizzes();
drop function if exists public.admin_list_activities();
drop function if exists public.admin_engagement_stats();
drop schema if exists engage cascade;

-- 02 · activity & presence
do $$ begin
  if to_regclass('public.audit_logs') is not null then execute 'drop trigger if exists audit_logs_to_activity on public.audit_logs'; end if;
  if to_regclass('auth.users') is not null then execute 'drop trigger if exists hub_activity_sign_in on auth.users'; end if;
end $$;
drop function if exists public.record_presence();
drop function if exists public.admin_activity_summary();
drop function if exists public.admin_recent_activity(int);
drop schema if exists hub_activity cascade;

-- 00 · helpers (only if 01 has been rolled back too — 01's triggers use them)
do $$ begin
  if exists (select 1 from pg_trigger where tgname in ('approved_students_fill_whatsapp', 'applications_propagate_whatsapp')) then
    raise notice 'keeping schema hub_private: migration 01 is still applied';
  else
    execute 'drop schema if exists hub_private cascade';
  end if;
end $$;

do $$ begin
  if coalesce(current_setting('hub.apply', true), '') <> 'yes' then
    raise exception 'DRY RUN complete — nothing was saved. Re-run with: set hub.apply = ''yes''';
  end if;
end $$;
