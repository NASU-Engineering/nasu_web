// Supabase adapter for the role-based workspaces (roles, editor uploads,
// review queue, admin). Re-exported by supabase-backend.js.
//
// NOT CONNECTED YET. The backend tables (user_roles, editor_scopes,
// content_items, audit_logs) exist, but their exact API — RPC names, columns,
// Storage bucket and policies — is owned by the backend and not confirmed.
// Rather than guess, every function below throws 'backend_required'. The
// frontend treats that as "not available" and fails CLOSED: no workspace is
// shown, the student hub keeps working.
//
// To connect: implement each function against the agreed contract and return
// the RAW row shapes listed in docs/ROLE_DASHBOARDS.md (api.js normalises them).
// Rules for whoever fills these in:
//   - use the shared client from supabase-client.js (publishable key only)
//   - never pass a user id for "me" — the backend resolves the caller from the JWT
//   - privileged writes go through RPCs / policies that re-check the caller's role
//   - map errors to ApiError codes: 42501 / PGRST301 → 'forbidden' or
//     'unauthenticated', 23505 / stale version → 'conflict', 22023 / 23514 → 'invalid'

import { ApiError } from './errors.js';

const notReady = contract => async () => { throw new ApiError('backend_required', contract); };

/* ---------- access ---------- */

// → { roles: ['student' | 'section_editor' | 'content_manager' | 'admin', …],
//     scopes: [{ id, subject_id, group_name|null, section|null }] }   (scopes: section editors only)
export const getMyAccess = notReady('get_my_access');

// → [{ group_name, sections: [string] }]
export const listGroups = notReady('list_groups');

/* ---------- editor ---------- */

// ({ status? }) → [content_item]   — the caller's own submissions only
export const listMyContent = notReady('list_my_content');

// (id) → content_item              — only if the caller may see it
export const getContentItem = notReady('get_content_item');

// ({ id?, values: { subjectId, contentType, week, group, section, title, description }, file? })
//   → content_item (status 'draft'). Backend checks the target is inside the caller's editor_scopes.
//   `file` = the object returned by uploadContentFile.
export const saveContentDraft = notReady('save_content_draft');

// (file: File, { onProgress?(fraction) }) → { file_ref, file_name, file_size, file_mime_type }
//   Storage bucket/path/policies decided by the backend. file_ref is opaque to the frontend.
export const uploadContentFile = notReady('upload_content_file');

// (id) → content_item (status 'pending_review')
export const submitContentForReview = notReady('submit_content_for_review');

/* ---------- review (content_manager, admin) ---------- */

// ({ status: 'pending_review' | 'processed', cursor?, limit? }) → { items: [content_item], next_cursor }
export const listReviewQueue = notReady('list_review_queue');

// (id) → { url, expires_at }   — short-lived signed URL for preview/download
export const getContentFileUrl = notReady('get_content_file_url');

// (id, { decision: 'approve' | 'reject', note }) → content_item   (reject requires note)
export const decideContent = notReady('review_content');

// (id) → content_item (status 'published')
export const publishContent = notReady('publish_content');

/* ---------- admin ---------- */

// → { total_students, section_editors, content_managers, pending_reviews, published_resources, quizzes, activities }
export const getAdminStats = notReady('get_admin_stats');

// ({ status?, subjectId?, query?, cursor? }) → { items: [content_item], next_cursor }
export const listAllContent = notReady('admin_list_content');

// ({ query?, role?, cursor? }) → { items: [member], next_cursor }
export const searchMembers = notReady('admin_search_members');

// (userId, role) → member      role ∈ section_editor | content_manager
export const grantRole = notReady('admin_grant_role');
export const revokeRole = notReady('admin_revoke_role');

// (userId, scopes: [{ subjectId, group|null, section|null }]) → member   (replaces the set)
export const setEditorScopes = notReady('admin_set_editor_scopes');

// ({ cursor?, action?, limit? }) → { items: [audit_entry], next_cursor }
export const listAuditLog = notReady('admin_list_audit_log');
