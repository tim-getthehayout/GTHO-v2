/**
 * @file Backup import — CP-56.
 * Implements V2_MIGRATION_PLAN.md §5.7 steps 1–10.
 * Reads a JSON backup file, validates, migrates forward if needed,
 * wholesale-replaces operation data in FK-dependency order per §5.3a.
 */

import { supabase } from './supabase-client.js';
// getSyncAdapter reserved for future use (CP-56 wholesale replace)
// import { getSyncAdapter } from './store.js';
import { canExport, exportOperationBackup, downloadBackup } from './backup-export.js';
import { BACKUP_MIGRATIONS } from './backup-migrations.js';
import { pullAllRemote } from './pull-remote.js';
import { logger } from '../utils/logger.js';

/** Current build's supported format_version. */
const SUPPORTED_FORMAT_VERSION = 1;

/** Current build's schema_version (must match latest migration). */
const CURRENT_SCHEMA_VERSION = 26;

/**
 * FK-dependency insert order per V2_MIGRATION_PLAN.md §5.3a — authoritative.
 * Inserts iterate top-to-bottom. Deletes iterate bottom-to-top.
 * See V2_MIGRATION_PLAN.md §5.3a — authoritative.
 */
const FK_ORDER = [
  'operations',
  'farms',
  'forage_types',
  'animal_classes',
  'feed_types',
  'ai_bulls',
  'spreaders',
  'input_product_categories',
  'input_product_units',
  'treatment_categories',
  'dose_units',
  'farm_settings',
  'user_preferences',
  'locations',
  'animals',               // two-pass: dam_id, sire_animal_id
  'groups',
  'batches',
  'treatment_types',
  'input_products',
  'animal_group_memberships',
  'batch_adjustments',
  'batch_nutritional_profiles',
  'soil_tests',
  'surveys',
  'events',                // two-pass: source_event_id
  'manure_batches',
  'amendments',
  'amendment_locations',
  'manure_batch_transactions',
  'npk_price_history',
  'event_paddock_windows',
  'event_observations',
  'event_group_windows',
  'event_feed_entries',
  'event_feed_checks',
  'event_feed_check_items',
  'paddock_observations',
  'survey_draft_entries',
  'harvest_events',
  'harvest_event_fields',
  'animal_weight_records',
  'animal_treatments',
  'animal_bcs_scores',
  'animal_breeding_records',
  'animal_heat_records',
  'animal_calving_records',
  'animal_notes',
  'todos',
  'todo_assignments',
  'submissions',
];

/** Tables that use two-pass insert (self-referential FKs). */
const TWO_PASS_TABLES = {
  animals: ['dam_id', 'sire_animal_id'],
  events: ['source_event_id'],
};

/**
 * Truly global reference tables — upsert by id, no delete (§5.3 footnote).
 * Only tables WITHOUT operation_id belong here. Per-operation seed data
 * (forage_types, animal_classes, treatment_categories, treatment_types,
 * input_product_categories) are operation-scoped and follow normal
 * delete-then-insert during import. (OI-0056)
 */
const REFERENCE_TABLES = new Set([
  'dose_units',
  'input_product_units',
]);

const INSERT_BATCH_SIZE = 500;

// ── Step 1: File validation (§5.7.1) ─────────────────────────────

/**
 * Validate a parsed backup envelope.
 * @param {object} backup
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    return { valid: false, error: 'Invalid JSON: not an object.' };
  }
  if (backup.format !== 'gtho-v2-backup') {
    return { valid: false, error: `Invalid format: expected "gtho-v2-backup", got "${backup.format}".` };
  }
  if (backup.format_version > SUPPORTED_FORMAT_VERSION) {
    return { valid: false, error: `Backup format version ${backup.format_version} is newer than this build supports (${SUPPORTED_FORMAT_VERSION}). Update the app first.` };
  }
  if (backup.schema_version > CURRENT_SCHEMA_VERSION) {
    return { valid: false, error: `Backup schema version ${backup.schema_version} is newer than this build (${CURRENT_SCHEMA_VERSION}). Update the app first.` };
  }
  if (!backup.tables || typeof backup.tables !== 'object') {
    return { valid: false, error: 'Backup is missing the "tables" block.' };
  }
  if (!backup.operation_id) {
    return { valid: false, error: 'Backup is missing "operation_id".' };
  }
  return { valid: true };
}

/**
 * Extract preview data from a backup for the confirm sheet (§5.7.3).
 * @param {object} backup
 * @returns {object}
 */
export function getBackupPreview(backup) {
  const op = (backup.tables?.operations || [])[0];
  return {
    operationName: op?.name || 'Unknown',
    exportedAt: backup.exported_at || '',
    exportedByEmail: backup.exported_by?.email || 'Unknown',
    schemaVersion: backup.schema_version,
    counts: backup.counts || {},
  };
}

// ── Step 5: Migration chain (§5.7.5) ─────────────────────────────

/**
 * Migrate a backup forward through the migration chain if needed.
 * @param {object} backup - Mutated in place
 * @returns {{ migrated: boolean, from: number, to: number, error?: string }}
 */
export function migrateBackupForward(backup) {
  const from = backup.schema_version;
  let current = from;

  while (current < CURRENT_SCHEMA_VERSION) {
    const migrator = BACKUP_MIGRATIONS[current];
    if (!migrator) {
      return {
        migrated: false,
        from,
        to: current,
        error: `Missing migration for schema version ${current} → ${current + 1}. Cannot import this backup.`,
      };
    }
    backup = migrator(backup);
    current = backup.schema_version;
  }

  return { migrated: from !== current, from, to: current };
}

// ── Step 6: Wholesale replace (§5.7.6) ───────────────────────────

/**
 * Delete all rows for an operation from a table.
 * @param {string} table
 * @param {string} operationId
 */
async function deleteTableRows(table, operationId) {
  if (REFERENCE_TABLES.has(table)) return; // reference tables upsert, don't delete
  if (table === 'operations') return; // skip — blocked by operation_members FK; updated in insert phase
  if (table === 'operation_members') return; // skip — managed separately, not replaced during import

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('operation_id', operationId);
  if (error) throw new Error(`Delete failed on ${table}: ${error.message}`);
}

/**
 * Insert rows into a table in batches.
 * For two-pass tables, pass 1 nullifies self-FKs; pass 2 updates them.
 * For reference tables, upserts by id.
 * @param {string} table
 * @param {Array<object>} rows
 * @param {string} operationId
 */
async function insertTableRows(table, rows, operationId) {
  if (!rows || rows.length === 0) return;
  if (table === 'operation_members') return; // skip — not replaced during import

  // Operations: update existing row instead of insert (can't delete due to FK)
  if (table === 'operations') {
    const op = rows[0];
    if (op) {
      const { error } = await supabase
        .from('operations')
        .update({
          name: op.name,
          timezone: op.timezone,
          currency: op.currency,
          unit_system: op.unit_system,
          schema_version: op.schema_version,
          updated_at: op.updated_at,
        })
        .eq('id', operationId);
      if (error) throw new Error(`Update failed on operations: ${error.message}`);
    }
    return;
  }

  const isReference = REFERENCE_TABLES.has(table);
  const twoPassCols = TWO_PASS_TABLES[table];

  // Pass 1: insert (with self-FKs nullified for two-pass tables)
  const insertRows = twoPassCols
    ? rows.map(r => {
        const copy = { ...r };
        for (const col of twoPassCols) copy[col] = null;
        return copy;
      })
    : rows;

  for (let i = 0; i < insertRows.length; i += INSERT_BATCH_SIZE) {
    const batch = insertRows.slice(i, i + INSERT_BATCH_SIZE);

    if (isReference) {
      const { error } = await supabase
        .from(table)
        .upsert(batch, { onConflict: 'id' });
      if (error) throw new Error(`Upsert failed on ${table} (batch ${i}): ${error.message}`);
    } else {
      const { error } = await supabase
        .from(table)
        .insert(batch);
      if (error) throw new Error(`Insert failed on ${table} (batch ${i}): ${error.message}`);
    }
  }

  // Pass 2: update self-referential FKs
  if (twoPassCols) {
    const updates = rows.filter(r => twoPassCols.some(col => r[col] != null));
    for (const row of updates) {
      const updateObj = {};
      for (const col of twoPassCols) {
        if (row[col] != null) updateObj[col] = row[col];
      }
      if (Object.keys(updateObj).length > 0) {
        const { error } = await supabase
          .from(table)
          .update(updateObj)
          .eq('id', row.id);
        if (error) throw new Error(`Two-pass update failed on ${table} (id ${row.id}): ${error.message}`);
      }
    }
  }
}

// ── Step 8: Parity check (§5.7.8) ────────────────────────────────

/**
 * Run post-import parity check.
 * @param {object} backup
 * @param {string} operationId
 * @returns {Promise<{ pass: boolean, mismatches: Array<{table: string, expected: number, actual: number}> }>}
 */
async function parityCheck(backup, operationId) {
  const mismatches = [];

  for (const table of FK_ORDER) {
    const backupRows = backup.tables[table] || [];
    const expected = backupRows.length;

    const isGlobal = REFERENCE_TABLES.has(table);
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    if (!isGlobal) {
      const filterCol = table === 'operations' ? 'id' : 'operation_id';
      query = query.eq(filterCol, operationId);
    }
    const { count, error } = await query;

    if (error) {
      mismatches.push({ table, expected, actual: -1 });
      continue;
    }

    // Reference tables may have seed rows not in the backup, so actual >= expected is OK
    if (REFERENCE_TABLES.has(table)) {
      if (count < expected) {
        mismatches.push({ table, expected, actual: count });
      }
    } else if (count !== expected) {
      mismatches.push({ table, expected, actual: count });
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

// ── Main import orchestrator (§5.7 steps 1–10) ──────────────────

/**
 * Import a JSON backup file into the current operation.
 * @param {object} backup - Parsed JSON backup object
 * @param {string} operationId - Current operation ID
 * @param {Function} [onProgress] - Called with (phase, detail, pct)
 * @param {object} [options]
 * @param {boolean} [options.skipAutoBackup] - Skip auto-backup step (CP-57 §1.6: empty operation)
 * @returns {Promise<{ success: boolean, error?: string, autoBackupFileName?: string, parityResult?: object }>}
 */
export async function importOperationBackup(backup, operationId, onProgress, options = {}) {
  const progress = (phase, detail, pct) => {
    if (onProgress) onProgress(phase, detail, pct);
  };

  // Step 1: Validate (already done before calling, but double-check)
  progress('Validating', '', 5);
  const validation = validateBackup(backup);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Step 2: Pending-writes gate
  const exportCheck = canExport();
  if (!exportCheck.ok) {
    return { success: false, error: 'Sync pending — retry when sync completes.' };
  }

  // Step 4: Auto-backup of current state (§5.7.4)
  // CP-57 §1.6: skip when target operation is empty (nothing to back up)
  let autoBackupFileName;
  if (options.skipAutoBackup) {
    logger.info('backup', 'auto-backup skipped (empty operation)', { operation_id: operationId });
  } else {
    progress('Saving current data (auto-backup)', '', 10);
    try {
      const { json, fileName } = await exportOperationBackup(operationId);
      autoBackupFileName = fileName.replace('gtho-v2-backup__', 'gtho-v2-auto-backup-before-restore__');
      downloadBackup(json, autoBackupFileName);
    } catch (err) {
      logger.error('backup', 'auto-backup failed, halting import', { error: err.message });
      return { success: false, error: `Failed to save auto-backup: ${err.message}. Import halted.` };
    }
  }

  // Step 5: Migrate forward if needed (§5.7.5)
  if (backup.schema_version < CURRENT_SCHEMA_VERSION) {
    progress('Migrating', `v${backup.schema_version} → v${CURRENT_SCHEMA_VERSION}`, 20);
    const migResult = migrateBackupForward(backup);
    if (migResult.error) {
      return { success: false, error: migResult.error, autoBackupFileName };
    }
  }

  // Step 6: Wholesale replace (§5.7.6)
  // Delete: bottom-to-top per §5.3a
  const deleteOrder = [...FK_ORDER].reverse();
  const totalSteps = deleteOrder.length + FK_ORDER.length;
  let stepsDone = 0;

  for (const table of deleteOrder) {
    progress('Replacing data', `Deleting ${table}`, 25 + Math.round((stepsDone / totalSteps) * 50));
    try {
      await deleteTableRows(table, operationId);
    } catch (err) {
      logger.error('backup', 'import failed', { stage: 'delete', table, error: err.message });
      return { success: false, error: `Delete failed on ${table}: ${err.message}`, autoBackupFileName };
    }
    stepsDone++;
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // Insert: top-to-bottom per §5.3a
  for (const table of FK_ORDER) {
    const rows = backup.tables[table] || [];
    progress('Replacing data', `Inserting ${table} (${rows.length} rows)`, 25 + Math.round((stepsDone / totalSteps) * 50));
    try {
      await insertTableRows(table, rows, operationId);
    } catch (err) {
      logger.error('backup', 'import failed', { stage: 'insert', table, error: err.message });
      return { success: false, error: `Insert failed on ${table}: ${err.message}`, autoBackupFileName };
    }
    stepsDone++;
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // Step 7: Re-seed local store (§5.7.7)
  progress('Refreshing', '', 85);
  try {
    await pullAllRemote();
  } catch (err) {
    logger.error('backup', 'store re-hydrate failed after import', { error: err.message });
  }

  // Step 8: Parity check (§5.7.8)
  progress('Verifying', '', 90);
  const parityResult = await parityCheck(backup, operationId);

  // Step 9: Log (§5.7.9)
  const totalRows = FK_ORDER.reduce((sum, t) => sum + (backup.tables[t] || []).length, 0);
  if (parityResult.pass) {
    logger.info('backup', 'import complete', {
      operation_id: operationId,
      row_count: totalRows,
      migrations_applied: backup.schema_version > (validation.schema_version || backup.schema_version) ? 1 : 0,
    });
  } else {
    logger.error('backup', 'import parity check failed', {
      operation_id: operationId,
      mismatches: parityResult.mismatches,
    });
  }

  progress('Done', '', 100);

  return {
    success: parityResult.pass,
    autoBackupFileName,
    parityResult,
    error: parityResult.pass ? undefined : 'Import verification failed. Check the parity report.',
  };
}

/** Export FK_ORDER and CURRENT_SCHEMA_VERSION for tests and CP-57. */
export { FK_ORDER, REFERENCE_TABLES, TWO_PASS_TABLES, CURRENT_SCHEMA_VERSION };
