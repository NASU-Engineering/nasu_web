// Supabase adapter for the role-based workspaces (roles, editor uploads,
// review queue, admin). Re-exported by supabase-backend.js.
//
// Wired to the Phase 1 backend contract (docs/ROLE_DASHBOARDS.md). Rules:
//   - only the RPCs listed in RPC below, with exactly the documented arguments
//   - "me" is never sent — the backend resolves the caller from the JWT
//   - Storage: private bucket 'content-files', upsert:false, short signed URLs
//     only (never public URLs). Storage RLS decides who may write/read.
//   - audit rows are written by the backend, never from here
// Functions return RAW rows; api.js normalises them (normalize-workspace.js).
// Backend status 'pending' is the UI's 'pending_review' (mapped in/out here
// and in normalize-workspace.js).

import { ApiError, logDev } from './errors.js';
import { getSupabase } from './supabase-client.js';
import { ASSIGNABLE_ROLES } from './roles.js';
import { storageObjectPath, PROCESSED_STATUSES } from './content-workflow.js';
import { subjectCodeFor } from '../data/catalog.js';

export const BUCKET = 'content-files';
export const SIGNED_URL_SECONDS = 300;

export const RPC = {
  getMyAccess: 'get_my_access',
  listGroups: 'list_groups',
  listMyContent: 'list_my_content',
  getContentItem: 'get_content_item',
  saveContentDraft: 'save_content_draft',
  submitContentForReview: 'submit_content_for_review',
  listReviewQueue: 'list_review_queue',
  reviewContent: 'review_content',
  publishContent: 'publish_content',
  getAdminStats: 'get_admin_stats',
  adminListContent: 'admin_list_content',
  adminSearchMembers: 'admin_search_members',
  adminGrantRole: 'admin_grant_role',
  adminRevokeRole: 'admin_revoke_role',
  adminSetEditorScopes: 'admin_set_editor_scopes',
  adminListAuditLog: 'admin_list_audit_log',
};

// save_content_draft signature verified by the backend owner (Phase 1):
//   (p_id bigint, p_subject_id text, p_content_type text, p_title text,
//    p_description text, p_week int, p_group_name text, p_section text,
//    p_storage_path text, p_external_url text, p_file_name text,
//    p_file_size bigint, p_mime_type text) → jsonb (includes id)
export const SAVE_DRAFT_CONTRACT_CONFIRMED = true;

/** Exact named arguments for save_content_draft. Subjects are sent as course codes. */
export function draftArgs(id, values, file) {
  return {
    p_id: id ?? null,
    p_subject_id: subjectCodeFor(values.subjectId),
    p_content_type: values.contentType,
    p_title: values.title,
    p_description: values.description || null,
    p_week: values.week === '' || values.week == null ? null : Number(values.week),
    p_group_name: values.group ?? null,
    p_section: values.section ?? null,
    p_storage_path: file?.storagePath ?? null,
    p_external_url: values.externalUrl || null,
    p_file_name: file?.name ?? null,
    p_file_size: file?.size ?? null,
    p_mime_type: file?.mimeType || null,
  };
}

// Backend defaults per list RPC (sent explicitly so behaviour is predictable).
export const DEFAULT_LIMITS = { reviewQueue: 25, adminContent: 50, members: 25, auditLog: 50 };

// UI status ids → backend status values.
export const toBackendStatus = s => (s === 'pending_review' ? 'pending' : s);

const isNetwork = e => e?.name === 'AuthRetryableFetchError' || e?.status === 0 || e instanceof TypeError || /fetch|network/i.test(e?.message || '') && !e?.code;

/** Maps a PostgREST / Storage error to an ApiError code (server text never reaches the UI). */
export function toWorkspaceError(error, context) {
  if (error instanceof ApiError) return error;
  logDev(context, error);
  const code = String(error?.code ?? '');
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  if (isNetwork(error)) return new ApiError('network', error);
  if (code === 'PGRST301' || code === 'PGRST302' || status === 401) return new ApiError('unauthenticated', error);
  if (code === '42501' || status === 403) return new ApiError('forbidden', error);
  if (code === 'PGRST202' || code === '42883') return new ApiError('backend_required', error); // RPC/args mismatch
  if (code === 'PGRST116' || code === 'P0002' || status === 404) return new ApiError('not_found', error);
  if (code === '23505' || code === '40001' || status === 409) return new ApiError('conflict', error);
  if (['P0001', '22023', '23514', '22P02', '23502', '22001'].includes(code) || status === 400 || status === 413 || status === 415) return new ApiError('invalid', error);
  return new ApiError('unknown', error);
}

const one = data => (Array.isArray(data) ? data[0] ?? null : data ?? null);

/** Builds the adapter around a client getter (tests pass a fake client). */
export function createWorkspaceAdapter(getClient, { saveDraftConfirmed = SAVE_DRAFT_CONTRACT_CONFIRMED } = {}) {
  async function rpc(name, args) {
    const sb = await getClient();
    const { data, error } = args === undefined ? await sb.rpc(name) : await sb.rpc(name, args);
    if (error) throw toWorkspaceError(error, name);
    return data;
  }
  const pageArgs = (cursor, limit, fallback) => ({ p_cursor: cursor ?? null, p_limit: limit ?? fallback });

  /* ---------- access ---------- */

  const getMyAccess = async () => one(await rpc(RPC.getMyAccess));
  const listGroups = async () => rpc(RPC.listGroups);

  /* ---------- editor ---------- */

  // The RPC takes no filter; status filtering happens in the UI.
  const listMyContent = async () => rpc(RPC.listMyContent);
  const getContentItem = async id => {
    const row = one(await rpc(RPC.getContentItem, { p_id: id }));
    if (!row) throw new ApiError('not_found');
    return row;
  };

  async function saveDraftRow(id, values, file) {
    if (!saveDraftConfirmed) throw new ApiError('backend_required', 'save_content_draft parameters not confirmed');
    return one(await rpc(RPC.saveContentDraft, draftArgs(id, values, file)));
  }

  async function uploadToStorage(subjectId, itemId, file, onProgress) {
    const sb = await getClient();
    const path = storageObjectPath(subjectCodeFor(subjectId), itemId, file.name);
    onProgress?.(0);
    // supabase-js has no upload progress; the bar shows start → done.
    const { error } = await sb.storage.from(BUCKET).upload(path, file, {
      upsert: false, // never overwrite: a replacement is a new unique object
      contentType: file.type || undefined,
      cacheControl: '3600',
    });
    if (error) throw toWorkspaceError(error, 'storage-upload');
    onProgress?.(1);
    return { storagePath: path, name: file.name, size: file.size, mimeType: file.type || '' };
  }

  /**
   * Draft with an optional file, per the backend's upload architecture:
   *   1. save_content_draft → an id exists
   *   2. upload to <subject_id>/<content_item_id>/<unique-safe-filename> (upsert:false)
   *   3. save_content_draft again with storage_path + file metadata
   */
  async function saveContentDraft({ id = null, values, file = null, onProgress }) {
    let row = await saveDraftRow(id, values, null);
    const itemId = row?.id ?? id;
    if (!itemId) throw new ApiError('unknown', 'save_content_draft returned no id');
    if (file) {
      try {
        const uploaded = await uploadToStorage(values.subjectId, itemId, file, onProgress);
        row = await saveDraftRow(itemId, values, uploaded);
      } catch (err) {
        // The draft exists now: tell the caller so a retry updates it instead of creating another.
        const e = toWorkspaceError(err, 'save-with-file');
        e.contentItemId = String(itemId);
        throw e;
      }
    }
    return row;
  }

  const submitContentForReview = async id => one(await rpc(RPC.submitContentForReview, { p_id: id }));

  /* ---------- review ---------- */

  // 'processed' isn't a backend status: fetch approved, rejected and published
  // (first page each) and merge them newest first. Load-more works per status.
  async function listReviewQueue({ status = 'pending_review', cursor = null, limit } = {}) {
    if (status !== 'processed') {
      return rpc(RPC.listReviewQueue, { p_status: toBackendStatus(status), ...pageArgs(cursor, limit, DEFAULT_LIMITS.reviewQueue) });
    }
    const pages = await Promise.all(PROCESSED_STATUSES.map(s =>
      rpc(RPC.listReviewQueue, { p_status: s, ...pageArgs(null, limit, DEFAULT_LIMITS.reviewQueue) })));
    const rows = pages.flatMap(p => (Array.isArray(p) ? p : p?.items || []));
    rows.sort((a, b) => String(b.reviewed_at || b.updated_at || '').localeCompare(String(a.reviewed_at || a.updated_at || '')));
    return { items: rows, next_cursor: null };
  }

  /** Short-lived signed URL for an item's file. Storage SELECT RLS decides access. */
  async function getContentFileUrl({ id, storagePath }) {
    let path = storagePath;
    if (!path) path = (await getContentItem(id))?.storage_path;
    if (!path) throw new ApiError('preview_unavailable');
    const sb = await getClient();
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error) throw toWorkspaceError(error, 'storage-signed-url');
    return { url: data?.signedUrl ?? null };
  }

  const decideContent = async (id, { decision, note }) =>
    one(await rpc(RPC.reviewContent, { p_id: id, p_decision: decision, p_note: note ? note : null }));
  const publishContent = async id => one(await rpc(RPC.publishContent, { p_id: id }));

  /* ---------- admin ---------- */

  const getAdminStats = async () => one(await rpc(RPC.getAdminStats));
  // Subject/text filters aren't RPC arguments; the UI filters what's loaded.
  const listAllContent = async ({ status, cursor, limit } = {}) =>
    rpc(RPC.adminListContent, { p_status: status ? toBackendStatus(status) : null, ...pageArgs(cursor, limit, DEFAULT_LIMITS.adminContent) });
  // No role filter or cursor in the RPC; the UI filters by role on the results.
  const searchMembers = async ({ query = '', limit } = {}) =>
    rpc(RPC.adminSearchMembers, { p_query: query, p_limit: limit ?? DEFAULT_LIMITS.members });

  function assertAssignable(role) {
    // The backend also refuses anything else; 'admin' is never sent from the UI.
    if (!ASSIGNABLE_ROLES.includes(role)) throw new ApiError('forbidden', `role ${role} is not assignable from the UI`);
  }
  const grantRole = async (userId, role) => { assertAssignable(role); return one(await rpc(RPC.adminGrantRole, { p_user_id: userId, p_role: role })); };
  const revokeRole = async (userId, role) => { assertAssignable(role); return one(await rpc(RPC.adminRevokeRole, { p_user_id: userId, p_role: role })); };
  const setEditorScopes = async (userId, scopes) => one(await rpc(RPC.adminSetEditorScopes, {
    p_user_id: userId,
    p_scopes: scopes.map(s => ({ subject_id: subjectCodeFor(s.subjectId), group_name: s.group ?? null, section: s.section ?? null })),
  }));
  // No action filter in the RPC; the UI filters what's loaded.
  const listAuditLog = async ({ cursor, limit } = {}) => rpc(RPC.adminListAuditLog, pageArgs(cursor, limit, DEFAULT_LIMITS.auditLog));

  return {
    getMyAccess, listGroups,
    listMyContent, getContentItem, saveContentDraft, submitContentForReview,
    listReviewQueue, getContentFileUrl, decideContent, publishContent,
    getAdminStats, listAllContent, searchMembers, grantRole, revokeRole, setEditorScopes, listAuditLog,
  };
}

const live = createWorkspaceAdapter(getSupabase);

export const {
  getMyAccess, listGroups,
  listMyContent, getContentItem, saveContentDraft, submitContentForReview,
  listReviewQueue, getContentFileUrl, decideContent, publishContent,
  getAdminStats, listAllContent, searchMembers, grantRole, revokeRole, setEditorScopes, listAuditLog,
} = live;
