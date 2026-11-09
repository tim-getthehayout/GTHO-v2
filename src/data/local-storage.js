/** @file localStorage wrapper for entity persistence */

const PREFIX = 'gtho_v2_';

/**
 * Save entity data to localStorage.
 * @param {string} entityType - Entity type key, e.g. 'events'
 * @param {Array} data - Array of records
 */
export function saveToStorage(entityType, data) {
  // A durable local save must fail visibly; remote sync is not local persistence.
  localStorage.setItem(PREFIX + entityType, JSON.stringify(data));
}

/**
 * Load entity data from localStorage.
 * @param {string} entityType - Entity type key
 * @returns {Array}
 */
export function loadFromStorage(entityType) {
  try {
    const raw = localStorage.getItem(PREFIX + entityType);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clear all GTHO v2 data from localStorage.
 */
export function clearStorage() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

// Transaction journal uses the existing localStorage engine and entity keys.
// It is transient recovery state, not a new farm store or an audio store.
const JOURNAL = PREFIX + 'write_journal';
const RECEIPTS = PREFIX + 'write_receipts';
const readObject = key => JSON.parse(localStorage.getItem(key) || '{}');
export const hasPendingDurableWrite = () => localStorage.getItem(JOURNAL) !== null;
export function recoverDurableWrite() {
  const raw = localStorage.getItem(JOURNAL);
  if (!raw) return;
  const journal = JSON.parse(raw);
  for (const [type, rows] of Object.entries(journal.writes)) saveToStorage(type, rows);
  const localSavedAt = new Date().toISOString();
  const queue = JSON.parse(localStorage.getItem('_sync_queue') || '[]');
  for (const entry of journal.queue) if (!queue.some(old => old.durable_key === entry.durable_key)) queue.push(entry);
  if (journal.queue.length) localStorage.setItem('_sync_queue', JSON.stringify(queue));
  const receipts = readObject(RECEIPTS);
  receipts[journal.key] ??= { savedRecordId: journal.savedRecordId, localSavedAt,
    syncQueuedAt: journal.queue.length ? new Date().toISOString() : null };
  localStorage.setItem(RECEIPTS, JSON.stringify(receipts));
  localStorage.removeItem(JOURNAL);
}
export function getDurableWriteReceipt(key) {
  recoverDurableWrite();
  return readObject(RECEIPTS)[key] ?? null;
}
export function commitDurableWrite(key, writes, commands, savedRecordId) {
  recoverDurableWrite();
  const receipt = getDurableWriteReceipt(key);
  if (receipt) return receipt;
  const queue = commands.map((command, index) => ({
    ...command, operation: command.operation === 'insert' ? 'upsert' : command.operation,
    id: command.record.id, enqueued_at: new Date().toISOString(), attempts: 0, errors: [],
    durable_key: JSON.stringify([key,index]),
  }));
  // Write-ahead: no entity/queue changes have happened if this fails (e.g. quota).
  localStorage.setItem(JOURNAL, JSON.stringify({ key, writes, queue, savedRecordId }));
  recoverDurableWrite();
  return getDurableWriteReceipt(key);
}
