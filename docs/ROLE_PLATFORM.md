# NASU Freshmen Hub — role-based platform architecture

Four purpose-built experiences share one platform (Supabase Auth, RLS, RPCs,
private Storage). Frontend role checks decide what is **shown**; the backend
decides what is **allowed**.

| Experience | Who | Home | Navigation |
|---|---|---|---|
| **Student Hub** | everyone with a hub profile | `/dashboard` | Home · Subjects · Search · Updates · Profile |
| **Content Studio** | `section_editor`, `admin` | `/editor` | Overview · Upload · My content · Drafts |
| **Review Desk** | `content_manager`, `admin` | `/review` | Review queue · Processed · History |
| **Admin Control Center** | `admin` | `/admin` | Overview · Students · Staff & roles · Content · Review activity · Audit log · Analytics · Role simulator (+ planned: Activities, Quizzes, Leaderboards) |

Source of truth: `assets/js/services/experiences.js` (pure, tested in
`tests/experiences.test.mjs`).

## Shell rules

- **One navigation per experience, never mixed.** The Student Hub has a top nav
  (desktop) and a bottom bar (phones). Staff workspaces have their own top bar
  (workspace title) and a sidebar / mobile tab strip with only their sections.
- **Students never see staff UI.** A student-only account has one experience, no
  switcher, and no staff links anywhere in the DOM (verified in the browser).
- **Workspace switcher** — only for accounts with more than one experience. It
  sits in the account area of the top bar, outside every experience's nav, and
  lists only the experiences the backend-reported roles allow.
- **Refused routes** (a role the account doesn't have) render a "not available"
  page inside the neutral student shell — no staff chrome is drawn.

## Routing after sign-in

`/start` resolves the landing workspace from the roles the backend reports:
the last workspace used (remembered per browser) if still authorised, otherwise
the most authoritative one: Admin → Review → Studio → Student Hub. Sign-in,
"Back to my workspace" and the landing page all go through `/start`.

## Role experience simulator (Admin → Role simulator)

An admin testing tool for previewing each experience.

- **Gate:** the real account must be `admin` according to `get_my_access()`
  (`canUseSimulator`); the simulated access is flagged and can never re-open it.
  `CONFIG.features.roleSimulator = false` hides it.
- **Isolation:** while active, `api.js` routes **every** call to the mock backend
  (`be()`); nothing reaches Supabase and the real session is untouched. Personas
  are mock accounts; their roles exist only inside the mock (sessionStorage, per
  tab). Exit / sign-out always ends the simulation.
- **Clear indicator:** an amber banner on every screen with the persona, a
  persona switcher and "Exit to Admin".
- **Mock workflow:** Section Editor uploads (scope-checked) → Content Reviewer
  approves and publishes → the Student in the matching group/section sees it
  under the subject; other sections don't (`tests/mock-workflow.test.mjs`).
- Replaces the old demo-role switcher on Profile.

Mock tests prove the **frontend** flow and the mock's imitation of the rules —
not the production backend. Production E2E still needs a signed-in run.

## Admin analytics & activity monitoring

Every figure is labelled **Live** (backend now), **Sample** (derived from the
latest ≤150 audit-log entries) or **Not collected** (no source yet):

- Platform metrics — `get_admin_stats()` (Live).
- Activity per day, tracking coverage per event, and the distinct actions found
  in the audit log exactly as named (Sample).
- Sign-in, sign-out/session and online presence — **Not collected**. The UI never
  claims who is online. Proposal: `docs/ACTIVITY_MONITORING.md`.

## Backend requirements needing separate approval

None of these are implemented or applied. Each needs backend-owner approval.

1. **Auth event logging** (sign-in success, sign-out / session end) into
   `audit_logs`, server-side only — see `ACTIVITY_MONITORING.md` §2.
2. **Presence** — privacy-conscious heartbeat or Realtime Presence, aggregate
   counts for admins only — `ACTIVITY_MONITORING.md` §3.
3. **Audit action names** — confirm the exact `action` strings for create,
   upload, submit, approve, reject, publish, role and scope changes, so the
   coverage table maps them without pattern guessing.
4. **Audit log access for content managers** (optional) — Review Desk "History"
   is currently built from processed items; a reviewer-scoped audit RPC would
   add who-did-what for rejected/re-submitted cycles.
5. **Student content read API** — Student Hub content (subjects, resources,
   updates) still uses sample data (`CONFIG.contentSource = 'mock'`). Needs a
   published-content read RPC/table with group/section visibility enforced by
   RLS, plus announcement rows with optional `type`, `link_type`, `link_id`,
   `link_subject_id`, `link_category`.
6. **Server-side admin filters** (optional) — `admin_list_content` subject/text
   filters and `admin_search_members` role filter / cursor (the UI filters the
   loaded page today).

## Existing Student Information Form (`NASU-Engineering/nasu_student`)

A separate, live product (https://nasu-engineering.github.io/nasu_student/) —
not redundant, not merged, not changed by this work. Integration options to
review separately:

- A "Update your student information" link from Student Hub → Profile to the
  form (no data flow change).
- Longer term: the form could feed the roster that `profiles` / groups / sections
  are built from, through a reviewed import — requires agreement on data
  ownership, validation and privacy before any change.
