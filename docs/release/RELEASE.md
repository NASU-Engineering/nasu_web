# Release notes and checklist: platform simplification, backend integration, data repair

Branch `feature/hub-platform-redesign`. **Not merged. Not deployed. Production not modified.**
Builds on `4761409`; this file ships in the commit it describes.

## 1. Status

### Implemented and tested
- **Admin Control Center: four destinations** — Overview · Students & Team · Content · Settings. There are no nested tab bars any more.
  - Overview: six KPIs, Action required (each item links to its workflow), Recent activity and Platform health. Health lists only checks that actually exist.
  - Students & Team: one directory with a Students / Applications / Staff switch. Records open in a drawer; roles and scopes are managed there. Permissions are explained in a dialog, not on a page.
  - Content: one list for resources, assignments, quizzes, activities and announcements, filtered by type, status, subject, section and creator. "Pending review" opens the **shared** review page that the Review Desk uses, so review is implemented once.
  - Settings: General · Appearance · Access & security · Advanced. Advanced is collapsed and holds the simulator, diagnostics and data-integrity reports.
  - Detailed analytics, the audit log and the simulator are contextual pages, not tabs. Old URLs redirect.
- **Themes:** System · Dark · Light · Warm paper · High contrast. System follows the operating system and says which theme it is using ("System — currently Dark"). High contrast is black and white with one restrained accent instead of yellow on everything. The selector is a compact list with a preview of each theme. Theme switching needs no reload. Component colours are tokens. WCAG contrast is tested: AA for every theme, AAA for High contrast.
- **Server-authoritative quiz flow in the frontend:** the server starts the attempt, the timer comes from the server, and the browser sends answers only.
- **Access refresh:** roles are re-read from the backend at least every 2 minutes (security finding F1).
- English and Arabic for all new UI; RTL and responsive layout checked in the browser (§5).

### Implemented but not connected (production keeps these off)
- The **frontend adapters** for engagement (`supabase-engage.js`), presence and activity, applications review, and data integrity (`supabase-ops.js`). They are verified against the real prepared RPCs in an isolated database (`supabase/tests/contract.test.mjs`).
- In production, `CONFIG.features.engagement = false` and `presence = false`. Until the migrations are applied, every such call answers `backend_required`, and the UI shows "Not collected" or "not live yet". It never shows zero or sample data, and never falls back to the mock.

### Prepared for database approval (tested in isolation, NOT applied)
| File | What |
|---|---|
| `supabase/prepared/20261010_00_common.sql` | Private helpers. Roles and identity come from the existing `get_my_access()` / `get_my_profile()`. |
| `20261010_01_whatsapp_text_and_sync.sql` (+ `_rollback`) | Phones stored as text; copy-on-approval trigger (fixes the `sync_approved_student()` bug); guarded backfill of 57 rows; follow-up trigger for later corrections. |
| `20261010_02_activity_presence.sql` | Presence heartbeat; Online now and Active today; sign-in, content and role events; 180-day retention. |
| `20261010_03_engagement.sql` | Quizzes, activities, XP ledger, levels, leaderboards (design: `docs/ENGAGEMENT.md`). |
| `20261010_04_intake_and_applications.sql` | Idempotent Google Forms intake; review workflow; admin applications review. |
| `20261010_02_03_04_rollback.sql` | Removes 02–04 (and 00 once 01 is rolled back). |
| `supabase/inspection/04_security_audit_readonly.sql` | Read-only production security audit (`docs/SECURITY_AUDIT.md`). |

### Not implemented
- **Authoring** quizzes and activities in the Admin UI. The tables and RPCs exist; authoring forms are a follow-up.
- **Archive** action for content: there is no archive RPC, so the UI doesn't offer it.
- Realtime connectivity and Storage health checks on the Overview. There is no browser-side check that is honest, so they aren't shown.
- A **real** Google Forms reconciliation run. It needs the private exports, which never enter this repository (§3).
- The student-facing read API for published course content. Production still shows labelled sample content.

## 2. Database migration plan (each ⛔ needs explicit approval)

Order: **00 → 01 → 02 → 03 → 04**. Every file:
- starts with a preflight that aborts if the assumed tables or columns don't exist
- is a **dry run** unless `hub.apply = 'yes'`: the last statement raises, so the transaction rolls back
- prints counts only, never phone numbers or codes

1. **Preflight (read-only).** Run `supabase/inspection/01_schema_inspection.sql`, `03_phone_review_readonly.sql` and `04_security_audit_readonly.sql`. Confirm:
   - `approved_students.application_id` links to `applications.id`
   - the phone column names and types
   - `applications.status` uses `pending` / `approved` / `rejected`
   - the body of `sync_approved_student()` (G3)
   - the identity mapping (G1)

   Adapt only the marked names if they differ.
2. **Staging.** Restore a recent backup into a separate Supabase project (or a branch). Run every file there with `hub.apply = 'yes'` and check the app against it (§2.4).
3. **Backup** ⛔. Take a dashboard backup or PITR checkpoint immediately before production. Migration 01 also snapshots the phone columns into `ops_backup.*_20261010`.
4. **Apply** ⛔, one transaction per file:
   ```
   psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
     -c "set hub.apply = 'yes'; set hub.expected_backfill = '57';" -f supabase/prepared/20261010_01_whatsapp_text_and_sync.sql
   ```
   Migration 01 aborts, changing nothing, unless exactly 57 rows are recoverable.
5. **Verify** (counts only):
   ```sql
   select count(*) filter (where whatsapp_number is not null) as with_number,     -- 57
          count(*) filter (where whatsapp_e164 is null)       as needs_review     -- 2
   from public.approved_students;
   select public.admin_data_integrity_summary();                                  -- as an admin
   ```
   Then approve one test application on staging and confirm the approved row has the phone.
6. **The 2 manual cases:** use `03_phone_review_readonly.sql` (ids and a diagnosis, never the number). Compare with the original form answer, or confirm with the student through an official channel. Set the value in a reviewed `UPDATE`; the triggers never overwrite it.
7. **Switch on** ⛔: set `features.presence = true` and then `engagement = true` in `assets/js/config.js` (a reviewed code change).
8. **Rollback:** `20261010_02_03_04_rollback.sql`, then `20261010_01_rollback.sql`. Both are dry runs by default. Export intake and XP data first if it must be kept.

## 3. Google Forms reconciliation report

**Method:** `tools/reconcile/` runs locally on exports of the Forms CSV, the Google Sheet, `applications`, `approved_students` and `university_students`. It needs no network access and writes nothing to any database.
- The shareable report has counts and salted references only.
- The private files (`out/private/`) hold codes, source rows and timestamps.
- `--emit-intake` writes idempotent `ingest_form_response` calls. They put the missing submissions into the **review** workflow and never approve anyone.

**Validated against the verified findings (synthetic data, `supabase/tests/forms.test.mjs`):**

| Check | Verified finding | Tool result (synthetic replica) |
|---|---|---|
| Form responses | 74 | 74 |
| … with a student code | 72 | 72 (2 blank) |
| … distinct codes | 69 | 69 (3 codes submitted twice) |
| CSV codes missing from `applications` | 7 | 7 |
| … of which in the roster | 0 | 0 |
| Applications not in the CSV | 4 | 4 |
| Google Sheet rows | 71 | 71: the 3 export rows missing from the Sheet are listed with source row and timestamp |
| Conflicting resubmissions | — | flagged (same code, different name or phone) |
| Loading the 7 missing codes | — | 8 responses land in **needs_review** (`not_in_roster`); a re-run changes nothing; **0 approvals** |

**Real run (operator, after approval):**
```
RECONCILE_SALT='<secret>' node tools/reconcile/cli.mjs --responses data/form_responses.csv --sheet data/google_sheet.csv \
  --applications data/applications.csv --approved data/approved_students.csv --roster data/university_students.csv \
  --link-column application_id --emit-intake
```
Review `out/report.md`. Load `out/private/intake.sql` only after approval, on staging first.

## 4. Tests

| Suite | Command | Result |
|---|---|---|
| Frontend unit and static security (i18n parity, WCAG contrast, multi-role matrix, navigation, XP and quiz rules, mock flows, allow-listed RPCs) | `npm test` | **116 pass** |
| Isolated database (migrations, RLS, grants, XP manipulation, replay, attempt limits, cross-student access, leaderboard privacy, presence, intake idempotency, approval rules, rollbacks, frontend↔RPC contract, Forms reconciliation) | `npm install && npm run test:db` | **47 pass** |

## 5. Browser verification (mock build)

Checks were run in the browser on the mock build:
- **Widths:** 375 / 768 / 1280.
- **Overflow:** none on any of the 22 Admin, Studio, Review and Student routes at 375px in Arabic RTL.
- **Translation keys:** none raw.
- **Themes:** all five switched live.
- **Flows:** the application drawer, roster-blocked approval, the unified content list with the pending filter, the settings theme selector, and the mobile drawer.

Screenshots are in `docs/release/screenshots/`:

| | |
|---|---|
| 01 Admin Overview (dark) | 02 Application review drawer |
| 03 Content: pending review | 04 Settings: theme selector |
| 05 Light · 06 Warm paper · 07 High contrast | 08 Overview, mobile, Arabic · 09 Student drawer, mobile, Arabic |

## 6. Remaining blockers before a production release

1. Backend-owner run of the read-only inspection and security audit; resolve any Critical or High finding (`docs/SECURITY_AUDIT.md` §3), especially **G1**, the identity mapping.
2. Approval and staging run of migrations 00–04, then production with the backup step.
3. Resolve the 2 WhatsApp manual cases and review the 7 unmatched submissions.
4. A published-content read API, so students see real course content instead of the labelled sample.
5. Authoring UI for quizzes and activities, or seeding them through reviewed SQL.
6. Merge to `main` only after review. (Not done here, as instructed.)

## 7. Release checklist

- [ ] Inspection 01 / 03 / 04 run; column names confirmed; G1 identity mapping confirmed
- [ ] No Critical or High findings open
- [ ] Staging restored; migrations 00–04 applied there; `npm run test:db` scenarios re-checked against staging
- [ ] Backup / PITR checkpoint taken ⛔
- [ ] 01 applied (57 / 2 verified) ⛔ · 02 ⛔ · 03 ⛔ · 04 ⛔
- [ ] 2 phone numbers resolved by a person; 7 submissions reviewed
- [ ] `features.presence`, then `features.engagement`, switched on in a reviewed change
- [ ] Admin Overview shows live values (no "Not collected" for applied features)
- [ ] PR reviewed and merged by the team; production deploy confirmed
