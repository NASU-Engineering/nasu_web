// Supabase adapter for admin operations: presence heartbeat, activity metrics,
// recent activity, applications review and the data-integrity summary.
//
// The RPCs are PREPARED, NOT APPLIED: supabase/prepared/20261010_02_activity_presence.sql
// and 20261010_04_intake_and_applications.sql. Until they exist in the database
// every call answers 'backend_required' (PGRST202) and the UI shows
// "Not collected" — never a zero or a sample value. Re-exported by supabase-backend.js.

import { getSupabase } from './supabase-client.js';
import { toWorkspaceError } from './supabase-workspace.js';

export const OPS_RPC = {
  recordPresence: 'record_presence',
  activitySummary: 'admin_activity_summary',
  recentActivity: 'admin_recent_activity',
  applicationSummary: 'admin_application_summary',
  listApplications: 'admin_list_applications',
  reviewApplication: 'admin_review_application',
  integritySummary: 'admin_data_integrity_summary',
};

async function rpc(name, args) {
  const sb = await getSupabase();
  const { data, error } = args === undefined ? await sb.rpc(name) : await sb.rpc(name, args);
  if (error) throw toWorkspaceError(error, name);
  return data;
}
const one = data => (Array.isArray(data) ? data[0] ?? null : data ?? null);

export const recordPresence = () => rpc(OPS_RPC.recordPresence);
export const getActivitySummary = async () => one(await rpc(OPS_RPC.activitySummary));
export const listRecentActivity = async ({ limit = 8 } = {}) => ({ items: (await rpc(OPS_RPC.recentActivity, { p_limit: limit })) || [] });
export const getApplicationSummary = async () => one(await rpc(OPS_RPC.applicationSummary));
export const listApplications = async ({ status = '', query = '', cursor = null, limit = 25 } = {}) =>
  one(await rpc(OPS_RPC.listApplications, { p_status: status || null, p_query: query || null, p_cursor: cursor, p_limit: limit }));
export const reviewApplication = async (id, { decision, note = '' }) =>
  one(await rpc(OPS_RPC.reviewApplication, { p_id: String(id), p_decision: decision, p_note: note || null }));
export const getDataIntegritySummary = async () => one(await rpc(OPS_RPC.integritySummary));
