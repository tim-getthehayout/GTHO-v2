/** Exact 044 unit restore contract. Never forward an unvalidated backup object. */
import { normalizeUnitName } from '../utils/unit-standards.js';
const COLUMNS = new Set(['id', 'operation_id', 'name', 'archived', 'created_at', 'updated_at']);
export const unitUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;

// CP-55/PostgREST ISO timestamps: preserve microseconds and offsets, but reject
// Date.parse's calendar rollover and PostgreSQL's ambiguous DateStyle inputs.
export function isUnitTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi, sec, zoneH = '0', zoneM = '0'] = match;
  const year = Number(y), month = Number(mo), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(h) < 24 && Number(mi) < 60 && Number(sec) < 60 && Number(zoneH) < 16 && Number(zoneM) < 60;
}

export function buildCustomUnitPayload(row, operationId) {
  const bad = field => ({ error: `invalid custom unit ${field}` });
  if (!row || typeof row !== 'object' || Array.isArray(row)) return bad('row');
  for (const key of Object.keys(row)) if (!COLUMNS.has(key)) return { error: `unsupported custom unit column: ${key}` };
  const id = unitUuid(row.id), operation = unitUuid(row.operation_id);
  if (!id) return bad('id (UUID required)');
  if (!operation || operation !== unitUuid(operationId)) return bad('operation_id (owned custom UUID required)');
  if (typeof row.name !== 'string' || !normalizeUnitName(row.name)) return bad('name (nonempty text required)');
  const payload = { id, operation_id: operation, name: normalizeUnitName(row.name) };
  // archived is nullable in 008/009; both timestamp columns are NOT NULL.
  // Absent optional fields retain database defaults rather than invented values.
  if (Object.hasOwn(row, 'archived')) {
    if (row.archived !== null && typeof row.archived !== 'boolean') return bad('archived (boolean or null required)');
    payload.archived = row.archived;
  }
  for (const field of ['created_at', 'updated_at']) if (Object.hasOwn(row, field)) {
    if (!isUnitTimestamp(row[field])) return bad(`${field} (non-null ISO timestamp required)`);
    payload[field] = row[field];
  }
  return { payload };
}
