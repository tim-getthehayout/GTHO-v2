/** @file Password-recovery URL helpers and the in-tab recovery flag.
 *
 * supabase-js 2.103.0 defaults to the implicit flow (`flowType: 'implicit'`,
 * `detectSessionInUrl: true`). `resetPasswordForEmail({ redirectTo })` sends
 * the user back to that URL. GoTrue then replaces the hash with the session
 * (`access_token`, `refresh_token`, `type=recovery`). The client saves the
 * session, clears the hash, and emits `PASSWORD_RECOVERY`.
 * `verifyOtp({ token_hash, type: 'recovery' })` emits the same event.
 * A `token_hash` query is not consumed by the client on its own.
 *
 * `#/change-password` is the redirect target so it matches this app's hash
 * router. The implicit grant overwrites that hash, so the screen opens from
 * `type=recovery` or `PASSWORD_RECOVERY`, not from the router matching it.
 */

const RECOVERY_FLAG = 'gtho_password_recovery';

let pending = false;

/**
 * Remember that this tab is in a recovery session until the password is updated.
 * Survives a refresh in the same tab. The auth event itself fires once.
 */
export function markPasswordRecovery() {
  pending = true;
  try {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
  } catch {
    // sessionStorage unavailable — the in-memory flag still covers this load.
  }
}

/** Drop the recovery flag after a successful update, or when there is no session. */
export function clearPasswordRecovery() {
  pending = false;
  try {
    sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // sessionStorage unavailable
  }
}

/** @returns {boolean} */
export function isPasswordRecoveryPending() {
  if (pending) return true;
  try {
    return sessionStorage.getItem(RECOVERY_FLAG) === '1';
  } catch {
    return false;
  }
}

/**
 * Read a recovery arrival from a full URL.
 * Search params win over the hash, matching auth-js `parseParametersFromURL`.
 * A hash route (`#/change-password`) is not parsed as an auth query string.
 *
 * @param {string} href
 * @returns {{ type: 'recovery'|null, tokenHash: string|null, isChangePasswordRoute: boolean }}
 */
export function readRecoveryArrival(href) {
  const url = new URL(href);
  const hashBody = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  const hashParams = hashBody && !hashBody.startsWith('/')
    ? new URLSearchParams(hashBody)
    : new URLSearchParams();
  const type = url.searchParams.get('type') || hashParams.get('type') || null;
  const tokenHash = url.searchParams.get('token_hash') || hashParams.get('token_hash') || null;
  const isChangePasswordRoute = url.hash === '#/change-password'
    || url.hash.startsWith('#/change-password?');
  return {
    type: type === 'recovery' ? 'recovery' : null,
    tokenHash: tokenHash || null,
    isChangePasswordRoute,
  };
}

/**
 * `redirectTo` for `resetPasswordForEmail`. Uses the current origin so
 * production and local dev each return to themselves.
 *
 * @param {string} [origin]
 * @returns {string}
 */
export function passwordResetRedirectTo(origin = window.location.origin) {
  const base = import.meta.env.BASE_URL || '/';
  const url = new URL(base, origin);
  url.hash = '/change-password';
  return url.href;
}

/**
 * Remove recovery query params after `verifyOtp`. Returns the original string
 * when the query has no recovery type, so a hash full of implicit-grant tokens
 * is left untouched for the client to read.
 *
 * @param {string} href
 * @returns {string}
 */
export function hrefWithoutRecoverySearch(href) {
  const url = new URL(href);
  if (url.searchParams.get('type') !== 'recovery') return href;
  url.searchParams.delete('type');
  url.searchParams.delete('token_hash');
  return url.href;
}

/**
 * Which screen boot should open.
 * A recovery session is already signed in, so the change-password screen
 * replaces the app until the password is updated.
 *
 * @param {{ recoveryType: string|null, pending: boolean, user: object|null }} input
 * @returns {'change-password'|'app'|'auth'}
 */
export function decideAuthScreen({ recoveryType, pending, user }) {
  if (user && (recoveryType === 'recovery' || pending)) return 'change-password';
  if (user) return 'app';
  return 'auth';
}
