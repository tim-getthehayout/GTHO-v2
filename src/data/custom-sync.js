import { operationPushShape } from '../entities/operation.js';
import { UNIT_TABLES } from '../utils/unit-standards.js';
import { RELEASED_SCHEMA_VERSION } from './schema-release.js';
/** @file Custom Supabase sync implementation with offline queue + exponential backoff */
/* global AbortController */

import { SyncAdapter } from './sync-adapter.js';
import { supabase } from './supabase-client.js';
import { logger } from '../utils/logger.js';
import { nextWriteOrder } from './write-order.js';

const SYNC_QUEUE_KEY = '_sync_queue';
const DEAD_LETTER_KEY = '_dead_letter_queue';
const MAX_RETRIES = 5;
// OI-0184: how many times the auto-drain path will re-attempt a dead-lettered
// record on subsequent `flush()` calls before leaving it for manual recovery
// via the indicator-tap retry. After this many auto attempts the entry stays
// in the DLQ until the user taps the red indicator.
const MAX_AUTO_DRAIN = 3;
const BACKOFF_BASE_MS = 1000;

/**
 * Read the sync queue from localStorage.
 * @returns {Array}
 */
function readQueue() {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    const kept = rows.filter(row => !UNIT_TABLES.includes(row.table) || (row.record?.operation_id != null && row.operation !== 'delete'));
    if (kept.length !== rows.length) {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(kept));
      logger.info('sync', 'Legacy or read-only unit queue entries discarded', { count: rows.length - kept.length });
    }
    return kept;
  } catch {
    return [];
  }
}

/**
 * Write the sync queue to localStorage.
 * @param {Array} queue
 */
function writeQueue(queue) {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full — logged but not fatal
  }
}

/**
 * Read the dead letter queue from localStorage.
 * @returns {Array}
 */
function readDeadLetters() {
  try {
    const raw = localStorage.getItem(DEAD_LETTER_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    const kept = rows.filter(row => !UNIT_TABLES.includes(row.table) || (row.record?.operation_id != null && row.operation !== 'delete'));
    if (kept.length !== rows.length) {
      localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(kept));
      logger.info('sync', 'Legacy or read-only unit dead letters discarded', { count: rows.length - kept.length });
    }
    return kept;
  } catch {
    return [];
  }
}

/**
 * Write the dead letter queue to localStorage.
 * @param {Array} letters
 */
function writeDeadLetters(letters) {
  try {
    localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(letters));
  } catch {
    // Storage full
  }
}

/**
 * Calculate backoff delay for attempt number.
 * @param {number} attempt - 0-indexed
 * @returns {number} milliseconds
 */
function backoffDelay(attempt) {
  return BACKOFF_BASE_MS * Math.pow(2, attempt);
}

/**
 * Wait for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * Per-request timeout for every remote sync call. A request that never
 * settles would otherwise hold its row's send chain (and flush) forever.
 * A timeout aborts the request and counts as a failure, so the normal
 * retry / dead-letter path runs.
 */
export const SYNC_REQUEST_TIMEOUT_MS = 15_000;

/** Per-row key used to chain pushes for the same table + id. */
function rowKey(table, id) {
  return `${table}\0${id}`;
}

function entryRowId(entry) {
  return entry?.id || entry?.record?.id;
}

function normalizePushOp(operation) {
  if (operation === 'push' || operation == null) return 'upsert';
  return operation;
}

function isCreateOp(operation) {
  const op = normalizePushOp(operation);
  return op === 'insert' || op === 'upsert';
}

/** A row's updated_at as epoch ms, or null when missing or unparseable. */
function stampMs(record) {
  const raw = record?.updated_at || record?.updatedAt;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** True only when both stamps are known and `a` is strictly older than `b`. */
function isOlder(a, b) {
  return a != null && b != null && a < b;
}

/**
 * Version order between a pending payload and a sent one: by updated_at when
 * both stamps are known, otherwise by local write order (`origin`, epoch ms).
 * Rows on tables with no updated_at column (and unparseable stamps) use the
 * write order. Unknown on both sides is never older.
 */
function olderVersion(aStamp, aOrigin, bStamp, bOrigin) {
  if (aStamp != null && bStamp != null) return aStamp < bStamp;
  return isOlder(aOrigin, bOrigin);
}

function isoMs(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Write order of a queue entry: when it was queued. */
function entryOrigin(entry) {
  return isoMs(entry?.enqueued_at);
}

/** Write order of a dead letter: when its push was issued (legacy: when it was dead-lettered). */
function letterOrigin(letter) {
  return isoMs(letter?.origin_at || letter?.dead_lettered_at);
}

function maxStamp(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/** Identity of a queue entry within one flush snapshot. */
function entrySig(entry) {
  return JSON.stringify([entry.table, entryRowId(entry), entry.operation, entry.enqueued_at || null, entry.durable_key || null, entry.record?.updated_at || null]);
}

/** Identity of a dead letter across re-reads of the DLQ. */
function letterSig(letter) {
  return JSON.stringify([letter.table, entryRowId(letter), letter.dead_lettered_at || null, letter.record?.updated_at || null]);
}

function noop() {}


export class CustomSync extends SyncAdapter {
  constructor() {
    super();
    this._status = 'idle';
    this._statusListeners = new Set();
    this._flushing = false;
    // Per-row send chain: every write to a table + id waits for the previous
    // write to that row to settle, so versions go out in order. Entries are
    // dropped when a row's chain goes idle.
    this._rowGates = new Map();
    // Newest updated_at (epoch ms) successfully sent per row. A payload older
    // than this is dropped, so a stale copy can never land last.
    this._sentStamps = new Map();
    // After an online delete: the newest stamp known for the row when the
    // delete was issued. Saves at or before it are dropped.
    this._tombstones = new Map();
    // Newest write order (epoch ms) successfully sent per row; the clock for
    // rows with no updated_at (see write-order.js). Like the clock, this is
    // per tab: separate tabs keep separate clocks and sent records.
    this._sentOrigins = new Map();
    // Queue entries already sent by the running flush (by entrySig).
    this._flushSent = null;
  }

  _setStatus(status) {
    if (this._status !== status) {
      this._status = status;
      for (const cb of this._statusListeners) {
        cb(status);
      }
    }
  }

  async isOnline() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    if (!supabase) return false;
    return true;
  }

  getStatus() {
    return this._status;
  }

  onStatusChange(callback) {
    this._statusListeners.add(callback);
    return () => this._statusListeners.delete(callback);
  }

  async push(table, record, operation = 'upsert') {
    if (UNIT_TABLES.includes(table) && (operation === 'delete' || record.operation_id == null || RELEASED_SCHEMA_VERSION < 44)) return { id: record.id, success: false, error: 'Unit write unavailable until schema 44; standards are read-only.' };
    const online = await this.isOnline();
    if (!online) {
      this._enqueue(operation, table, record);
      this._setStatus('offline');
      return { id: record.id, success: true, error: undefined };
    }

    return this._enqueueRowPush(table, record, operation);
  }

  async pushBatch(table, records) {
    if (UNIT_TABLES.includes(table)) return Promise.all(records.map(record => this.push(table, record)));
    const online = await this.isOnline();
    if (!online) {
      for (const record of records) {
        this._enqueue('push', table, record);
      }
      this._setStatus('offline');
      return records.map(r => ({ id: r.id, success: true }));
    }

    return Promise.all(records.map(r => this._enqueueRowPush(table, r, 'upsert')));
  }

  async pull(table, since) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('updated_at', since);
    if (error) {
      logger.error('sync', `pull failed for ${table}`, { error: error.message });
      return [];
    }
    return data || [];
  }

  async pullAll(table) {
    if (!supabase) return [];
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      logger.error('sync', `pullAll failed for ${table}`, { error: error.message });
      return [];
    }
    return data || [];
  }

  /**
   * Online deletes join the row's send chain: the delete waits for an
   * in-flight save of the row, saves queued for the row before the delete
   * are dropped, and once it succeeds the row's queued saves and dead letters
   * are cleared and a tombstone stops older saves from bringing it back.
   */
  async delete(table, id) {
    if (UNIT_TABLES.includes(table)) return { id, success: false, error: 'Units cannot be deleted.' };
    const online = await this.isOnline();
    if (!online) {
      this._enqueue('delete', table, { id });
      this._setStatus('offline');
      return { id, success: true };
    }

    if (!supabase) return { id, success: false, error: 'No Supabase client' };

    const key = rowKey(table, id);
    const gate = this._rowGate(key);
    gate.deleteGen += 1;
    const seenAtCall = gate.maxSeen;
    return this._runInRowGate(key, async () => {
      const { error } = await this._request(table, () => supabase.from(table).delete().eq('id', id));
      if (error) {
        return { id, success: false, error: error.message };
      }
      this._afterDelete(table, id, seenAtCall);
      return { id, success: true };
    });
  }

  /** Tombstone the row and clear its queued saves and dead letters. */
  _afterDelete(table, id, seenAtCall) {
    const key = rowKey(table, id);
    const sameRow = entry => entry.table === table && entryRowId(entry) === id;
    let tomb = maxStamp(seenAtCall, this._sentStamps.get(key) ?? null);
    const queue = readQueue();
    for (const entry of queue) {
      if (sameRow(entry) && normalizePushOp(entry.operation) !== 'delete') tomb = maxStamp(tomb, stampMs(entry.record));
    }
    const letters = readDeadLetters();
    for (const letter of letters) {
      if (sameRow(letter)) tomb = maxStamp(tomb, stampMs(letter.record));
    }
    if (tomb != null) this._tombstones.set(key, maxStamp(tomb, this._tombstones.get(key) ?? null));
    const keptQueue = queue.filter(entry => !(sameRow(entry) && normalizePushOp(entry.operation) !== 'delete'));
    if (keptQueue.length !== queue.length) writeQueue(keptQueue);
    const keptLetters = letters.filter(letter => !sameRow(letter));
    if (keptLetters.length !== letters.length) writeDeadLetters(keptLetters);
  }

  /**
   * Enqueue an operation for later sync. Every version is kept, in order.
   */
  _enqueue(operation, table, record) {
    if (table === 'operations') record = operationPushShape(record, operation);
    const queue = readQueue();
    queue.push({
      id: record.id,
      operation,
      table,
      record,
      enqueued_at: nextWriteOrder(),
      attempts: 0,
      errors: [],
    });
    writeQueue(queue);
  }

  _rowGate(key) {
    let gate = this._rowGates.get(key);
    if (!gate) {
      gate = { tail: Promise.resolve(), pending: 0, deleteGen: 0, maxSeen: null };
      this._rowGates.set(key, gate);
    }
    return gate;
  }

  /**
   * Run `task` after every earlier task for the same row has settled. The
   * chain releases on success, failure and throw; the gate entry is removed
   * once nothing is pending for the row.
   */
  _runInRowGate(key, task) {
    const gate = this._rowGate(key);
    gate.pending += 1;
    const run = gate.tail.then(() => task(gate));
    gate.tail = run.then(noop, noop).then(() => {
      gate.pending -= 1;
      if (gate.pending === 0 && this._rowGates.get(key) === gate) this._rowGates.delete(key);
    });
    return run;
  }

  /**
   * Why a payload (updated_at `stamp`, write order `origin`) must not be sent
   * for this row: 'older' than the newest version already sent, or 'deleted'
   * (at or before a delete's tombstone). Null when it should be sent.
   */
  _supersededReason(key, stamp, origin = null) {
    if (olderVersion(stamp, origin, this._sentStamps.get(key) ?? null, this._sentOrigins.get(key) ?? null)) return 'older';
    // Tombstones compare updated_at only, so a save with no timestamp is not
    // tombstone-blocked. Saves pending when the delete was issued are still
    // dropped by deleteGen, and no app path re-saves a deleted id.
    const tomb = this._tombstones.get(key);
    if (stamp != null && tomb != null && stamp <= tomb) return 'deleted';
    return null;
  }

  _isSuperseded(key, stamp, origin = null) {
    return this._supersededReason(key, stamp, origin) != null;
  }

  /**
   * Record a successful send of `record` (write order `originIso`) and prune
   * the persisted state for that row, so nothing older survives a reload:
   * - dead letters stamped at or before it (or, with no stamps, issued
   *   before it) are cleared;
   * - queued saves stamped strictly before it (or, with no stamps, queued
   *   before it) are removed.
   */
  _markSent(table, record, originIso = null) {
    const stamp = stampMs(record);
    const origin = isoMs(originIso);
    if (stamp == null && origin == null) return;
    const id = record.id;
    const key = rowKey(table, id);
    if (stamp != null) this._sentStamps.set(key, maxStamp(stamp, this._sentStamps.get(key) ?? null));
    if (origin != null) this._sentOrigins.set(key, maxStamp(origin, this._sentOrigins.get(key) ?? null));
    const sameRow = entry => entry.table === table && entryRowId(entry) === id;

    const letters = readDeadLetters();
    const keptLetters = letters.filter(letter => {
      if (!sameRow(letter)) return true;
      const letterStamp = stampMs(letter.record);
      if (letterStamp != null && stamp != null) return letterStamp > stamp;
      return !isOlder(letterOrigin(letter), origin);
    });
    if (keptLetters.length !== letters.length) writeDeadLetters(keptLetters);

    const queue = readQueue();
    const keptQueue = queue.filter(entry => !(sameRow(entry) && normalizePushOp(entry.operation) !== 'delete'
      && olderVersion(stampMs(entry.record), entryOrigin(entry), stamp, origin)));
    if (keptQueue.length !== queue.length) writeQueue(keptQueue);
  }

  /**
   * An online `update` whose row may not exist on the server yet (an unsent
   * create for it is still queued or dead-lettered) is sent as an upsert, so
   * the row is created rather than matching nothing. On `operations`, a
   * still-queued or dead-lettered insert keeps its compiled schema_version
   * stamp.
   */
  _effectiveOp(table, record, operation, shapeAs = null) {
    if (operation !== 'update') return { operation, shapeAs: shapeAs || operation };
    const id = record.id;
    let uncreated = false;
    let insertStamp = false;
    for (const entry of readQueue()) {
      if (entry.table !== table || entryRowId(entry) !== id || !isCreateOp(entry.operation)) continue;
      if (this._flushSent?.has(entrySig(entry))) continue;
      uncreated = true;
      if (normalizePushOp(entry.operation) === 'insert') insertStamp = true;
    }
    for (const letter of readDeadLetters()) {
      if (letter.table !== table || entryRowId(letter) !== id) continue;
      // Dead letters replay as upserts. Only a letter written from an insert
      // (marked shape 'insert') carries the stamp; a stamp merely present in
      // a letter's record is never trusted.
      uncreated = true;
      if (letter.shape === 'insert') insertStamp = true;
    }
    if (!uncreated) return { operation, shapeAs: operation };
    return { operation: 'upsert', shapeAs: table === 'operations' && insertStamp ? 'insert' : 'upsert' };
  }

  /**
   * Send a write through its row's chain. Every version goes out in order;
   * a payload older than the newest one already sent for the row (or at or
   * before a delete's tombstone) is dropped instead of sent. Writes to
   * different rows are not serialised behind each other.
   */
  _enqueueRowPush(table, record, operation = 'upsert', opts = {}) {
    const key = rowKey(table, record.id);
    const gate = this._rowGate(key);
    const gen = gate.deleteGen;
    const stamp = stampMs(record);
    // Write order: the call time for a live push, enqueued_at for a flush entry.
    const originAt = opts.originAt || nextWriteOrder();
    gate.maxSeen = maxStamp(gate.maxSeen, stamp);
    return this._runInRowGate(key, async () => {
      const reason = gate.deleteGen !== gen ? 'deleted' : this._supersededReason(key, stamp, isoMs(originAt));
      if (reason === 'older') {
        // Usually a stale queued or retried copy; also how clock skew shows up.
        logger.warn('sync', 'Older row write dropped', { table });
        return { id: record.id, success: true, superseded: true };
      }
      if (reason === 'deleted') {
        logger.info('sync', 'Row write dropped after delete', { table });
        return { id: record.id, success: true, superseded: true };
      }
      const { operation: op, shapeAs } = this._effectiveOp(table, record, normalizePushOp(operation), opts.shapeAs);
      const result = await this._pushToRemote(table, record, op, shapeAs, originAt);
      if (result?.success) this._markSent(table, record, originAt);
      return result;
    });
  }

  /**
   * Run one remote request with SYNC_REQUEST_TIMEOUT_MS. On timeout the
   * request is aborted and an error result is returned, so callers treat it
   * as a failed attempt.
   */
  async _request(table, build) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => {
        controller?.abort();
        logger.warn('sync', 'Sync request timed out', { table, timeoutMs: SYNC_REQUEST_TIMEOUT_MS });
        resolve({ error: { message: `Sync request timed out after ${SYNC_REQUEST_TIMEOUT_MS} ms` } });
      }, SYNC_REQUEST_TIMEOUT_MS);
    });
    try {
      let query = build();
      if (controller && query && typeof query.abortSignal === 'function') query = query.abortSignal(controller.signal);
      return await Promise.race([Promise.resolve(query), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  _sendWrite(table, record, operation) {
    return this._request(table, () => {
      if (operation === 'insert') return supabase.from(table).insert(record);
      if (operation === 'update') {
        let query = supabase.from(table).update(record).eq('id', record.id);
        if (UNIT_TABLES.includes(table)) query = query.eq('operation_id', record.operation_id);
        return query;
      }
      return supabase.from(table).upsert(record, { onConflict: 'id' });
    });
  }

  /**
   * Push a single record to Supabase with retry logic.
   */
  // Queued mutations retain their originating operation in the immutable payload.
  // Replay is deliberately independent of the currently selected operation; RLS
  // still requires membership and unit triggers forbid moving an existing ID.
  async _pushToRemote(table, record, operation = 'upsert', shapeAs = operation, originAt = null) {
    if (table === 'operations') record = operationPushShape(record, shapeAs);
    if (UNIT_TABLES.includes(table) && (operation === 'delete' || record.operation_id == null || RELEASED_SCHEMA_VERSION < 44)) return { id: record.id, success: false, error: 'Unit write unavailable until schema 44; standards are read-only.' };
    if (!supabase) {
      this._enqueue(operation, table, record);
      return { id: record.id, success: false, error: 'No Supabase client' };
    }

    this._setStatus('syncing');

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await this._sendWrite(table, record, operation);
      const { error } = result;

      if (!error) {
        this._setStatus('idle');
        return { id: record.id, success: true };
      }

      if (attempt < MAX_RETRIES - 1) {
        await wait(backoffDelay(attempt));
      } else {
        // Move to dead letter
        this._deadLetter(table, record, error.message, attempt + 1, {
          originAt,
          shape: table === 'operations' && shapeAs === 'insert' ? 'insert' : undefined,
        });
        this._setStatus('error');
        return { id: record.id, success: false, error: error.message };
      }
    }

    return { id: record.id, success: false, error: 'Max retries exceeded' };
  }

  /**
   * Move a failed record to the dead letter queue and log it.
   */
  _deadLetter(table, record, errorMsg, retryCount, meta = {}) {
    const entry = {
      id: record.id,
      table,
      record,
      ...(meta.originAt ? { origin_at: meta.originAt } : {}),
      ...(meta.shape ? { shape: meta.shape } : {}),
      error: errorMsg,
      retry_count: retryCount,
      first_attempt_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      dead_lettered_at: new Date().toISOString(),
    };

    const letters = readDeadLetters();
    letters.push(entry);
    writeDeadLetters(letters);

    logger.error('sync', `Dead letter: ${table}/${record.id}`, { ...entry });
  }

  /**
   * Flush the offline queue. Called on reconnection. OI-0184: also drains
   * the dead-letter queue after the main queue, bounded by MAX_AUTO_DRAIN.
   */
  async flush() {
    if (this._flushing) return;
    this._flushing = true;

    try {
      const online = await this.isOnline();
      if (!online) return;

      const queue = readQueue();
      const remaining = [];
      this._flushSent = new Set();

      if (queue.length > 0) {
        this._setStatus('syncing');
        for (const entry of queue) {
          const op = entry.operation === 'push' ? 'upsert' : entry.operation;
          if (op === 'insert' || op === 'update' || op === 'upsert') {
            const result = await this._enqueueRowPush(entry.table, entry.record, op, {
              originAt: entry.enqueued_at || null,
              shapeAs: entry.shape === 'insert' ? 'insert' : null,
            });
            if (result.success) this._flushSent.add(entrySig(entry));
            if (!result.success) {
              entry.attempts++;
              entry.errors.push({ attempt: entry.attempts, error: result.error, at: new Date().toISOString() });
              if (entry.attempts < MAX_RETRIES) {
                remaining.push(entry);
              }
              // If max retries, _pushToRemote already dead-lettered it
            }
          } else if (entry.operation === 'delete') {
            const result = await this.delete(entry.table, entry.id);
            if (!result.success) {
              entry.attempts++;
              if (entry.attempts < MAX_RETRIES) {
                remaining.push(entry);
              }
            }
          }
        }

        // A confirmed multi-record save may journal NEW commands while this
        // flush is awaiting a server response. Never overwrite those receipts'
        // pending commands with the earlier flush snapshot.
        const claimed = new Set(queue.map(entry => entry.durable_key).filter(Boolean));
        const newlyJournalled = readQueue().filter(entry => entry.durable_key && !claimed.has(entry.durable_key));
        // Never write back a save that a newer send for its row has already
        // superseded; after a reload the in-memory stamps are gone.
        const live = entry => normalizePushOp(entry.operation) === 'delete'
          || !this._isSuperseded(rowKey(entry.table, entryRowId(entry)), stampMs(entry.record), entryOrigin(entry));
        writeQueue([...remaining, ...newlyJournalled].filter(live));
      }

      // OI-0184: drain the DLQ after the main queue. A transient-failure
      // record (the previous push exhausted MAX_RETRIES on a brief outage)
      // heals itself here on the next good connection with no user action.
      await this._drainDeadLetters();

      // Status reflects the *combined* health — DLQ non-empty is a failure,
      // not idle. getSyncHealth() additionally normalises this for the UI.
      const dlqAfter = readDeadLetters().length;
      if (dlqAfter > 0) this._setStatus('error');
      else this._setStatus(remaining.length > 0 ? 'error' : 'idle');
    } finally {
      this._flushing = false;
      this._flushSent = null;
    }
  }

  /**
   * OI-0184: single-shot push attempt without the internal MAX_RETRIES
   * backoff chain. Used by `_drainDeadLetters` so draining a DLQ entry takes
   * one network call instead of the 1+2+4+8s = 15-second backoff sequence
   * `_pushToRemote` runs for a fresh push.
   *
   * @param {string} table
   * @param {object} record
   * @param {string} operation
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async _singlePush(table, record, operation = 'upsert', shapeAs = operation) {
    if (table === 'operations') record = operationPushShape(record, shapeAs);
    if (UNIT_TABLES.includes(table) && (operation === 'delete' || record.operation_id == null || RELEASED_SCHEMA_VERSION < 44)) return { id: record.id, success: false, error: 'Unit write unavailable until schema 44; standards are read-only.' };
    if (!supabase) return { success: false, error: 'No Supabase client' };
    try {
      const result = await this._sendWrite(table, record, operation);
      if (result && result.error) return { success: false, error: result.error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  /**
   * OI-0184: bounded auto-retry of dead-lettered records. Each DLQ entry
   * gets one push attempt per `flush()` until its `auto_drain_count` reaches
   * MAX_AUTO_DRAIN, after which it remains in the DLQ for the user to retry
   * via the red indicator (or for "Push All" / explicit `retryDeadLetters()`).
   */
  async _drainDeadLetters() {
    if (!(await this.isOnline())) return;
    const letters = readDeadLetters();
    if (letters.length === 0) return;

    for (const letter of letters) {
      if ((letter.auto_drain_count || 0) >= MAX_AUTO_DRAIN) continue;
      const id = entryRowId(letter);
      if (!letter.table || id == null) continue;
      // Each letter goes through its row's chain, after any in-flight write.
      await this._runInRowGate(rowKey(letter.table, id), () => this._drainOneLetter(letter));
    }
  }

  /**
   * Drain one dead letter, unless a newer write for its row has landed
   * (drop it) or is still queued (leave it; that write clears it when it
   * succeeds). A letter is never sent over a newer version of its row.
   */
  async _drainOneLetter(letter) {
    const sig = letterSig(letter);
    const current = readDeadLetters();
    if (!current.some(l => letterSig(l) === sig)) return;
    const id = entryRowId(letter);
    const key = rowKey(letter.table, id);
    const stamp = stampMs(letter.record);
    const origin = letterOrigin(letter);
    if (this._isSuperseded(key, stamp, origin)) {
      writeDeadLetters(readDeadLetters().filter(l => letterSig(l) !== sig));
      return;
    }
    const newerQueued = readQueue().some(entry => entry.table === letter.table && entryRowId(entry) === id
      && normalizePushOp(entry.operation) !== 'delete' && olderVersion(stamp, origin, stampMs(entry.record), entryOrigin(entry)));
    if (newerQueued) return;

    const shapeAs = letter.shape === 'insert' ? 'insert' : 'upsert';
    const result = await this._singlePush(letter.table, letter.record, 'upsert', shapeAs);
    if (result.success) {
      writeDeadLetters(readDeadLetters().filter(l => letterSig(l) !== sig));
      this._markSent(letter.table, letter.record, letter.origin_at || letter.dead_lettered_at || null);
      return;
    }
    writeDeadLetters(readDeadLetters().map(l => (letterSig(l) === sig ? {
      ...l,
      auto_drain_count: (l.auto_drain_count || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      error: result.error,
    } : l)));
  }

  /**
   * Get pending queue entries.
   * @returns {Array}
   */
  getQueuedItems() {
    return readQueue();
  }

  /**
   * OI-0184: pending queue length. Header / logout-confirm path consume this
   * to detect a non-empty queue without serialising the whole array.
   *
   * @returns {number}
   */
  getQueueLength() {
    return readQueue().length;
  }

  /**
   * OI-0184: combined push + DLQ health snapshot. The sync indicator (and
   * any other UI surface) MUST consume this rather than `getStatus()` alone
   * so a momentary `idle` between writes cannot mask a non-empty pending or
   * dead-letter queue. When `deadLetterCount > 0`, status is forced to
   * `'failed'` regardless of the transient `_status` flag.
   *
   * @returns {{ status: 'idle'|'syncing'|'offline'|'error'|'failed', queueLength: number, deadLetterCount: number }}
   */
  getSyncHealth() {
    const queueLength = readQueue().length;
    const deadLetterCount = readDeadLetters().length;
    let status = this._status;
    if (deadLetterCount > 0) status = 'failed';
    else if (queueLength > 0 && status === 'idle') status = 'syncing';
    return { status, queueLength, deadLetterCount };
  }

  /**
   * Get dead letter entries.
   * @returns {Array}
   */
  getDeadLetters() {
    return readDeadLetters();
  }

  /**
   * Re-queue dead letters for retry (manual recovery). Per row only the
   * newest version is kept (by updated_at, else write order; ties go to the
   * later letter), and a letter is skipped when the queue already holds a
   * newer write for its row.
   */
  retryDeadLetters() {
    const letters = readDeadLetters();
    const queue = readQueue();
    const newest = new Map();
    const order = [];
    for (const letter of letters) {
      const id = entryRowId(letter);
      const key = rowKey(letter.table, id);
      const prev = newest.get(key);
      if (!prev) order.push(key);
      if (!prev || !olderVersion(stampMs(letter.record), letterOrigin(letter), stampMs(prev.record), letterOrigin(prev))) newest.set(key, letter);
    }
    for (const key of order) {
      const letter = newest.get(key);
      const id = entryRowId(letter);
      const stamp = stampMs(letter.record);
      const origin = letterOrigin(letter);
      const newerQueued = queue.some(entry => entry.table === letter.table && entryRowId(entry) === id
        && normalizePushOp(entry.operation) !== 'delete' && olderVersion(stamp, origin, stampMs(entry.record), entryOrigin(entry)));
      if (newerQueued) continue;
      queue.push({
        id: letter.id,
        operation: 'push',
        table: letter.table,
        record: letter.record,
        // Keep the letter's own write order so it never outranks a newer write.
        enqueued_at: letter.origin_at || letter.dead_lettered_at || nextWriteOrder(),
        attempts: 0,
        errors: [],
        ...(letter.shape ? { shape: letter.shape } : {}),
      });
    }
    writeQueue(queue);
    writeDeadLetters([]);
  }
}
