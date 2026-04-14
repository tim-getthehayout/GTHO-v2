/** @file Custom Supabase sync implementation with offline queue + exponential backoff */

import { SyncAdapter } from './sync-adapter.js';
import { supabase } from './supabase-client.js';
import { logger } from '../utils/logger.js';

const SYNC_QUEUE_KEY = '_sync_queue';
const DEAD_LETTER_KEY = '_dead_letter_queue';
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;

/**
 * Read the sync queue from localStorage.
 * @returns {Array}
 */
function readQueue() {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
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
    return raw ? JSON.parse(raw) : [];
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

export class CustomSync extends SyncAdapter {
  constructor() {
    super();
    this._status = 'idle';
    this._statusListeners = new Set();
    this._flushing = false;
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
    const online = await this.isOnline();
    if (!online) {
      this._enqueue(operation, table, record);
      this._setStatus('offline');
      return { id: record.id, success: true, error: undefined };
    }

    return this._pushToRemote(table, record, operation);
  }

  async pushBatch(table, records) {
    const online = await this.isOnline();
    if (!online) {
      for (const record of records) {
        this._enqueue('push', table, record);
      }
      this._setStatus('offline');
      return records.map(r => ({ id: r.id, success: true }));
    }

    return Promise.all(records.map(r => this._pushToRemote(table, r)));
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

  async delete(table, id) {
    const online = await this.isOnline();
    if (!online) {
      this._enqueue('delete', table, { id });
      this._setStatus('offline');
      return { id, success: true };
    }

    if (!supabase) return { id, success: false, error: 'No Supabase client' };

    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      return { id, success: false, error: error.message };
    }
    return { id, success: true };
  }

  /**
   * Enqueue an operation for later sync.
   */
  _enqueue(operation, table, record) {
    const queue = readQueue();
    queue.push({
      id: record.id,
      operation,
      table,
      record,
      enqueued_at: new Date().toISOString(),
      attempts: 0,
      errors: [],
    });
    writeQueue(queue);
  }

  /**
   * Push a single record to Supabase with retry logic.
   */
  async _pushToRemote(table, record, operation = 'upsert') {
    if (!supabase) {
      this._enqueue(operation, table, record);
      return { id: record.id, success: false, error: 'No Supabase client' };
    }

    this._setStatus('syncing');

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let result;
      if (operation === 'insert') {
        result = await supabase.from(table).insert(record);
      } else if (operation === 'update') {
        result = await supabase.from(table).update(record).eq('id', record.id);
      } else {
        result = await supabase.from(table).upsert(record, { onConflict: 'id' });
      }
      const { error } = result;

      if (!error) {
        this._setStatus('idle');
        return { id: record.id, success: true };
      }

      if (attempt < MAX_RETRIES - 1) {
        await wait(backoffDelay(attempt));
      } else {
        // Move to dead letter
        this._deadLetter(table, record, error.message, attempt + 1);
        this._setStatus('error');
        return { id: record.id, success: false, error: error.message };
      }
    }

    return { id: record.id, success: false, error: 'Max retries exceeded' };
  }

  /**
   * Move a failed record to the dead letter queue and log it.
   */
  _deadLetter(table, record, errorMsg, retryCount) {
    const entry = {
      id: record.id,
      table,
      record,
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
   * Flush the offline queue. Called on reconnection.
   */
  async flush() {
    if (this._flushing) return;
    this._flushing = true;

    try {
      const online = await this.isOnline();
      if (!online) return;

      const queue = readQueue();
      if (queue.length === 0) return;

      this._setStatus('syncing');
      const remaining = [];

      for (const entry of queue) {
        const op = entry.operation === 'push' ? 'upsert' : entry.operation;
        if (op === 'insert' || op === 'update' || op === 'upsert') {
          const result = await this._pushToRemote(entry.table, entry.record, op);
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

      writeQueue(remaining);
      this._setStatus(remaining.length > 0 ? 'error' : 'idle');
    } finally {
      this._flushing = false;
    }
  }

  /**
   * Get pending queue entries.
   * @returns {Array}
   */
  getQueuedItems() {
    return readQueue();
  }

  /**
   * Get dead letter entries.
   * @returns {Array}
   */
  getDeadLetters() {
    return readDeadLetters();
  }

  /**
   * Re-queue all dead letters for retry (manual recovery).
   */
  retryDeadLetters() {
    const letters = readDeadLetters();
    const queue = readQueue();
    for (const letter of letters) {
      queue.push({
        id: letter.id,
        operation: 'push',
        table: letter.table,
        record: letter.record,
        enqueued_at: new Date().toISOString(),
        attempts: 0,
        errors: [],
      });
    }
    writeQueue(queue);
    writeDeadLetters([]);
  }
}
