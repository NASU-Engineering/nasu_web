# Security audit — NASU Freshmen Hub (2026-10-10)

Scope: the frontend (everything shipped to the browser), the prepared database
migrations in `supabase/prepared/`, and the production Supabase project.

**What was and wasn't examined.** This session has no access to the production
database (by design: no service-role key, no production probing). Frontend
findings come from code review plus automated checks
(`tests/static-security.test.mjs`). Findings on the prepared migrations come from
tests against an isolated Postgres 17 (`supabase/tests/`, 47 tests). **Production
RLS, grants, Storage and functions are NOT verified.** They need
`supabase/inspection/04_security_audit_readonly.sql`, run by the backend owner;
§3 lists exactly what to look for.

## 1. Findings fixed in this change

| # | Severity | Finding | Fix | Evidence |
|---|---|---|---|---|
| F1 | Medium | Roles were cached in the browser until sign-out, so a revoked role kept its workspace in the UI for the whole session (the backend still refused the calls). | Access is re-read from `get_my_access` at least every 2 minutes (`ACCESS_TTL_MS`). The backend remains the authority on every call. | `services/api.js` |
| F2 | Low | Functions created by later migrations kept Postgres's default `EXECUTE` for `PUBLIC` (trigger functions; not callable as RPCs). | `alter default privileges … revoke execute … from public` in every new schema, plus explicit revokes. | `security.test.mjs` caught it; now passes |
| F3 | Low | Admin UI had hard-coded English role-button labels and an `en-GB`-only audit timestamp. | Translated through the i18n catalog. | key-parity tests |

## 2. Properties verified on the prepared migrations (isolated database)

All of these are automated tests in `supabase/tests/`:

- Every new table has RLS enabled. No API role (anon / authenticated /
  service_role) holds table privileges or schema `USAGE` in the private schemas
  (`hub_private`, `hub_activity`, `engage`, `intake`, `ops_backup`). Data is
  reachable only through RPCs.
- Every `SECURITY DEFINER` function pins `search_path = ''`. `anon` can execute
  none of the new RPCs; internal helpers aren't executable by signed-in users.
- Every `admin_*` RPC and `confirm_attendance` calls `require_role('admin')`.
  Roles are re-read on every call, so revoking admin takes effect on the very
  next request.
- **JWT metadata can't grant anything.** Forged `app_metadata`/`user_metadata`
  roles in the JWT are ignored; only `get_my_access()` decides.
- A missing or expired session gets nothing: every student RPC refuses it.
- A signed-in Microsoft account **without an approved-student profile** is
  refused by every student RPC.
- XP can't be created or changed by clients:
  - direct `INSERT`/`UPDATE` on the XP table is refused
  - the internal award function can't be executed
  - admin adjustments are role-checked
  - unknown keys in submitted answers (`percent`, `xp`) are ignored
- Answer keys and explanations never leave the database before submission.
- **Replay and duplicates are refused:**
  - a submitted attempt can't be submitted again (or with better answers)
  - attempts count from their start, so a student can't peek and abandon
  - the deadline uses the server clock
  - activity XP is paid once, after organiser confirmation
- Daily XP cap: 200 per user per day, enforced under a per-user lock.
- Cross-student access is refused: another student's attempt isn't found, and a
  quiz for another audience isn't visible.
- Leaderboards show "First L." names only, with no ids, codes or emails, and
  opt-out is respected.
- Forms intake is executable by the service role only — not by `anon`, signed-in
  users or admins. Approval is impossible for codes outside the roster and for
  form-only items.
- Presence: one row per user (tabs aren't counted twice), the server sets the
  time, beats are rate-limited, and the call takes no arguments.
- Every migration is a dry run unless `hub.apply = 'yes'`. Rollbacks leave no
  trace and don't touch production rows.

## 3. Production checks for the backend owner (not verified here)

Run `supabase/inspection/04_security_audit_readonly.sql`. Severity applies if the
check finds a problem:

| Check | What would be a problem | Severity if found |
|---|---|---|
| **G1** identity mapping | Access granted to any `@nasu.edu.eg` account, or through `raw_user_meta_data`, instead of a verified link from `auth.users.id` to an admin-approved student; Azure provider multi-tenant | **Critical** |
| A1 RLS | Any `public` table holding student data without RLS (`applications`, `approved_students`, `university_students`, `profiles`, role tables) | **Critical** |
| A4/A5 policies | Policies for `anon` on student tables; policies reading `user_metadata` | **Critical** |
| C2 role table | An `INSERT`/`UPDATE` policy that lets users write their own roles | **Critical** |
| B3 privileged RPCs | `admin_*` / review / publish / grant functions without a role check | **High–Critical** |
| B1 search_path | `SECURITY DEFINER` functions without a pinned `search_path` | **High** |
| D1/D2 Storage | `content-files` bucket public, or policies not scoped by role and scope | **High** |
| B4 IDOR | RPCs that accept a user or student id and trust it for "who am I" | **High** |
| E1 Realtime | Student tables in the `supabase_realtime` publication | **Medium** |
| A3 policies | `USING (true)` on writes (High) or on student reads (Medium) | **Medium–High** |
| B2 anon execute | Functions executable by `anon` that should require sign-in | **Medium** |
| F1 audit coverage | Privileged actions missing from `audit_logs` | **Low–Medium** |

Do **not** fix permission errors by disabling RLS. Fix the policy or the RPC.

## 4. Known non-security risks recorded here for completeness

- `sync_approved_student()` doesn't copy the WhatsApp number. This is data
  integrity, fixed by migration 01 (`docs/data-integrity/`).
- Production `contentSource: 'mock'`: students see **sample course content**,
  labelled "Preview", because there is no published-content read API yet. It's
  labelled, but it's a release blocker for real content (see `docs/release/RELEASE.md`).
