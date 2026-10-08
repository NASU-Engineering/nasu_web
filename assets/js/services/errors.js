// Central error handling. Backends throw ApiError with a CODE; the message the
// user sees always comes from the i18n catalogs (key "error.<code>") — never
// from the server — so no database details, table names, SQL errors or
// account-existence hints can reach the UI. Messages follow the current language.

import { t } from '../i18n/index.js';

export const ERROR_CODES = [
  'sign_in_cancelled', 'sign_in_denied', 'sign_in_failed', 'wrong_account', 'rate_limited',
  'unauthenticated', 'profile_missing', 'not_found', 'network', 'not_configured', 'backend_required',
  'forbidden', 'conflict', 'invalid', 'upload_failed', 'preview_unavailable', 'unknown',
];

/** { code: message } with messages resolved in the current language at read time. */
export const MESSAGES = Object.defineProperties({}, Object.fromEntries(ERROR_CODES.map(code =>
  [code, { enumerable: true, get: () => t(`error.${code}`) }])));

export class ApiError extends Error {
  /** @param {string} code one of ERROR_CODES  @param {unknown} [cause] technical detail, dev console only */
  constructor(code, cause) {
    super('');
    this.name = 'ApiError';
    this.code = ERROR_CODES.includes(code) ? code : 'unknown';
    // Read lazily so the text follows a language switch after the error was created.
    Object.defineProperty(this, 'message', { get: () => t(`error.${this.code}`), configurable: true });
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
