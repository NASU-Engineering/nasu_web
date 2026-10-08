# Activity monitoring — proposal (needs approval, NOT applied)

Status: **proposal only.** No schema, RLS, Auth or Storage change has been
made. Everything here needs review and approval by the backend owner before
any migration is written or applied — never directly on production.

Principles: record **actions on the platform**, not people's behaviour. No
keystroke, message, page-content, mouse or hidden behavioural tracking. Collect
the minimum, keep it for a defined time, show it only to admins.

## 1. What the Hub shows today (no backend change)

Admin → Analytics reads only:

- `get_admin_stats()` → **Live** metrics.
- `admin_list_audit_log()` (latest ≤150 entries) → **Sample**: activity per day,
  per-event coverage, and the distinct `action` values found.
- Sign-in, sign-out/session and presence → **Not collected**.

## 2. Event tracking (audit log)

Common shape (existing `audit_logs`, server-generated only):
`actor` (user id), `action`, `entity_type`, `entity_id`, `created_at`,
`metadata` (jsonb), plus proposed `outcome` (`success` | `denied` | `error`).

| Event | Proposed `action` | Source | Status |
|---|---|---|---|
| Successful sign-in | `auth.sign_in` | Auth hook / trigger on `auth.sessions` insert | **new** |
| Sign-out / session end | `auth.sign_out`, `auth.session_expired` | Auth hook where reliably observable | **new** |
| Content created | `content.created` | `save_content_draft` (no id) | confirm name |
| File uploaded | `content.file_uploaded` (metadata: size, mime — never content) | `save_content_draft` with storage metadata, or Storage trigger | confirm / new |
| Submitted for review | `content.submitted` | `submit_content_for_review` | confirm name |
| Approved / rejected | `content.approved` / `content.rejected` (+ note length, not text, if preferred) | `review_content` | confirm name |
| Published | `content.published` | `publish_content` | confirm name |
| Role granted / revoked | `role.granted` / `role.revoked` (metadata: role) | `admin_grant_role` / `admin_revoke_role` | confirm name |
| Scope changed | `scope.updated` (metadata: count) | `admin_set_editor_scopes` | confirm name |
| Denied privileged attempt | `access.denied` (metadata: rpc) | inside privileged RPCs | **new, optional** |

Security requirements:
- Inserts only from `SECURITY DEFINER` functions/triggers; **no** browser insert
  policy. `SELECT` only for `admin` (RLS).
- `metadata` must never hold file contents, tokens, passwords or free-text
  personal data beyond what's needed (e.g. role name, item id).
- Retention: e.g. 12 months for content/role events, 90 days for auth events
  (decide with the faculty); scheduled purge job.

## 3. Online presence (privacy-conscious)

Goal: "how many students/staff are active now" for admins — not surveillance.

Option A — **Supabase Realtime Presence** (no table):
- Signed-in clients join a `presence:hub` channel with only
  `{ experience: 'student'|'editor'|'review'|'admin' }` — no name, no page, no id
  in the payload shown to others.
- Only admins subscribe; the UI shows **aggregate counts** per experience.
- Nothing is stored; leaving the tab/closing ends presence.

Option B — **heartbeat table** (if history is needed):
- `presence_heartbeats(user_id, experience, last_seen_at)`, one row per user,
  upserted by an RPC at most every 60 s while the tab is visible.
- "Online" = `last_seen_at > now() - interval '2 minutes'`.
- RLS: users can upsert only their own row (via RPC); only admins can read
  aggregates through an RPC returning counts, not a list of people.
- Rows older than 24 h purged.

Either option: opt-out respected if the faculty requires it; documented in the
Hub's privacy notice. Until one is approved and implemented, the UI keeps
showing **Not collected**.

## 4. Frontend work once approved

- Map confirmed `action` names in `services/activity.js` (`TRACKED_EVENTS`).
- Presence: subscribe in the Admin Control Center only; show counts with a
  "Live" badge; never show individual names by default.
