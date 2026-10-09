// The single Supabase client for the whole app.
// Uses only the public project URL + publishable key; all access control is
// enforced by the backend (Auth provider config, hooks, RLS, SECURITY INVOKER RPCs).

import { CONFIG } from '../config.js';
import { ApiError } from './errors.js';

const { url, publishableKey, clientUrl } = CONFIG.supabase;

export const isConfigured = () => Boolean(url && publishableKey);

let clientPromise = null;

/** Resolves to the shared supabase-js client (loaded on first use). */
export function getSupabase() {
  if (!isConfigured()) return Promise.reject(new ApiError('not_configured'));
  if (!clientPromise) {
    clientPromise = import(clientUrl)
      .then(({ createClient }) => createClient(url, publishableKey, {
        auth: {
          flowType: 'pkce',          // OAuth returns ?code=… which the app exchanges itself
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false, // handled explicitly in completeSignIn() so routing stays predictable
        },
      }))
      .catch(err => {
        clientPromise = null; // allow a retry after a network blip
        throw new ApiError('network', err);
      });
  }
  return clientPromise;
}

/**
 * Test seam: integration tests (supabase/tests/contract.test.mjs) replace the client
 * with one backed by an isolated database. Grants nothing — the database still
 * authorises every call.
 */
export function setSupabaseClientForTests(client) { clientPromise = Promise.resolve(client); }
