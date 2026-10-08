# Student data integrity — findings, reconciliation and proposed fixes

Status: **analysis + proposals. Nothing has been applied to any database.**
Every write in this package needs explicit approval from the backend owner and
should run on a staging/branch database first.

## 1. Verified findings (reported by the backend owner)

These counts were verified against the production database by the backend
owner (ChatGPT) and are reproduced here as given. This frontend session has
**no database access** and did not re-query production.

| Finding | Count |
|---|---|
| `applications` rows | 66 |
| `approved_students` rows | 59 |
| approved students with `whatsapp_number = NULL` | 59 (all) |
| … whose linked application has a phone in the expected numeric format | 57 |
| … needing manual phone review | 2 |
| Google Forms CSV responses | 74 |
| … unique non-blank Student Codes | 69 |
| CSV codes missing from `applications` | 7 (none in `university_students`) |
| `applications` whose code is not in the CSV | 4 |

Implications:
- **Every approved student lost their WhatsApp number.** 57 are recoverable
  from the linked application; 2 need a person to check.
- **7 form responses never became applications**, and none of those codes are
  in the university roster — likely typos, non-prep-year students, or roster
  gaps. They must **not** be approved automatically; each needs a human review.
- **4 applications have no matching form response** — created another way
  (manual entry, an older form, a corrected code). Provenance to be confirmed.
- 74 responses vs 69 unique codes → 5 responses are blank or repeat a code.
  Every response is kept; only the latest per code feeds an application, and
  duplicates are flagged.

## 2. What is in this package

| Path | Kind | Effect |
|---|---|---|
| `supabase/inspection/01_schema_inspection.sql` | read-only | real columns, types, keys, triggers, RLS policies, approval functions, grants, migrations |
| `supabase/inspection/02_reconciliation_readonly.sql` | read-only | counts across applications / approved / roster; phone recoverability; link checks |
| `supabase/inspection/03_phone_review_readonly.sql` | read-only | ids + format diagnosis of the numbers needing review (no number shown) |
| `supabase/proposals/20261009_01_add_whatsapp_e164.sql` (+ rollback) | proposal | adds `whatsapp_e164 text` with an E.164 check; additive |
| `supabase/proposals/20261009_02_backfill_whatsapp_e164.sql` (+ rollback) | proposal | backs up, dry-runs, guards (= 57), backfills only empty values |
| `tools/reconcile/` | local tool | compares the Forms CSV with exported tables; shareable report has counts + salted refs only |
| `docs/data-integrity/FORMS_SYNC.md` | design | reliable Google Forms → Supabase sync |

Both proposals **end in `ROLLBACK`**: running them unchanged shows the dry run
and verification output but persists nothing.

## 3. Runbook (requires approval at each ⛔)

1. Run `01_schema_inspection.sql`. Compare the real column names with the
   **assumed** names listed at the top of 02, 03 and proposal 02, and edit
   those (only the marked CTEs) to match. Confirm how `approved_students`
   links to `applications` (`application_id` FK vs `student_code`).
2. Read the approval function(s) found by query 6 of 01 — see §5.
3. Run 02 and 03. Expect: 59 approved, 59 NULL phones, 57 backfill
   candidates, 2 for review. Any difference → stop and investigate.
4. Optional cross-check with the Forms CSV: export the four tables to CSV on an
   operator machine and run `tools/reconcile` (§6). Expect 7 CSV codes missing
   from applications (0 in roster) and 4 applications not in the CSV.
5. ⛔ **Backup**: take a database backup/PITR checkpoint (Supabase dashboard →
   Backups) before any write. Proposal 02 also snapshots the affected columns
   into `ops_backup.approved_students_whatsapp_20261009`.
6. ⛔ Run proposal 01 on staging with `COMMIT`; check readers still work. Then
   production.
7. ⛔ Run proposal 02 as-is (ROLLBACK) and read the dry run. If `will_update`
   is 57, `left_for_manual_review` is 2 and `duplicate_numbers_across_students`
   is 0, switch to `COMMIT`. The guard aborts if the count isn't exactly 57.
8. Resolve the 2 review cases with 03 (§4), then set those two
   `whatsapp_e164` values by hand in a reviewed statement.
9. Rollback at any time after commit: `20261009_02_rollback.sql` (restores from
   the backup), then `20261009_01_rollback.sql` if the column must go.

Verification after commit:

```sql
select count(*) filter (where whatsapp_e164 is not null) as with_number,     -- 57, then 59 after review
       count(*) filter (where whatsapp_e164 is null)     as missing           -- 2, then 0
from public.approved_students;
```

## 4. The 2 numbers needing review

`03_phone_review_readonly.sql` lists, per case, the approved id, application
id, digit count, first three digits and a diagnosis (too short / too long /
foreign prefix / unexpected network prefix) — never the number. Then:

- Compare with the original Google Forms response for that student (the form
  keeps what was typed; the Sheet may have reformatted it — scientific notation
  and dropped leading zeros are common).
- If still unclear, contact the student through an official channel and record
  the corrected number with who confirmed it and when.
- Foreign numbers are valid E.164 (`+966…`) and pass the column check; the
  Egyptian-mobile pattern is only a data-quality signal.

## 5. Relationships and approval logic — what to check

Using 01 (constraints, triggers, functions) and 02:

- `approved_students.application_id` should be a **foreign key** to
  `applications.id`, `not null`, and **unique** (one approval per application).
- `approved_students.student_code` should be **unique** and match the linked
  application's code (02 reports mismatches).
- Every approved code should exist in `university_students` (02 reports gaps).
- The approval function should copy the phone from the application **as text**
  into `whatsapp_e164` — the fact that all 59 are NULL suggests it never copied
  the phone at all, or wrote to a column that was later replaced. Fix the
  function before the next approval round, or new approvals will be NULL too.
- Approval must remain an explicit admin action; no trigger should approve on
  insert. Unmatched form codes go to a review list, not to `approved_students`.

## 6. Reconciliation tool (local, read-only)

```bash
# Exports go in tools/reconcile/data/ (git-ignored). Use a long random salt.
RECONCILE_SALT='…' node tools/reconcile/cli.mjs \
  --responses tools/reconcile/data/form_responses.csv \
  --applications tools/reconcile/data/applications.csv \
  --approved tools/reconcile/data/approved_students.csv \
  --roster tools/reconcile/data/university_students.csv \
  --link-column application_id
```

- `out/report.md` — shareable: counts and salted references (`S-xxxxxxxx`).
- `out/private/details.csv` — operator only: codes, record ids, last two digits of
  normalised phones. Never commit or share.
- No network access; nothing is written to any database.

## 7. Phone numbers: `bigint` → `text`

Recommendation: store `whatsapp_e164 text` in E.164 form (`+201012345678`).

- `bigint` drops the leading `0` of every Egyptian mobile, cannot represent `+`,
  and lets spreadsheets/clients round long values into scientific notation.
- Text + a check constraint keeps the exact value, supports foreign numbers,
  and makes the format verifiable.
- Migrate additively (proposal 01), backfill (02), move every reader/writer
  (approval function, any export, the WhatsApp onboarding process) to
  `whatsapp_e164`, then drop `whatsapp_number` in a later, separately approved
  change.

## 8. Privacy rules for all of the above

- No phone numbers or student codes in logs, commit messages, issue trackers,
  chat, screenshots or public previews. Reports use salted references.
- CSV exports and tool outputs stay on the operator's machine (`tools/reconcile/data|out` are git-ignored) and are deleted after use.
- The public mock preview contains no real data and no backend credentials.
