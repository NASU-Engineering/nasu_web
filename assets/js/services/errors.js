// Central error handling. Backends throw ApiError with a CODE; the message the
// student sees always comes from MESSAGES below — never from the server — so
// no database details, table names, SQL errors or account-existence hints can
// reach the UI.

export const MESSAGES = {
  sign_in_cancelled: 'Sign-in was cancelled. You can try again whenever you’re ready.',
  sign_in_denied: 'Your NASU account couldn’t be signed in to the hub. If you’re a prep-year engineering student, contact the prep-year office.',
  sign_in_failed: 'Sign-in didn’t complete. Please try again.',
  wrong_account: 'Please sign in with your NASU university Microsoft account (@nasu.edu.eg).',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  unauthenticated: 'Please sign in to continue.',
  profile_missing: 'You’re signed in, but your student profile isn’t set up in the hub yet. Contact the prep-year office.',
  not_found: 'We couldn’t find that page.',
  network: 'Could not reach the server. Check your connection and try again.',
  not_configured: 'The hub is not connected to its server yet.',
  backend_required: 'This isn’t available yet. Please try again later.',
  forbidden: 'You don’t have permission to do that. If you think this is a mistake, contact a hub admin.',
  conflict: 'This item was changed by someone else. Reload it and try again.',
  invalid: 'Some details are missing or not accepted. Check the form and try again.',
  upload_failed: 'The file couldn’t be uploaded. Check your connection and try again.',
  preview_unavailable: 'A preview isn’t available for this file yet.',
  unknown: 'Something went wrong. Please try again.',
};

export class ApiError extends Error {
  /** @param {keyof MESSAGES} code  @param {unknown} [cause] technical detail, dev console only */
  constructor(code, cause) {
    super(MESSAGES[code] || MESSAGES.unknown);
    this.name = 'ApiError';
    this.code = MESSAGES[code] ? code : 'unknown';
    if (cause !== undefined) this.cause = cause;
  }
}

const isDev = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// Technical details go to the console on local development only.
export function logDev(context, detail) {
  if (isDev) console.warn(`[nasu:${context}]`, detail);
}

export function toApiError(err, context = 'api') {
  if (err instanceof ApiError) {
    if (err.cause !== undefined) logDev(context, err.cause);
    return err;
  }
  logDev(context, err);
  if (err instanceof TypeError) return new ApiError('network');
  return new ApiError('unknown');
}
