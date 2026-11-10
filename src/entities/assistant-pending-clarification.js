/** Strict host-only pendingClarification on the trusted checkpoint snapshot. */
export const PENDING_CLARIFICATION_MAX_BYTES = 16 * 1024;
const KEYS = new Set(['field', 'ui', 'names', 'fields', 'fill']);
const FIELDS = new Set(['paddock', 'quantityBasis', 'lineAllocations', 'carryoverTiming', 'carryoverTime', 'carryoverSplit']);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function jsonValue(value, depth) {
  if (depth > 8) return false;
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => jsonValue(item, depth + 1));
  if (isPlainObject(value)) return Object.values(value).every(item => jsonValue(item, depth + 1));
  return false;
}

/** Return the value when it matches the schema and fits the cap; otherwise null. */
export function acceptPendingClarification(value) {
  if (value == null) return null;
  if (!isPlainObject(value)) return null;
  if (Object.keys(value).some(key => !KEYS.has(key))) return null;
  if (typeof value.field !== 'string' || !FIELDS.has(value.field)) return null;
  if (value.ui !== undefined && (typeof value.ui !== 'string' || !value.ui || value.ui.length > 64)) return null;
  for (const key of ['names', 'fields', 'fill']) {
    if (value[key] === undefined) continue;
    if (!isPlainObject(value[key]) || !jsonValue(value[key], 0)) return null;
  }
  let serialized;
  try { serialized = JSON.stringify(value); } catch { return null; }
  if (serialized.length > PENDING_CLARIFICATION_MAX_BYTES) return null;
  return value;
}
