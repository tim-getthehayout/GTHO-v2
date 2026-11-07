/* global __BUILD_STAMP__ */
/** @file Visible build stamp shared by the header and the login overlay. */

/**
 * The same label the authenticated header shows.
 * Format is `bYYYY-MM-DD.HHMM-<shortsha>` when Vite baked a real stamp.
 * `dev` (and a missing define) falls back to `<meta name="app-version">`, then `dev`.
 * @returns {string}
 */
export function buildStampLabel() {
  return (typeof __BUILD_STAMP__ !== 'undefined' && __BUILD_STAMP__ !== 'dev')
    ? __BUILD_STAMP__
    : (typeof document !== 'undefined' ? document.querySelector('meta[name="app-version"]')?.content || 'dev' : 'dev');
}
