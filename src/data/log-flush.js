/* global __BUILD_STAMP__ */
/** @file OI-0150-C — flush the local logger buffer to `app_logs`.
 *
 * Pre-OI-0150 the logger wrote to `console.*` and a 200-entry rolling
 * localStorage buffer; nothing flushed to Supabase. The dev/logs viewer
 * read from `app_logs` and saw an effectively empty table — "viewer reads,
 * writer absent," structurally identical to OI-0050.
 *
 * This module closes the loop. `flushLoggerBuffer()` reads the buffer,
 * decorates each entry with `user_id` / `operation_id` / `session_id` /
 * `app_version`, batch-inserts into `app_logs`, and clears the buffer on
 * success. On failure (offline, RLS denial, network) the buffer stays
 * intact for the next attempt — the existing 200-cap discipline in
 * `logger.js` is enough; entries that would have overflowed before next
 * flush were already going to drop on the floor pre-OI-0150.
 *
 * Triggers (wired in `src/main.js` + `src/data/pull-remote.js`):
 *   - `visibilitychange` to hidden (opportunistic flush before background)
 *   - `pagehide` (covers tab close, navigation away, browser quit)
 *   - after every successful `pullAllRemote()` (piggyback on sync events)
 *
 * `sendBeacon` path is preferred for the unload-time triggers (small
 * payloads only) since the regular fetch path may be cancelled when the
 * tab is unloading. The fallback is the standard supabase insert.
 */

import { supabase } from './supabase-client.js';
import { logger } from '../utils/logger.js';
import { getOperation } from './store.js';
import { getUser } from '../features/auth/session.js';

// Threshold above which we don't try `sendBeacon` (browser caps payload at
// ~64KB; anything close to that risks a silent drop). Below the threshold,
// `sendBeacon` lets the unload-time flush actually leave the page; above,
// fall back to the fetch path and accept that some entries may be lost on
// hard tab-close.
const SEND_BEACON_BYTES_THRESHOLD = 60_000;

/**
 * Resolve the build constant or meta-tag fallback. Same shape header.js uses.
 * @returns {string}
 */
function getAppVersion() {
  if (typeof __BUILD_STAMP__ !== 'undefined' && __BUILD_STAMP__ !== 'dev') {
    return __BUILD_STAMP__;
  }
  if (typeof document !== 'undefined') {
    return document.querySelector('meta[name="app-version"]')?.content || 'dev';
  }
  return 'dev';
}

/**
 * Map a buffered logger entry → an `app_logs` row shape (snake_case columns
 * matching the entity's `toSupabaseShape` output, since we're writing
 * directly to Supabase).
 */
function decorateEntry(entry, { userId, operationId, sessionId, appVersion }) {
  return {
    user_id: userId,
    operation_id: operationId,
    session_id: entry.session_id || sessionId,
    level: entry.level,
    source: entry.source,
    message: entry.message,
    stack: entry.stack || null,
    context: entry.context,
    app_version: appVersion,
    created_at: entry.created_at,
  };
}

/**
 * Flush the local logger buffer to Supabase `app_logs`.
 *
 * @param {{ unloading?: boolean }} [opts] — when `true`, prefer
 *   `navigator.sendBeacon` over the regular fetch path so the request
 *   actually leaves the page during `pagehide` / `visibilitychange-hidden`.
 * @returns {Promise<{ flushed: number, dropped: number }>}
 */
export async function flushLoggerBuffer(opts = {}) {
  if (!supabase) return { flushed: 0, dropped: 0 };
  const buffer = logger.getBuffer();
  if (!buffer || buffer.length === 0) return { flushed: 0, dropped: 0 };

  const user = getUser();
  const op = getOperation();
  let sessionId = null;
  try { sessionId = sessionStorage.getItem('gtho_session_id') || null; } catch { /* not browser */ }
  const decorated = buffer.map(e => decorateEntry(e, {
    userId: user?.id || null,
    operationId: op?.id || null,
    sessionId,
    appVersion: getAppVersion(),
  }));

  // Unload-time path: try `navigator.sendBeacon` if the payload is small
  // enough. sendBeacon needs a Supabase REST URL; we fall back to the
  // regular fetch path if the URL is not reachable from this module.
  if (opts.unloading && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const payload = JSON.stringify(decorated);
    if (payload.length <= SEND_BEACON_BYTES_THRESHOLD) {
      try {
        // PostgREST insert endpoint; mirrors what supabase-js does internally.
        const url = `${supabase.supabaseUrl}/rest/v1/app_logs`;
        const blob = new Blob([payload], { type: 'application/json' });
        // sendBeacon doesn't carry our auth headers, so we still need to
        // attempt the regular path in parallel — but the beacon is the
        // best-effort try that may make it out before the page unloads.
        navigator.sendBeacon(url, blob);
      } catch { /* sendBeacon is best-effort */ }
    }
  }

  // Regular fetch path — the source of truth (sendBeacon is opportunistic).
  try {
    const { error } = await supabase.from('app_logs').insert(decorated);
    if (error) {
      logger.error('log-flush', 'app_logs insert failed; buffer kept', { error: error.message });
      return { flushed: 0, dropped: 0 };
    }
    logger.clearBuffer();
    return { flushed: decorated.length, dropped: 0 };
  } catch {
    // Don't `logger.error` the network error itself — that would push the
    // failure straight back into the buffer we're trying to flush. Eat the
    // exception silently; the next flush trigger will retry from the same
    // buffer (the unflushed entries stay there until success).
    return { flushed: 0, dropped: 0 };
  }
}
