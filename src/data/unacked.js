/**
 * @file Persisted per-row "unacked" marker for sync.
 *
 * When a save is queued, its row (table + id) is marked with that version:
 * `stamp` (updated_at) and `order` (write order, see write-order.js), plus
 * `create` when a create for the row has not been confirmed yet. A confirmed
 * send of the same or a newer version clears the mark. A 0-row result, a dead
 * letter or a superseded drop never clears it.
 *
 * "Resync to server" reads these marks so a row whose queue entry was lost
 * (an old end-of-flush rewrite, a swallowed storage error) is still sent.
 * The marker starts empty: nothing is back-filled from older saves.
 */

export const UNACKED_KEY = '_sync_unacked';

function markKey(table, id) {
  return `${table}\u0000${id}`;
}

function parseMs(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function recordStamp(record) {
  return record?.updated_at || record?.updatedAt || null;
}

/** Same rule as custom-sync: by updated_at when both are known, else by write order. */
function olderVersion(aStamp, aOrder, bStamp, bOrder) {
  const as = parseMs(aStamp);
  const bs = parseMs(bStamp);
  if (as != null && bs != null) return as < bs;
  const ao = parseMs(aOrder);
  const bo = parseMs(bOrder);
  return ao != null && bo != null && ao < bo;
}

function isCreate(operation) {
  return operation == null || operation === 'push' || operation === 'insert' || operation === 'upsert';
}

/** All marks, keyed by table + id. Unreadable storage reads as no marks. */
export function readUnacked() {
  try {
    const raw = localStorage.getItem(UNACKED_KEY);
    const marks = raw ? JSON.parse(raw) : {};
    return marks && typeof marks === 'object' && !Array.isArray(marks) ? marks : {};
  } catch {
    return {};
  }
}

/** Marks as a list of `{ table, id, stamp, order, create }`. */
export function listUnacked() {
  return Object.values(readUnacked()).filter(mark => mark && mark.table && mark.id != null);
}

/**
 * Apply queued entries to a marks object (pure). A delete removes the row's
 * mark (the row is gone locally); any other write marks its version, keeping
 * the newer of the old and new marks, and remembers an unconfirmed create.
 */
export function applyEntriesToMarks(marks, entries) {
  const next = { ...marks };
  for (const entry of entries) {
    const id = entry.id ?? entry.record?.id;
    if (!entry.table || id == null) continue;
    const key = markKey(entry.table, id);
    if (entry.operation === 'delete') {
      delete next[key];
      continue;
    }
    const prev = next[key];
    const stamp = recordStamp(entry.record);
    const order = entry.enqueued_at || null;
    const create = Boolean(prev?.create) || (isCreate(entry.operation) && entry.update_only !== true);
    if (prev && olderVersion(stamp, order, prev.stamp, prev.order)) next[key] = { ...prev, create };
    else next[key] = { table: entry.table, id, stamp, order, create };
  }
  return next;
}

/** Mark queued entries. Throws when storage refuses the write. */
export function markEntries(entries) {
  if (!entries.length) return;
  localStorage.setItem(UNACKED_KEY, JSON.stringify(applyEntriesToMarks(readUnacked(), entries)));
}

function writeMarks(marks) {
  try {
    localStorage.setItem(UNACKED_KEY, JSON.stringify(marks));
  } catch {
    // A mark that can't be cleared only makes Resync look at the row again.
  }
}

/**
 * A send of (stamp, order) for the row was confirmed. Clear the mark when that
 * version is the same as or newer than the marked one; otherwise keep it, but
 * a confirmed create means the row now exists on the server.
 */
export function ackMark(table, id, stamp, order, wasCreate) {
  const marks = readUnacked();
  const key = markKey(table, id);
  const mark = marks[key];
  if (!mark) return;
  if (!olderVersion(stamp, order, mark.stamp, mark.order)) {
    delete marks[key];
  } else if (wasCreate && mark.create) {
    marks[key] = { ...mark, create: false };
  } else {
    return;
  }
  writeMarks(marks);
}

/** Remove the row's mark (after a confirmed delete, or a Resync skip). */
export function clearMark(table, id) {
  const marks = readUnacked();
  const key = markKey(table, id);
  if (!marks[key]) return;
  delete marks[key];
  writeMarks(marks);
}
