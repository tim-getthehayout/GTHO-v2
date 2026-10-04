/** @file Pull remote data from Supabase and merge into the store.
 *  Called on boot (after store init) and on reconnect (after queue flush).
 */

import { getSyncAdapter, mergeRemote, beginBatch, endBatch } from './store.js';
import { SYNC_REGISTRY } from './sync-registry.js';
import { logger } from '../utils/logger.js';
import { flushLoggerBuffer } from './log-flush.js';
import { supabase } from './supabase-client.js';

const LAST_PULLED_KEY = 'gtho_last_pulled_at';

/**
 * @returns {number | null} Epoch ms of the last successful pull, or null.
 */
export function getLastPulledAt() {
  try {
    const val = localStorage.getItem(LAST_PULLED_KEY);
    return val ? Number(val) || null : null;
  } catch { return null; }
}

// OI-0149: re-entry guard. A second caller while a pull is in flight (cold
// boot still draining + visibilitychange firing on tab foreground, two quick
// alt-tabs, online + visibilitychange firing back-to-back, etc.) shares the
// same in-flight promise instead of starting a parallel full-table pull.
// Mirrors the `_flushing` guard in CustomSync.flush() (custom-sync.js:259).
let inFlight = null;

/**
 * Pull all tables from Supabase and merge into the local store.
 * Skips tables where the pull fails (logs error, continues).
 * Concurrent callers share a single in-flight pull (OI-0149).
 * @returns {Promise<{ pulled: number, errors: number }>}
 */
export function pullAllRemote() {
  if (inFlight) return inFlight;
  inFlight = _doPullAllRemote().finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Pull a few tables and surface errors. Used by the boot gate so an existing
 * operation can hydrate before the new-operation wizard is considered.
 * Unlike pullAll(), a Supabase error is not reported as an empty table.
 * Does not take the full-pull inFlight lock — the later fire-and-forget
 * pullAllRemote() still owns that.
 * @param {string[]} entityTypes
 * @returns {Promise<{ ok: boolean, error: string|null, byType: Record<string, { pulled: number, error: string|null }> }>}
 */
export async function pullEntitiesStrict(entityTypes) {
  const byType = {};
  if (!supabase) return { ok: false, error: 'Supabase not configured', byType };

  const adapter = getSyncAdapter();
  if (adapter) {
    const online = await adapter.isOnline();
    if (!online) return { ok: false, error: 'offline', byType };
  }

  beginBatch();
  try {
    for (const entityType of entityTypes) {
      const reg = SYNC_REGISTRY[entityType];
      if (!reg) {
        byType[entityType] = { pulled: 0, error: 'unknown entity' };
        return { ok: false, error: `unknown entity ${entityType}`, byType };
      }
      const { data, error } = await supabase.from(reg.table).select('*');
      if (error) {
        logger.error('sync', `strict pull failed for ${reg.table}`, { error: error.message });
        byType[entityType] = { pulled: 0, error: error.message };
        return { ok: false, error: error.message, byType };
      }
      const records = (data || []).map(row => reg.from(row));
      if (records.length > 0) mergeRemote(entityType, records);
      byType[entityType] = { pulled: records.length, error: null };
    }
  } catch (err) {
    logger.error('sync', 'strict pull exception', { error: err.message });
    return { ok: false, error: err.message, byType };
  } finally {
    endBatch();
  }

  return { ok: true, error: null, byType };
}

async function _doPullAllRemote() {
  const adapter = getSyncAdapter();
  if (!adapter) return { pulled: 0, errors: 0 };

  const online = await adapter.isOnline();
  if (!online) return { pulled: 0, errors: 0 };

  let pulled = 0;
  let errors = 0;

  // OI-0151: wrap the merge loop in a batch so per-table notify() calls
  // accumulate into one drain at endBatch() rather than firing N
  // notifications during the pull. Without this, a populated cold-load
  // pull triggers ~6 dashboard rerenders × 5 sections each on the
  // foreground thread between network awaits and saturates Chrome until
  // the tab is killed. The dirty-set + identity-dedupe drain runs exactly
  // once after the entire pull resolves.
  beginBatch();
  try {
    for (const [entityType, reg] of Object.entries(SYNC_REGISTRY)) {
      try {
        const rows = await adapter.pullAll(reg.table);
        if (rows.length > 0) {
          const records = rows.map(row => reg.from(row));
          mergeRemote(entityType, records);
          pulled += rows.length;
        }
      } catch (err) {
        logger.error('sync', `pullAll failed for ${reg.table}`, { error: err.message });
        errors++;
      }
    }
  } finally {
    endBatch();
  }

  if (pulled > 0 || errors === 0) {
    try { localStorage.setItem(LAST_PULLED_KEY, String(Date.now())); } catch { /* quota */ }
    // OI-0150-C: opportunistic logger-buffer flush after every successful
    // pull. Piggybacks on the sync-event path so we don't need a separate
    // flush timer; if the buffer is empty this is a no-op. Failures here
    // never throw — the flush logs internally and leaves the buffer intact.
    try { await flushLoggerBuffer(); } catch { /* defensive */ }
  }

  return { pulled, errors };
}
