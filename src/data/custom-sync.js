import { operationPushShape } from '../entities/operation.js';
import { UNIT_TABLES } from '../utils/unit-standards.js';
import { RELEASED_SCHEMA_VERSION } from './schema-release.js';
/** @file Custom Supabase sync implementation with offline queue + exponential backoff */
/* global AbortController */

import { SyncAdapter } from './sync-adapter.js';
import { supabase } from './supabase-client.js';
import { logger } from '../utils/logger.js';
import { nextWriteOrder } from './write-order.js';
import { markEntries, ackMark, clearMark, listUnacked, readUnacked, UNACKED_KEY } from './unacked.js';

const SYNC_QUEUE_KEY = '_sync_queue';
const DEAD_LETTER_KEY = '_dead_letter_queue';
const MAX_RETRIES = 5;
// OI-0184: how many times the auto-drain path will re-attempt a dead-lettered
// record on subsequent `flush()` calls before leaving it for manual recovery
// via the indicator-tap retry. After this many auto attempts the entry stays
// in the DLQ until the user taps the red indicator.
const MAX_AUTO_DRAIN = 3;
const BACKOFF_BASE_MS = 1000;
// Rows sent from one flush at a time (different rows; one row is always in order).
const FLUSH_CONCURRENCY = 6;
// Tables with no updated_at column: ordered by local write order, and Resync
// only creates rows the server is missing (never overwrites one).
export const NO_UPDATED_AT_TABLES = ['event_feed_check_items', 'batch_moves', 'batch_adjustments', 'todo_assignments'];
export const ZERO_ROWS_REASON = 'zero_rows';
const ZERO_ROWS_MESSAGE = 'Not saved: the server has no row this device can change (0 rows updated)';
const GONE_MESSAGE = 'Not sent by Resync: the row is not on the server (deleted elsewhere or out of reach)';
const RESYNC_SKIPPED_KEY = '_resync_skipped';
const RESYNC_READ_CHUNK = 100;

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
  } catch (err) {
    // Storage full or unavailable — not fatal (the in-memory queue still
    // pushes), but queued writes may not survive a reload, so log it.
    logger.error('sync', 'Sync queue write to localStorage failed', { error: err?.message, length: queue?.length });
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
 * Write the sync queue for a NEW save. Unlike writeQueue, a storage error
 * (quota) is thrown, so the save fails visibly instead of changing the local
 * row with no queue entry.
 * @param {Array} queue
 */
function writeQueueStrict(queue) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Write the dead letter queue to localStorage.
 * @param {Array} letters
 */
function writeDeadLetters(letters) {
  try {
    localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(letters));
  } catch (err) {
    // Storage full or unavailable — failed rows may not survive a reload, so log it.
    logger.error('sync', 'Dead-letter queue write to localStorage failed', { error: err?.message, length: letters?.length });
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

/**
 * A request refused for an auth reason: no session, or an expired or invalid
 * JWT. Such a write stays queued; it is never counted or dead-lettered.
 */
export function isAuthError(error) {
  if (!error) return false;
  const status = Number(error.status ?? error.statusCode);
  if (status === 401) return true;
  const code = String(error.code || '');
  if (code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') return true;
  // Only real session errors: a JWT that expired, is invalid or malformed.
  return /\bjwt (?:expired|is expired|malformed|invalid)\b|\binvalid jwt\b|\btoken (?:is|has) expired\b/i.test(String(error.message || ''));
}

/** A re-sent insert whose row is already on the server (primary-key conflict). */
function isPrimaryKeyDuplicate(error) {
  if (!error || String(error.code || '') !== '23505') return false;
  return /_pkey|\(id\)=/i.test(`${error.message || ''} ${error.details || ''}`);
}

/** Classify one write answer: ok, auth, zero_rows or error. */
function classifyWrite(result, operation) {
  const error = result?.error;
  if (error) {
    if (isAuthError(error)) return { kind: 'auth', message: error.message };
    if (operation === 'insert' && isPrimaryKeyDuplicate(error)) return { kind: 'ok', duplicate: true };
    return { kind: 'error', message: error.message };
  }
  if (operation === 'update' && (!Array.isArray(result?.data) || result.data.length === 0)) {
    return { kind: ZERO_ROWS_REASON, message: ZERO_ROWS_MESSAGE };
  }
  return { kind: 'ok' };
}

/** A dead letter's original operation, when it was recorded. */
function letterOperation(letter) {
  if (letter.reason === ZERO_ROWS_REASON) return 'update';
  return letter.operation ? normalizePushOp(letter.operation) : null;
}


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
    // Callers waiting on a queued save's outcome (by entrySig).
    this._waiters = new Map();
    // Queue entries being sent right now (by entrySig).
    this._inFlight = new Set();
    this._flushPromise = null;
    this._flushAgain = false;
    this._flushScheduled = false;
    // Held by Resync while it reads, confirms and sends.
    this._exclusive = null;
    // The last flush stopped for want of a session; writes are waiting.
    this._authBlocked = false;
    // Letters written during the running flush pass (by letterSig): the
    // drain leaves them for the next flush, as before queue-first.
    this._passLetters = new Set();
    // #478: retired on sign-out / account switch; never flushes again.
    this._disposed = false;
  }

  /** #478: stop this adapter for good (the next session gets a new one). */
  dispose() {
    this._disposed = true;
    this._statusListeners.clear();
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

  /**
   * Queue-first save (synchronous). The write is added to the persisted queue
   * (and its row marked unacked) before anything is sent, then a flush is
   * scheduled. Online and offline take the same path. Throws when the queue
   * can't be written, so the caller can fail the save visibly.
   *
   * @returns {{ entries: Array, result: Promise, cancel: Function }}
   *   `result` settles with the write's outcome (sent, dead-lettered,
   *   superseded, or still queued when offline or signed out); `cancel`
   *   takes the entries back out (the caller's local save failed).
   */
  enqueueWrites(table, records, operation = 'upsert') {
    const blocked = UNIT_TABLES.includes(table) && records.some(record => operation === 'delete' || record.operation_id == null || RELEASED_SCHEMA_VERSION < 44);
    if (blocked) {
      const error = UNIT_TABLES.includes(table) && operation === 'delete' ? 'Units cannot be deleted.' : 'Unit write unavailable until schema 44; standards are read-only.';
      return { entries: [], result: Promise.resolve(records.map(record => ({ id: record.id, success: false, error }))), cancel: noop };
    }
    const queueRaw = localStorage.getItem(SYNC_QUEUE_KEY);
    const marksRaw = localStorage.getItem(UNACKED_KEY);
    const entries = this._enqueueEntries(records.map(record => ({ operation, table, record })));
    const result = Promise.all(entries.map(entry => this._waitFor(entry)));
    this.scheduleFlush();
    const cancel = () => {
      const sigs = new Set(entries.map(entrySig));
      writeQueue(readQueue().filter(entry => !sigs.has(entrySig(entry))));
      try {
        if (marksRaw == null) localStorage.removeItem(UNACKED_KEY);
        else localStorage.setItem(UNACKED_KEY, marksRaw);
      } catch { /* restoring a smaller value; nothing more to do */ }
      if (queueRaw == null && readQueue().length === 0) localStorage.removeItem(SYNC_QUEUE_KEY);
      for (const sig of sigs) this._settle(sig, { success: false, cancelled: true });
    };
    return { entries, result, cancel };
  }

  /** Queue-first single save; see enqueueWrites. */
  enqueueWrite(table, record, operation = 'upsert') {
    const handle = this.enqueueWrites(table, [record], operation);
    return { ...handle, result: handle.result.then(results => results[0]) };
  }

  async push(table, record, operation = 'upsert') {
    return this.enqueueWrite(table, record, operation).result;
  }

  async pushBatch(table, records) {
    if (UNIT_TABLES.includes(table)) return Promise.all(records.map(record => this.push(table, record)));
    return this.enqueueWrites(table, records, 'push').result;
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

  /** Deletes are queued first like every other save (see _sendQueuedDelete). */
  async delete(table, id) {
    if (UNIT_TABLES.includes(table)) return { id, success: false, error: 'Units cannot be deleted.' };
    return this.enqueueWrite(table, { id }, 'delete').result;
  }

  /**
   * Send a queued delete through the row's send chain: it waits for an
   * in-flight save of the row, saves dispatched for the row before it are
   * dropped, and once it succeeds the row's queued saves and dead letters are
   * cleared and a tombstone stops older saves from bringing it back. A delete
   * that matches no rows succeeds (the row is gone either way).
   */
  _sendQueuedDelete(entry, sig) {
    const { table } = entry;
    const id = entryRowId(entry);
    const key = rowKey(table, id);
    const gate = this._rowGate(key);
    gate.deleteGen += 1;
    const seenAtCall = gate.maxSeen;
    return this._runInRowGate(key, async () => {
      if (!supabase) return { id, success: false, keep: true, error: 'No Supabase client' };
      const result = await this._request(table, () => supabase.from(table).delete().eq('id', id).select('id'));
      if (result?.error) {
        if (isAuthError(result.error)) {
          this._signedOut();
          return { id, success: false, auth: true, keep: true, error: result.error.message };
        }
        // Failed deletes retry on later flushes and are dropped after
        // MAX_RETRIES flushes, as before (dead-lettering them is a later slice).
        const queue = readQueue();
        const kept = [];
        for (const queued of queue) {
          if (entrySig(queued) !== sig) { kept.push(queued); continue; }
          const attempts = (queued.attempts || 0) + 1;
          if (attempts < MAX_RETRIES) kept.push({ ...queued, attempts });
        }
        writeQueue(kept);
        return { id, success: false, keep: true, error: result.error.message };
      }
      if (!Array.isArray(result?.data) || result.data.length === 0) logger.info('sync', 'Delete matched no rows', { table });
      this._afterDelete(table, id, seenAtCall);
      clearMark(table, id);
      this._removeQueued(sig);
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
   * Add writes to the persisted queue and mark their rows unacked, in one
   * step. Every version is kept, in order; each takes its write order from
   * the shared clock unless one is given (a retried letter keeps its own).
   * Throws, leaving queue and marks as they were, when storage refuses.
   */
  _enqueueEntries(specs) {
    const queue = readQueue();
    const queueRaw = localStorage.getItem(SYNC_QUEUE_KEY);
    const entries = specs.map(({ operation, table, record, extra = {}, enqueuedAt = null }) => {
      const shaped = table === 'operations' ? operationPushShape(record, operation) : record;
      return {
        id: shaped.id,
        operation,
        table,
        record: shaped,
        enqueued_at: enqueuedAt || nextWriteOrder(),
        attempts: 0,
        errors: [],
        ...extra,
      };
    });
    writeQueueStrict([...queue, ...entries]);
    try {
      markEntries(entries);
    } catch (error) {
      try {
        if (queueRaw == null) localStorage.removeItem(SYNC_QUEUE_KEY);
        else localStorage.setItem(SYNC_QUEUE_KEY, queueRaw);
      } catch { /* restoring a smaller value */ }
      throw error;
    }
    return entries;
  }

  /** Remove one queue entry (by entrySig) once it has settled. */
  _removeQueued(sig) {
    const queue = readQueue();
    const kept = queue.filter(entry => entrySig(entry) !== sig);
    if (kept.length !== queue.length) writeQueue(kept);
  }

  _waitFor(entry) {
    const sig = entrySig(entry);
    return new Promise(resolve => {
      const list = this._waiters.get(sig) || [];
      list.push(resolve);
      this._waiters.set(sig, list);
    });
  }

  _settle(sig, result) {
    const list = this._waiters.get(sig);
    if (!list) return;
    this._waiters.delete(sig);
    const entryId = (() => { try { return JSON.parse(sig)[1]; } catch { return undefined; } })();
    for (const resolve of list) resolve({ id: entryId, ...result });
  }

  /** Settle waiters whose entries are not being sent (offline, signed out, or gone from the queue). */
  _settleIdle(result, { onlyGone = false } = {}) {
    const queued = onlyGone ? new Set(readQueue().map(entrySig)) : null;
    for (const sig of [...this._waiters.keys()]) {
      if (this._inFlight.has(sig)) continue;
      if (queued && queued.has(sig)) continue;
      this._settle(sig, result);
    }
  }

  /**
   * Start a flush soon (batched to the end of the current task, well inside
   * the 1 s debounce allowed), so every save and durable write is sent
   * without waiting for an online, tab-visible or tap event.
   */
  scheduleFlush() {
    if (this._disposed || this._flushScheduled) return;
    this._flushScheduled = true;
    Promise.resolve().then(() => {
      this._flushScheduled = false;
      return this.flush();
    }).catch(error => logger.warn('sync', 'Scheduled flush failed', { error: error?.message }));
  }

  /** True when a signed-in session with a usable access token exists. */
  async hasSession() {
    const auth = supabase?.auth;
    if (!auth || typeof auth.getSession !== 'function') return false;
    try {
      const { data, error } = await auth.getSession();
      const session = data?.session;
      if (error || !session?.access_token) return false;
      if (session.expires_at && session.expires_at * 1000 <= Date.now()) return false;
      return true;
    } catch {
      return false;
    }
  }

  _signedOut() {
    this._authBlocked = true;
    this._setStatus('signedOut');
  }

  /**
   * Run `task` holding the flush lock: no normal flush sends while it runs
   * (a flush requested meanwhile runs right after). Used by Resync.
   */
  async runExclusive(task) {
    while (this._flushPromise || this._exclusive) await (this._flushPromise || this._exclusive).catch(noop);
    let release;
    this._exclusive = new Promise(resolve => { release = resolve; });
    try {
      return await task();
    } finally {
      this._exclusive = null;
      release();
      if (this._flushAgain) this.scheduleFlush();
    }
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
  _effectiveOp(table, record, operation, shapeAs = null, updateOnly = false) {
    if (operation !== 'update') return { operation, shapeAs: shapeAs || operation };
    // A replayed 0-row update stays an update, so a retry can't recreate a
    // row another device deleted.
    if (updateOnly) return { operation, shapeAs: operation };
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
      // A 0-row letter is an update of a row the server lacks, not a create.
      if (letter.reason === ZERO_ROWS_REASON) continue;
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
   * different rows are not serialised behind each other. With `opts.sig`
   * (a queue entry), the entry leaves the persisted queue as soon as it has
   * settled: sent, superseded or dead-lettered. A write waiting for sign-in
   * stays queued.
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
        if (opts.sig) this._removeQueued(opts.sig);
        return { id: record.id, success: true, superseded: true };
      }
      if (reason === 'deleted') {
        logger.info('sync', 'Row write dropped after delete', { table });
        if (opts.sig) this._removeQueued(opts.sig);
        return { id: record.id, success: true, superseded: true };
      }
      const { operation: op, shapeAs } = this._effectiveOp(table, record, normalizePushOp(operation), opts.shapeAs, opts.updateOnly === true);
      const result = await this._pushToRemote(table, record, op, shapeAs, originAt);
      if (result?.success) {
        this._markSent(table, record, originAt);
        ackMark(table, record.id, record.updated_at || record.updatedAt || null, originAt, isCreateOp(op));
      }
      if (opts.sig && !result?.keep) this._removeQueued(opts.sig);
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
        // select('id') returns the changed rows, so 0 rows is detectable.
        let query = supabase.from(table).update(record).eq('id', record.id);
        if (UNIT_TABLES.includes(table)) query = query.eq('operation_id', record.operation_id);
        return query.select('id');
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
    if (UNIT_TABLES.includes(table) && (operation === 'delete' || record.operation_id == null || RELEASED_SCHEMA_VERSION < 44)) return { id: record.id, success: false, keep: true, error: 'Unit write unavailable until schema 44; standards are read-only.' };
    if (!supabase) return { id: record.id, success: false, keep: true, error: 'No Supabase client' };

    this._setStatus('syncing');
    const shape = table === 'operations' && shapeAs === 'insert' ? 'insert' : undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const verdict = classifyWrite(await this._sendWrite(table, record, operation), operation);

      if (verdict.kind === 'ok') {
        if (verdict.duplicate) logger.info('sync', 'Re-sent create already on the server', { table });
        this._setStatus('idle');
        return { id: record.id, success: true };
      }
      if (verdict.kind === 'auth') {
        // Not an attempt: the write waits, queued, for a session.
        this._signedOut();
        return { id: record.id, success: false, auth: true, keep: true, error: verdict.message };
      }
      if (verdict.kind === ZERO_ROWS_REASON) {
        // Retrying won't help: dead-letter at once, never mark it sent.
        this._deadLetter(table, record, verdict.message, attempt + 1, { originAt, shape, operation, reason: ZERO_ROWS_REASON });
        this._setStatus('error');
        return { id: record.id, success: false, zeroRows: true, error: verdict.message };
      }

      if (attempt < MAX_RETRIES - 1) {
        await wait(backoffDelay(attempt));
      } else {
        // Move to dead letter
        this._deadLetter(table, record, verdict.message, attempt + 1, { originAt, shape, operation });
        this._setStatus('error');
        return { id: record.id, success: false, error: verdict.message };
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
      ...(meta.operation ? { operation: meta.operation } : {}),
      ...(meta.reason ? { reason: meta.reason } : {}),
      error: errorMsg,
      retry_count: retryCount,
      first_attempt_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      dead_lettered_at: new Date().toISOString(),
    };

    const letters = readDeadLetters();
    letters.push(entry);
    writeDeadLetters(letters);
    this._passLetters.add(letterSig(entry));

    logger.error('sync', 'Dead letter', { table, reason: entry.reason || null, retryCount, error: errorMsg });
  }

  /**
   * Send the persisted queue, then drain dead letters (OI-0184, bounded by
   * MAX_AUTO_DRAIN). Every save goes through here. A flush requested while
   * one runs makes it run again as soon as it ends, so nothing queued
   * meanwhile waits for the next trigger. Returns the running flush.
   */
  flush() {
    if (this._disposed) return Promise.resolve();
    if (this._exclusive) {
      this._flushAgain = true;
      return this._exclusive.then(noop, noop);
    }
    if (this._flushPromise) {
      this._flushAgain = true;
      return this._flushPromise;
    }
    this._flushPromise = (async () => {
      this._flushing = true;
      try {
        let more = true;
        while (more) {
          this._flushAgain = false;
          await this._flushOnce();
          // A flush requested during this pass (a new save, coming back
          // online) gets a fresh pass, even if this one stopped early.
          more = this._flushAgain;
        }
      } finally {
        this._flushing = false;
        this._flushSent = null;
        this._flushPromise = null;
      }
    })();
    return this._flushPromise;
  }

  /**
   * One pass over the queue. Checks online and the session once; with no
   * session nothing is sent and nothing is counted. Entries are dispatched in
   * queue order into their row chains (so each row stays in order) with up to
   * FLUSH_CONCURRENCY rows in flight. Each entry leaves the queue as soon as
   * it has settled; entries added meanwhile are left for the next pass.
   * @returns {Promise<boolean>} false when it stopped early (offline or signed out)
   */
  async _flushOnce() {
    if (!(await this.isOnline())) {
      if (readQueue().length > 0) this._setStatus('offline');
      this._settleIdle({ success: true, queued: true });
      return false;
    }
    if (!(await this.hasSession())) {
      if (readQueue().length > 0 || readDeadLetters().length > 0) this._signedOut();
      this._settleIdle({ success: false, waiting: 'auth', error: 'Waiting for sign-in' });
      return false;
    }
    this._authBlocked = false;

    const queue = readQueue();
    this._flushSent = new Set();
    this._passLetters = new Set();
    let authHit = false;
    if (queue.length > 0) {
      this._setStatus('syncing');
      const results = await this._sendEntries(queue);
      authHit = results.some(result => result?.auth);
    }
    if (authHit) {
      this._signedOut();
      this._settleIdle({ success: false, waiting: 'auth', error: 'Waiting for sign-in' }, { onlyGone: true });
      return false;
    }

    // OI-0184: drain the DLQ after the main queue. A transient-failure
    // record (the previous push exhausted MAX_RETRIES on a brief outage)
    // heals itself here on the next good connection with no user action.
    const drained = await this._drainDeadLetters();
    if (drained === 'auth') {
      this._signedOut();
      return false;
    }

    // Writes pruned from the queue by a newer send settle as superseded.
    this._settleIdle({ success: true, superseded: true }, { onlyGone: true });

    // Status reflects the *combined* health — DLQ non-empty is a failure,
    // not idle. getSyncHealth() additionally normalises this for the UI.
    if (readDeadLetters().length > 0) this._setStatus('error');
    else this._setStatus('idle');
    return true;
  }

  /** Send queue entries, in order, with up to FLUSH_CONCURRENCY in flight. */
  async _sendEntries(entries) {
    const results = new Array(entries.length);
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const index = next++;
        results[index] = await this._sendEntry(entries[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(FLUSH_CONCURRENCY, entries.length) }, worker));
    return results;
  }

  async _sendEntry(entry) {
    const sig = entrySig(entry);
    this._inFlight.add(sig);
    try {
      const op = normalizePushOp(entry.operation);
      const result = op === 'delete'
        ? await this._sendQueuedDelete(entry, sig)
        : await this._enqueueRowPush(entry.table, entry.record, op, {
          originAt: entry.enqueued_at || null,
          shapeAs: entry.shape === 'insert' ? 'insert' : null,
          updateOnly: entry.update_only === true,
          sig,
        });
      if (result?.success) this._flushSent?.add(sig);
      this._inFlight.delete(sig);
      this._settle(sig, result || { success: false });
      return result;
    } catch (error) {
      this._inFlight.delete(sig);
      this._settle(sig, { success: false, error: error?.message });
      throw error;
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
      const verdict = classifyWrite(await this._sendWrite(table, record, operation), operation);
      if (verdict.kind === 'ok') return { success: true };
      if (verdict.kind === 'auth') return { success: false, auth: true, error: verdict.message };
      if (verdict.kind === ZERO_ROWS_REASON) return { success: false, zeroRows: true, error: verdict.message };
      return { success: false, error: verdict.message };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  /**
   * OI-0184: bounded auto-retry of dead-lettered records. Each DLQ entry
   * gets one push attempt per `flush()` until its `auto_drain_count` reaches
   * MAX_AUTO_DRAIN, after which it remains in the DLQ for the user to retry
   * via the red indicator, which calls `retryDeadLetters()`. "Resync to
   * server" never calls it: Resync sends a letter only after comparing it
   * with the server copy (see planResync). An auth answer stops the drain
   * without counting the attempt.
   * @returns {Promise<'auth'|undefined>}
   */
  async _drainDeadLetters() {
    if (!(await this.isOnline())) return undefined;
    const letters = readDeadLetters();
    if (letters.length === 0) return undefined;

    for (const letter of letters) {
      if ((letter.auto_drain_count || 0) >= MAX_AUTO_DRAIN) continue;
      // A write dead-lettered in this flush pass waits for the next flush.
      if (this._passLetters.has(letterSig(letter))) continue;
      const id = entryRowId(letter);
      if (!letter.table || id == null) continue;
      // Each letter goes through its row's chain, after any in-flight write.
      const outcome = await this._runInRowGate(rowKey(letter.table, id), () => this._drainOneLetter(letter));
      if (outcome === 'auth') return 'auth';
    }
    return undefined;
  }

  /**
   * Drain one dead letter, unless a newer write for its row has landed
   * (drop it) or is still queued (leave it; that write clears it when it
   * succeeds). A letter is never sent over a newer version of its row.
   */
  async _drainOneLetter(letter) {
    const sig = letterSig(letter);
    const current = readDeadLetters();
    if (!current.some(l => letterSig(l) === sig)) return undefined;
    const id = entryRowId(letter);
    const key = rowKey(letter.table, id);
    const stamp = stampMs(letter.record);
    const origin = letterOrigin(letter);
    if (this._isSuperseded(key, stamp, origin)) {
      writeDeadLetters(readDeadLetters().filter(l => letterSig(l) !== sig));
      return undefined;
    }
    const newerQueued = readQueue().some(entry => entry.table === letter.table && entryRowId(entry) === id
      && normalizePushOp(entry.operation) !== 'delete' && olderVersion(stamp, origin, stampMs(entry.record), entryOrigin(entry)));
    if (newerQueued) return undefined;
    // Nor over a newer dead letter of the row (a failed save now leaves the
    // queue for the dead letters instead of staying queued).
    const newerLetter = readDeadLetters().some(other => letterSig(other) !== sig && other.table === letter.table
      && entryRowId(other) === id && olderVersion(stamp, origin, stampMs(other.record), letterOrigin(other)));
    if (newerLetter) return undefined;

    const shapeAs = letter.shape === 'insert' ? 'insert' : 'upsert';
    // A 0-row letter replays only as an update; other letters as upserts.
    const op = letter.reason === ZERO_ROWS_REASON ? 'update' : 'upsert';
    const result = await this._singlePush(letter.table, letter.record, op, op === 'update' ? 'update' : shapeAs);
    if (result.auth) return 'auth';
    if (result.success) {
      const originIso = letter.origin_at || letter.dead_lettered_at || null;
      writeDeadLetters(readDeadLetters().filter(l => letterSig(l) !== sig));
      this._markSent(letter.table, letter.record, originIso);
      ackMark(letter.table, id, letter.record?.updated_at || letter.record?.updatedAt || null, originIso, op !== 'update');
      return undefined;
    }
    writeDeadLetters(readDeadLetters().map(l => (letterSig(l) === sig ? {
      ...l,
      auto_drain_count: (l.auto_drain_count || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      error: result.error,
      ...(result.zeroRows ? { reason: ZERO_ROWS_REASON } : {}),
    } : l)));
    return undefined;
  }

  // --- "Resync to server" (sends only this device's unconfirmed work) ---

  /**
   * Build the Resync plan. Candidates are only this device's unconfirmed
   * work: queue entries (deletes excluded), dead letters and unacked marks.
   * Per row the newest version is the candidate. The server copy of those
   * rows only is read (id and updated_at; id only on tables with no
   * updated_at). Nothing is sent here. Call inside runExclusive.
   *
   * @param {(table: string, id: string) => object|null} localRow
   *   Supabase-shaped local row, for a marked row with no queue entry or letter.
   * @returns {Promise<{ ok: true, items: Array, counts: object } | { ok: false, reason: string, table?: string }>}
   */
  async planResync(localRow) {
    if (!(await this.isOnline())) return { ok: false, reason: 'offline' };
    if (!supabase || !(await this.hasSession())) return { ok: false, reason: 'signedOut' };

    // One entry per row. `entrySigs` / `letterSigs` record exactly what was
    // compared, so a skip or gone removes only that, never a save made after
    // the plan was built.
    const rows = new Map();
    const rowFor = (table, id) => {
      const key = rowKey(table, id);
      if (!rows.has(key)) rows.set(key, { table, id, best: null, create: false, insertShape: false, legacy: false, entrySigs: [], letterSigs: [] });
      return rows.get(key);
    };
    const consider = (row, candidate) => {
      if (!row.best || !olderVersion(candidate.stamp, candidate.origin, row.best.stamp, row.best.origin)) row.best = candidate;
    };
    const unmatchedMarks = new Map();
    for (const mark of listUnacked()) {
      const record = localRow(mark.table, mark.id);
      if (!record) {
        unmatchedMarks.set(rowKey(mark.table, mark.id), mark);
        continue;
      }
      const row = rowFor(mark.table, mark.id);
      row.create = row.create || Boolean(mark.create);
      consider(row, {
        source: 'mark', record, stamp: stampMs(record), origin: isoMs(mark.order), originIso: mark.order || null,
        operation: mark.create ? 'upsert' : 'update',
      });
    }
    for (const letter of readDeadLetters()) {
      const id = entryRowId(letter);
      if (!letter.table || id == null) continue;
      const op = letterOperation(letter);
      const row = rowFor(letter.table, id);
      row.create = row.create || (letter.reason !== ZERO_ROWS_REASON && (op ? isCreateOp(op) : letter.shape === 'insert'));
      row.insertShape = row.insertShape || letter.shape === 'insert';
      // Written before operations were recorded: it may be a create or an update.
      row.legacy = row.legacy || (!op && letter.shape !== 'insert');
      row.letterSigs.push(letterSig(letter));
      consider(row, {
        source: 'letter', letter, record: letter.record, stamp: stampMs(letter.record), origin: letterOrigin(letter),
        originIso: letter.origin_at || letter.dead_lettered_at || null,
        operation: op || (letter.shape === 'insert' ? 'insert' : 'upsert'),
      });
    }
    for (const entry of readQueue()) {
      const op = normalizePushOp(entry.operation);
      const id = entryRowId(entry);
      if (op === 'delete' || !entry.table || id == null) continue;
      const row = rowFor(entry.table, id);
      row.create = row.create || (isCreateOp(op) && entry.update_only !== true);
      row.insertShape = row.insertShape || op === 'insert' || entry.shape === 'insert';
      row.entrySigs.push(entrySig(entry));
      consider(row, {
        source: 'queue', entry, record: entry.record, stamp: stampMs(entry.record), origin: entryOrigin(entry),
        originIso: entry.enqueued_at || null, operation: op,
      });
    }
    // A mark whose local row is missing only adds its unconfirmed create to a
    // row that has other work; alone it can't be compared. Each row counts once.
    const cantCompare = [];
    for (const [key, mark] of unmatchedMarks) {
      const row = rows.get(key);
      if (row) row.create = row.create || Boolean(mark.create);
      else cantCompare.push({ table: mark.table, id: mark.id, source: 'mark' });
    }

    const byTable = new Map();
    for (const row of rows.values()) {
      if (!byTable.has(row.table)) byTable.set(row.table, []);
      byTable.get(row.table).push(row);
    }
    const server = new Map();
    for (const [table, tableRows] of byTable) {
      const columns = NO_UPDATED_AT_TABLES.includes(table) ? 'id' : 'id,updated_at';
      const ids = tableRows.map(row => row.id);
      for (let i = 0; i < ids.length; i += RESYNC_READ_CHUNK) {
        const chunk = ids.slice(i, i + RESYNC_READ_CHUNK);
        const { data, error } = await this._request(table, () => supabase.from(table).select(columns).in('id', chunk));
        if (error || !Array.isArray(data)) {
          logger.warn('resync', 'Server read failed; nothing sent', { table, error: error?.message });
          return { ok: false, reason: isAuthError(error) ? 'signedOut' : 'readFailed', table };
        }
        for (const found of data) server.set(rowKey(table, found.id), found);
      }
    }

    const items = cantCompare.map(item => ({ ...item, action: 'cantCompare' }));
    for (const [key, row] of rows) {
      const found = server.get(key);
      let action;
      let existing = false;
      if (found && NO_UPDATED_AT_TABLES.includes(row.table)) {
        // Never overwritten, and there is no stamp to compare.
        action = 'skip';
        existing = true;
      } else if (found) {
        const local = row.best.stamp;
        const remote = isoMs(found.updated_at);
        if (local == null || remote == null) action = 'cantCompare';
        else action = local > remote ? 'send' : 'skip';
      } else if (row.create) {
        action = 'send';
      } else {
        // Missing on the server: an update is gone. A legacy letter of unknown
        // operation may be an unlanded create, so it is left as it is.
        action = row.legacy ? 'cantCompare' : 'gone';
      }
      items.push({
        table: row.table, id: row.id, best: row.best, create: row.create, insertShape: row.insertShape,
        entrySigs: row.entrySigs, letterSigs: row.letterSigs,
        action, existing, serverExists: Boolean(found), serverUpdatedAt: found?.updated_at ?? null,
      });
    }
    const count = (action, pick = () => true) => items.filter(item => item.action === action && pick(item)).length;
    return {
      ok: true,
      items,
      counts: {
        send: count('send'),
        skip: count('skip', item => !item.existing),
        existing: count('skip', item => item.existing),
        gone: count('gone'),
        cantCompare: count('cantCompare'),
      },
    };
  }


  /** Remove exactly the queue entries and dead letters a plan compared. */
  _dropPlannedWork(item) {
    const entrySigs = new Set(item.entrySigs || []);
    const letterSigs = new Set(item.letterSigs || []);
    if (entrySigs.size) {
      const queue = readQueue();
      const kept = queue.filter(entry => !entrySigs.has(entrySig(entry)));
      if (kept.length !== queue.length) writeQueue(kept);
    }
    if (letterSigs.size) {
      const letters = readDeadLetters();
      const kept = letters.filter(letter => !letterSigs.has(letterSig(letter)));
      if (kept.length !== letters.length) writeDeadLetters(kept);
    }
  }

  /**
   * Carry out a confirmed Resync plan and wait for every send to settle.
   * - send: the stored payload with its own updated_at, as the operation it
   *   was (updates as updates), through the queue and the row chains;
   * - skip: the queue entries and dead letters the plan compared are removed
   *   (never a save made after the plan), the mark is cleared unless it is
   *   newer, and the item is kept in the "skipped by Resync" list for export;
   * - gone: never sent or turned into a create; the compared work becomes a
   *   0-row dead letter;
   * - can't compare: left as it is.
   * Call inside runExclusive, after the user confirmed.
   * @returns {Promise<{ sent: number, skipped: number, failed: number, gone: number, cantCompare: number, waiting: number }>}
   */
  async applyResync(plan) {
    const skippedAt = new Date().toISOString();
    const skippedList = [];
    const sends = [];
    for (const item of plan.items) {
      if (item.action === 'skip') {
        this._dropPlannedWork(item);
        // Clear the mark only if it is not newer than what was compared.
        ackMark(item.table, item.id, item.best.record?.updated_at || null, item.best.originIso, false);
        skippedList.push({ table: item.table, id: item.id, record: item.best.record, server_updated_at: item.serverUpdatedAt, skipped_at: skippedAt });
      } else if (item.action === 'gone') {
        const { best } = item;
        this._dropPlannedWork(item);
        this._deadLetter(item.table, best.record, GONE_MESSAGE, 0, { originAt: best.originIso, operation: 'update', reason: ZERO_ROWS_REASON });
      } else if (item.action === 'send') {
        sends.push(item);
      }
    }
    if (skippedList.length) this._appendResyncSkipped(skippedList);

    const entries = [];
    for (const item of sends) {
      const { best } = item;
      // A newer create of a row the server already has goes as an update:
      // re-sent as an insert it would only hit the duplicate key.
      const op = normalizePushOp(best.operation);
      const asUpdate = item.serverExists && op === 'insert';
      // A create never confirmed and missing on the server goes as a create,
      // even when the newest version is an update.
      const asCreate = !item.serverExists && item.create && !isCreateOp(op);
      if (best.source === 'queue' && !asUpdate && !asCreate) {
        entries.push(best.entry);
        continue;
      }
      let shape = asUpdate ? null : (best.entry?.shape || best.letter?.shape || null);
      if (asCreate) shape = item.table === 'operations' && item.insertShape ? 'insert' : null;
      // Queue the new entry first, so a refused write loses nothing.
      const [entry] = this._enqueueEntries([{
        operation: asUpdate ? 'update' : (asCreate ? 'upsert' : best.operation),
        table: item.table,
        record: best.record,
        enqueuedAt: best.originIso,
        extra: { ...(shape ? { shape } : {}), ...(asUpdate ? { update_only: true } : {}) },
      }]);
      if (best.source === 'queue') this._removeQueued(entrySig(best.entry));
      if (best.source === 'letter') {
        const sig = letterSig(best.letter);
        writeDeadLetters(readDeadLetters().filter(letter => letterSig(letter) !== sig));
      }
      entries.push(entry);
    }
    const results = entries.length ? await this._sendEntries(entries) : [];
    const outcome = { sent: 0, skipped: skippedList.length, failed: 0, gone: plan.counts.gone, cantCompare: plan.counts.cantCompare, waiting: 0 };
    for (const result of results) {
      if (result?.success) outcome.sent += 1;
      else if (result?.auth) outcome.waiting += 1;
      else outcome.failed += 1;
    }
    if (outcome.waiting > 0) this._signedOut();
    logger.info('resync', 'resync', { ...outcome });
    return outcome;
  }

  _appendResyncSkipped(items) {
    try {
      const raw = localStorage.getItem(RESYNC_SKIPPED_KEY);
      const list = raw ? JSON.parse(raw) : [];
      localStorage.setItem(RESYNC_SKIPPED_KEY, JSON.stringify([...(Array.isArray(list) ? list : []), ...items]));
    } catch (error) {
      logger.warn('resync', 'Skipped list write failed', { error: error?.message });
    }
  }

  /** Writes Resync skipped because the server had the same or a newer copy. */
  getResyncSkipped() {
    try {
      const list = JSON.parse(localStorage.getItem(RESYNC_SKIPPED_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  /** Unacked marks (rows saved here whose newest version is not confirmed). */
  getUnackedMarks() {
    return readUnacked();
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
   * `signedOut` means the queue is waiting for a session (B).
   *
   * @returns {{ status: 'idle'|'syncing'|'offline'|'error'|'failed'|'signedOut', queueLength: number, deadLetterCount: number }}
   */
  getSyncHealth() {
    const queueLength = readQueue().length;
    const deadLetterCount = readDeadLetters().length;
    let status = this._status;
    if (deadLetterCount > 0) status = 'failed';
    else if (queueLength > 0 && this._authBlocked) status = 'signedOut';
    else if (status === 'signedOut') status = queueLength > 0 ? 'syncing' : 'idle';
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
   * newer write for its row. A 0-row letter is re-queued as an update that
   * is never promoted to an upsert. The letters are cleared only once the
   * queue write has succeeded.
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
      const zeroRows = letter.reason === ZERO_ROWS_REASON;
      const entry = {
        id: letter.id,
        operation: zeroRows ? 'update' : 'push',
        table: letter.table,
        record: letter.record,
        // Keep the letter's own write order so it never outranks a newer write.
        enqueued_at: letter.origin_at || letter.dead_lettered_at || nextWriteOrder(),
        attempts: 0,
        errors: [],
        ...(zeroRows ? { update_only: true } : {}),
        ...(letter.shape ? { shape: letter.shape } : {}),
      };
      queue.push(entry);
    }
    writeQueueStrict(queue);
    writeDeadLetters([]);
  }
}
