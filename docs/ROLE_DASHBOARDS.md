# Role-based dashboards — frontend ↔ backend contract

Status: **all 16 workspace RPCs (+ get_my_profile) wired to Backend Phase 1** (see below).
If roles can't be loaded, nobody sees a staff workspace and the student hub works as before.

## Phase 1 wiring (implemented)

| Adapter | RPC call sent | Source of the argument list |
|---|---|---|
| `getMyAccess` | `get_my_access()` | stated |
| `listGroups` | `list_groups()` | stated |
| `listMyContent` | `list_my_content()` — status filter applied in the UI | stated |
| `getContentItem` | `get_content_item({ p_id })` | stated + live hint |
| `saveContentDraft` | `save_content_draft({ p_id, p_subject_id, p_content_type, p_title, p_description, p_week, p_group_name, p_section, p_storage_path, p_external_url, p_file_name, p_file_size, p_mime_type })` → jsonb with `id` | verified by backend owner |
| `submitContentForReview` | `submit_content_for_review({ p_id })` | stated + live hint |
| `listReviewQueue` | `list_review_queue({ p_status, p_cursor, p_limit })`; UI `pending_review` → `pending`; "Processed" = 3 calls (`approved`, `rejected`, `published`) merged | stated |
| `decideContent` | `review_content({ p_id, p_decision, p_note })`, decision `approve`/`reject` | stated + live hint |
| `publishContent` | `publish_content({ p_id })` | stated + live hint |
| `getContentFileUrl` | `storage.from('content-files').createSignedUrl(storage_path, 300)` — no RPC | stated |
| `getAdminStats` | `get_admin_stats()` | stated |
| `listAllContent` | `admin_list_content({ p_status, p_cursor, p_limit })`; subject/text filter in the UI | stated |
| `searchMembers` | `admin_search_members({ p_query, p_limit })`; role filter in the UI, no paging | stated |
| `grantRole` / `revokeRole` | `admin_grant_role` / `admin_revoke_role({ p_user_id, p_role })`; `admin` refused client-side before sending | stated |
| `setEditorScopes` | `admin_set_editor_scopes({ p_user_id, p_scopes: [{ subject_id, group_name, section }] })` | stated + live hint (element shape assumed) |
| `listAuditLog` | `admin_list_audit_log({ p_cursor, p_limit })`; action filter in the UI | stated |

Upload flow: `save_content_draft` →
`storage.from('content-files').upload('<subject_id>/<content_item_id>/<ts>-<random>-<safe-name>', file, { upsert: false })`
→ `save_content_draft` again with the storage path + file metadata → `submit_content_for_review`.
A replacement file always gets a new object path. If the upload fails after the
draft exists, the error carries the draft id so a retry updates it instead of
creating another.

**Response shapes are not yet verified against a live authenticated call.** The
adapter/normalisers expect the row shapes listed below (backend `pending` is
accepted for `pending_review`; `storage_path` is read for files; `list_groups`
may return one row per group or per section). Single-row results may be an
object or a one-element array; list results may be an array or `{ items, next_cursor }`.

> **Security model.** Role checks in the frontend (route guards, hidden buttons)
> are **UX only**. Supabase (RLS, `SECURITY DEFINER`/`INVOKER` RPC checks,
> Storage policies) is the only authority. The frontend never sends a user id
> for "me", never holds a privileged key, and never decides an outcome itself.

The sections below are the original frontend **proposal**, kept for the row
shapes the UI reads. Where Phase 1 differs, the table above wins; only
`supabase-workspace.js` (calls) and `normalize-workspace.js` (field mapping)
need to change for further adjustments.

## Roles

`student`, `section_editor`, `content_manager`, `admin` — a user may hold several.

| Workspace | Shown to | Routes |
|---|---|---|
| Student hub | anyone with a profile | `/dashboard`, `/subjects…`, `/resources`, `/assignments`, `/announcements`, `/profile`, `/quizzes`, `/activities`, `/leaderboard` |
| Editor | `section_editor`, `admin` | `/editor`, `/editor/uploads`, `/editor/uploads/:id`, `/editor/upload[?id=]` |
| Review | `content_manager`, `admin` | `/review`, `/review/history`, `/review/:id` |
| Admin | `admin` | `/admin`, `/admin/content`, `/admin/team`, `/admin/students`, `/admin/activities`, `/admin/quizzes`, `/admin/leaderboards`, `/admin/audit` (`/admin/review` → `/review`) |

Confirmed by backend Phase 1: admins review/publish AND may upload for any
subject, group and section without the editor role or a scope; the
`admin` role is never granted from the UI.

## Workflow

```
draft ──submit──▶ pending_review ──approve──▶ approved ──publish──▶ published
  ▲                     │
  └──edit── rejected ◀──reject (reason required)
```

Editors may edit `draft` and `rejected` items and (re)submit them. Reviewers act
on `pending_review`; reviewers/admins publish `approved`. The frontend
pre-validates (`content-workflow.js`); the backend must enforce every transition.

## Proposed RPCs (all `authenticated`, caller resolved from the JWT)

| Adapter function | Proposed RPC | Args | Returns |
|---|---|---|---|
| `getMyAccess` | `get_my_access()` | — | `{ roles: text[], scopes: scope[] }` |
| `listGroups` | `list_groups()` | — | `[{ group_name, sections: text[] }]` |
| `listMyContent` | `list_my_content(p_status text null)` | | `content_item[]` (caller's own) |
| `getContentItem` | `get_content_item(p_id)` | | `content_item` (if caller may see it) |
| `saveContentDraft` | `save_content_draft(p_id null, p_subject_id, p_content_type, p_week, p_group_name, p_section, p_title, p_description, p_file_ref null)` | | `content_item` (status `draft`); **must check scope** |
| `uploadContentFile` | Storage upload (see below) | `File` | `{ file_ref, file_name, file_size, file_mime_type }` |
| `submitContentForReview` | `submit_content_for_review(p_id)` | | `content_item` (`pending_review`); requires a file |
| `listReviewQueue` | `list_review_queue(p_status, p_cursor, p_limit)` | `p_status` = `pending_review` \| `processed` | `{ items: content_item[], next_cursor }` — pending **oldest first**, processed newest first |
| `getContentFileUrl` | `get_content_file_url(p_id)` or Storage `createSignedUrl` | | `{ url, expires_at }` (short-lived, https) |
| `decideContent` | `review_content(p_id, p_decision, p_note)` | `approve` \| `reject`; note required for reject | `content_item` |
| `publishContent` | `publish_content(p_id)` | | `content_item` (`published`) |
| `getAdminStats` | `get_admin_stats()` | | see *Stats* |
| `listAllContent` | `admin_list_content(p_status, p_subject_id, p_query, p_cursor)` | | `{ items, next_cursor }` |
| `searchMembers` | `admin_search_members(p_query, p_role, p_cursor)` | name or student id | `{ items: member[], next_cursor }` |
| `grantRole` / `revokeRole` | `admin_grant_role(p_user_id, p_role)` / `admin_revoke_role(...)` | role ∈ `section_editor`, `content_manager` | `member` |
| `setEditorScopes` | `admin_set_editor_scopes(p_user_id, p_scopes jsonb)` | replaces the set; `[{ subject_id, group_name|null, section|null }]` | `member` |
| `listAuditLog` | `admin_list_audit_log(p_cursor, p_action_prefix, p_limit)` | prefix e.g. `content.` | `{ items: audit_entry[], next_cursor }` |

Writes should append to `audit_logs` server-side (actor = `auth.uid()`), never from the browser.

### Row shapes the frontend reads

```jsonc
// scope (editor_scopes) — null group/section = all groups/sections of that subject
{ "id": "uuid", "subject_id": "math1", "group_name": "G1" | null, "section": "S1" | null }

// content_item
{
  "id": "uuid", "title": "text", "description": "text",
  "subject_id": "math1|vib|stat|chem|soc|draw",
  "content_type": "lecture|tutorial|board|pdf|assignment",
  "week": 1-16 | null, "group_name": "text|null", "section": "text|null",
  "status": "draft|pending_review|approved|rejected|published",
  "file_name": "text|null", "file_size": 123, "file_mime_type": "application/pdf",
  "review_note": "text",              // the rejection reason must be visible to the submitter
  "submitter": { "id", "full_name", "student_id" },
  "reviewer":  { "id", "full_name", "student_id" } | null,
  "created_at", "updated_at", "submitted_at", "reviewed_at", "published_at"   // ISO timestamps
}

// member (admin views)
{ "user_id", "full_name", "student_id", "group_name", "section", "roles": ["student", ...], "scopes": [scope] }

// audit_entry
{ "id", "actor": { "id", "full_name", "student_id" } | null, "action": "content.rejected",
  "entity_type": "content_item", "entity_id": "uuid", "created_at", "metadata": { ... } }

// stats — null for anything not available; the UI shows "—"
{ "total_students", "section_editors", "content_managers", "pending_reviews",
  "published_resources", "quizzes": null, "activities": null }
```

Action names the UI colours: `content.created|updated|submitted|approved|rejected|published`,
`role.granted|revoked`, `scope.updated` (any string is displayed).

### Errors → UI codes

`42501` / RLS denial → `forbidden` · `PGRST301/302` → `unauthenticated` ·
unique/stale-version conflicts or wrong status → `conflict` ·
check/validation failures → `invalid` · not found/not visible → `not_found`.
The UI never shows server error text.

## Storage (needed from backend)

- Bucket name, path convention, and policies (who may write; editors only into their scope).
- Max size and allowed types — the UI currently pre-checks **50 MB** and
  `.pdf .pptx .ppt .docx .doc .png .jpg .jpeg .zip` (`CONFIG.uploads`, provisional).
- Whether upload happens before the draft row exists (current UI flow:
  upload → `save_content_draft(p_file_ref)`), or via a signed upload URL issued by an RPC.
- Progress: the adapter accepts `onProgress(fraction)`; supabase-js `upload()`
  has no progress, so either a signed-URL + XHR upload or no progress bar.
- Reviewer preview: short-lived signed URL; the frontend opens it in a new tab.
- Published content: how it reaches students (copy to a public table/bucket, or
  RLS on `content_items` where `status = 'published'` and the student's group/section match).

## Deep links (announcements → Hub content)

Announcements may carry an optional target, rendered as an "Open …" link:
`link_type` (`subject|resource|assignment|announcement|quiz|activity`),
`link_id`, `link_subject_id` (for resource/assignment). Routes:
`#/subjects/:subjectId?item=:id`, `#/announcements?item=:id`, `#/subjects/:id`.
`services/deep-links.js#hubUrl` builds the absolute shareable URL (for the
WhatsApp "Updates" community later). Quiz/activity links land on the module
page until item routes exist.

## Development mock

`CONFIG.backend = 'mock'` (local only — a test fails if it is shipped) enables
`services/mock-workspace.js`: fake people/submissions in `sessionStorage`, no
real files, role + scope checks imitated so forbidden/conflict paths can be
seen. **Mock success is not backend success.** `/profile` shows a demo role
switcher only in mock mode (`api.dev` is `null` otherwise).

## Phase 1 naming notes (verified)

- **Subjects are course codes on the backend** (`BSC131`); the frontend uses
  short ids (`stat`). `catalog.js#subjectCodeFor` / `subjectIdFrom` are the only
  translation point: outgoing `p_subject_id`, scope `subject_id` and the Storage
  path prefix use the code; incoming `subject_id` / `subject_code` map back.
- Raw rows use `subject_code`, `week_no`, `mime_type`; some RPCs add aliases
  `subject_id`, `week`. Both are accepted in `normalize-workspace.js`.
- `admin_grant_role`, `admin_revoke_role`, `admin_set_editor_scopes` return void;
  the UI reloads the list afterwards.
- List RPCs return `{ items, next_cursor }`; cursors are opaque. Default limits
  sent explicitly: review 25, admin content 50, members 25, audit 50.
- `admin_search_members('')` lists members by full name (no cursor).
