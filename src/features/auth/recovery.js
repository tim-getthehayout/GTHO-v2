/** @file Password-recovery URL helpers and the in-tab recovery flag.
 *
 * supabase-js 2.103.0 defaults to the implicit flow (`flowType: 'implicit'`,
 * `detectSessionInUrl: true`). `resetPasswordForEmail({ redirectTo })` sends
 * the user back to that URL. GoTrue's implicit success redirect is
 * `redirectTo + "#" + tokenQuery` (`access_token`, `refresh_token`,
 * `expires_in`, `token_type`, `type=recovery`). The client saves the session,
 * clears the hash, and emits `PASSWORD_RECOVERY`.
 * `verifyOtp({ token_hash, type: 'recovery' })` emits the same event.
 * A `token_hash` query is not consumed by the client on its own.
 *
 * `redirectTo` is the origin only. A hash in `redirectTo` (this app's
 * `#/change-password` route) becomes a second `#`. auth-js parses the whole
 * fragment with `URLSearchParams`, so the key is `/change-password#access_token`
 * and `access_token` is missing. No session is saved and boot shows login.
 * `installCleanRecoveryHash()` rewrites that double hash before `createClient`
 * so emails already sent with the route hash still open the change-password
 * form. The screen opens from `type=recovery` or `PASSWORD_RECOVERY`, not
 * from the router matching `#/change-password`. The form does not ask for
 * the current password.
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
 * Token query from an implicit-grant fragment.
 * A clean fragment is `access_token=...&type=recovery`.
 * GoTrue appends that query with another `#` when `redirectTo` already has a
 * hash, and the browser may keep the separator as `#` or `%23`.
 * Returns the query string, or null when the fragment has no access token.
 *
 * @param {string} hashBody hash without the leading `#`
 * @returns {string|null}
 */
function implicitGrantQuery(hashBody) {
  if (!hashBody || !hashBody.includes('access_token=')) return null;
  const normalized = hashBody.replace(/%23(?=access_token=)/gi, '#');
  const segments = normalized.split('#');
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (new URLSearchParams(segment).get('access_token')) return segment;
    const at = segment.indexOf('access_token=');
    if (at > 0) {
      const prefix = segment.slice(0, at);
      if (prefix.endsWith('?') || prefix.endsWith('&')) return segment.slice(at);
    }
  }
  return null;
}

/**
 * True when auth-js `parseParametersFromURL` can read `access_token` from the
 * fragment. A leading `/` is a hash route. A second `#` hides the token key.
 *
 * @param {string} hashBody
 * @returns {boolean}
 */
function isCleanImplicitHash(hashBody) {
  if (!hashBody || hashBody.startsWith('/') || hashBody.includes('#')) return false;
  return Boolean(new URLSearchParams(hashBody).get('access_token'));
}

/**
 * Move a double-hash implicit grant onto a clean fragment.
 * Leaves every other URL unchanged, including a hash route with no tokens
 * and a fragment auth-js can already parse.
 *
 * @param {string} href
 * @returns {string}
 */
export function hrefWithCleanImplicitGrant(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const hashBody = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (!hashBody || isCleanImplicitHash(hashBody)) return href;
  const query = implicitGrantQuery(hashBody);
  if (!query) return href;
  url.hash = '';
  return `${url.href}#${query}`;
}

/**
 * Repair `window.location` before `createClient`. auth-js reads the URL from
 * its constructor path; once `access_token` is missing, no recovery session
 * is stored.
 */
export function installCleanRecoveryHash() {
  if (typeof window === 'undefined' || !window.location) return;
  try {
    const cleaned = hrefWithCleanImplicitGrant(window.location.href);
    if (!cleaned || cleaned === window.location.href) return;
    window.history.replaceState(window.history.state, '', cleaned);
  } catch {
    // Leave the URL alone. Boot still reports an invalid recovery link.
  }
}

/**
 * Read a recovery arrival from a full URL.
 * Search params win over the hash, matching auth-js `parseParametersFromURL`.
 * A hash route (`#/change-password`) is not parsed as an auth query string.
 * A double hash still yields `type=recovery` from the token query.
 *
 * @param {string} href
 * @returns {{ type: 'recovery'|null, tokenHash: string|null, isChangePasswordRoute: boolean }}
 */
export function readRecoveryArrival(href) {
  const url = new URL(href);
  const hashBody = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  const grantQuery = implicitGrantQuery(hashBody);
  const hashParams = grantQuery
    ? new URLSearchParams(grantQuery)
    : (hashBody && !hashBody.startsWith('/') && !hashBody.includes('#')
      ? new URLSearchParams(hashBody)
      : new URLSearchParams());
  const type = url.searchParams.get('type') || hashParams.get('type') || null;
  const tokenHash = url.searchParams.get('token_hash') || hashParams.get('token_hash') || null;
  const isChangePasswordRoute = url.hash === '#/change-password'
    || url.hash.startsWith('#/change-password?')
    || url.hash.startsWith('#/change-password#');
  return {
    type: type === 'recovery' ? 'recovery' : null,
    tokenHash: tokenHash || null,
    isChangePasswordRoute,
  };
}

/**
 * `redirectTo` for `resetPasswordForEmail`. Current origin, no hash.
 * GoTrue appends `#` and the implicit-grant query. A hash here would hide
 * `access_token` from auth-js. Production is `https://getthehayout.com/`.
 *
 * @param {string} [origin]
 * @returns {string}
 */
export function passwordResetRedirectTo(origin = window.location.origin) {
  const base = import.meta.env.BASE_URL || '/';
  const url = new URL(base, origin);
  url.hash = '';
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
