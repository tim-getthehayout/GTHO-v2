/** Unit-only backup normalization/preflight. No writes, names never resolve IDs. */
import { UNIT_STANDARDS, UNIT_TABLES, foldUnitName, normalizeUnitName } from '../utils/unit-standards.js';
export const UNIT_REFERENCES = Object.freeze([['animal_treatments', 'dose_unit_id', 'dose_units'], ['amendments', 'qty_unit_id', 'input_product_units'], ['input_products', 'unit_id', 'input_product_units']]);
export function migrateUnitBackup(backup) {
  const tables = backup.tables || {};
  for (const table of UNIT_TABLES) {
    const standards = UNIT_STANDARDS.filter(row => row.table === table);
    const map = new Map(standards.map(row => [row.legacyId, row.id]));
    tables[table] = (tables[table] || []).filter(row => !standards.some(unit => unit.id === row.id || unit.legacyId === row.id)).map(row => ({ ...row, operation_id: backup.operation_id, name: normalizeUnitName(row.name) }));
    for (const [child, column, parent] of UNIT_REFERENCES) if (parent === table) {
      for (const row of tables[child] || []) if (map.has(row[column])) row[column] = map.get(row[column]);
    }
  }
  return backup;
}
export async function preflightUnits(backup, operationId, client, version) {
  const fail = detail => ({ success: false, error: `Unit restore validation failed: ${detail}. Nothing was changed.` });
  const hasWork = UNIT_TABLES.some(table => (backup.tables[table] || []).length) || UNIT_REFERENCES.some(([table,field]) => (backup.tables[table] || []).some(row => row[field] != null));
  if (!hasWork) return { success: true };
  const incoming = {};
  for (const table of UNIT_TABLES) {
    const data = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await client.from(table).select('*').range(offset, offset + 999);
      if (page.error || !Array.isArray(page.data)) return fail('target unit catalog could not be verified');
      data.push(...page.data);
      if (page.data.length < 1000) break;
    }
    const standard = data.filter(row => row.operation_id == null), own = data.filter(row => row.operation_id === operationId);
    const targetStandardIds = new Set(standard.map(row => row.id));
    const source = backup.tables[table] || [];
    // Legacy rows with target standard IDs are ignored, never written back.
    const rows = source.filter(row => !targetStandardIds.has(row.id));
    const ids = new Set(), names = new Map();
    for (const row of [...standard, ...own]) names.set(foldUnitName(row.name), row.id);
    for (const row of rows) {
      if (version < 44) return fail('custom units require verified schema 44');
      if (!row.id || row.operation_id !== operationId || ids.has(row.id)) return fail('custom unit ownership or duplicate ID');
      row.name = normalizeUnitName(row.name);
      const name = foldUnitName(row.name);
      if (!name || (names.has(name) && names.get(name) !== row.id)) return fail('unit name conflicts with a standard, archived or custom unit');
      if (data.some(target => target.id === row.id && target.operation_id !== operationId)) return fail('unit ID belongs to another scope');
      ids.add(row.id); names.set(name,row.id);
    }
    const allowed = new Set([...targetStandardIds, ...ids]);
    for (const [child, column, parent] of UNIT_REFERENCES) if (parent === table) {
      for (const row of backup.tables[child] || []) if (row[column] != null && (row.operation_id !== operationId || !allowed.has(row[column]))) return fail('a record references a missing or foreign unit');
    }
    incoming[table] = rows;
  }
  // An RLS-hidden foreign UUID must also be rejected BEFORE deleting any domain rows.
  if (version >= 44 && UNIT_TABLES.some(table => incoming[table].length)) {
    const { data, error } = await client.rpc('unit_restore_id_conflicts', { p_operation: operationId, p_dose_ids: incoming.dose_units.map(row=>row.id), p_product_ids: incoming.input_product_units.map(row=>row.id), p_dose_rows: incoming.dose_units, p_product_rows: incoming.input_product_units });
    if (error || data !== false) return fail('custom unit IDs or normalized names conflict with the target catalog or could not be verified');
  }
  for (const table of UNIT_TABLES) backup.tables[table] = incoming[table];
  return { success: true };
}
