/**
 * @file Backup import — CP-56.
 * Implements V2_MIGRATION_PLAN.md §5.7 steps 1–10.
 * Reads a JSON backup file, validates, migrates forward if needed,
 * wholesale-replaces operation data in FK-dependency order per §5.3a.
 */

import { supabase } from './supabase-client.js';
import { canExport, exportOperationBackup, downloadBackup } from './backup-export.js';
import { BACKUP_MIGRATIONS } from './backup-migrations.js';
import { pullAllRemote } from './pull-remote.js';
import { logger } from '../utils/logger.js';

const SUPPORTED_FORMAT_VERSION = 1;
const CURRENT_SCHEMA_VERSION = 34;

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
  'animals',
  'groups',
  'batches',
  'treatment_types',
  'input_products',
  'animal_group_memberships',
  'batch_adjustments',
  'batch_nutritional_profiles',
  'soil_tests',
  'surveys',
  'events',
  'manure_batches',
  'amendments',
  'amendment_locations',
  'manure_batch_transactions',
  'npk_price_history',
  'event_paddock_windows',
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

const TWO_PASS_TABLES = {
  animals: ['dam_id', 'sire_animal_id'],
  events: ['source_event_id'],
};

const REFERENCE_TABLES = new Set([
  'dose_units',
  'input_product_units',
]);

const INSERT_BATCH_SIZE = 500;

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

async function deleteTableRows(table, operationId) {
  if (REFERENCE_TABLES.has(table)) return;
  if (table === 'operations') return;
  if (table === 'operation_members') return;

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('operation_id', operationId);
  if (error) throw new Error(`Delete failed on ${table}: ${error.message}`);
}

async function insertTableRows(table, rows, operationId) {
  if (!rows || rows.length === 0) return;
  if (table === 'operation_members') return;

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

export async function importOperationBackup(backup, operationId, onProgress, options = {}) {
  const progress = (phase, detail, pct) => {
    if (onProgress) onProgress(phase, detail, pct);
  };

  progress('Validating', '', 5);
  const validation = validateBackup(backup);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const exportCheck = canExport();
  if (!exportCheck.ok) {
    return { success: false, error: 'Sync pending — retry when sync completes.' };
  }

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

  if (backup.schema_version < CURRENT_SCHEMA_VERSION) {
    progress('Migrating', `v${backup.schema_version} → v${CURRENT_SCHEMA_VERSION}`, 20);
    const migResult = migrateBackupForward(backup);
    if (migResult.error) {
      return { success: false, error: migResult.error, autoBackupFileName };
    }
  }

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

  progress('Refreshing', '', 85);
  try {
    await pullAllRemote();
  } catch (err) {
    logger.error('backup', 'store re-hydrate failed after import', { error: err.message });
  }

  progress('Verifying', '', 90);
  const parityResult = await parityCheck(backup, operationId);

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

export { FK_ORDER, REFERENCE_TABLES, TWO_PASS_TABLES, CURRENT_SCHEMA_VERSION };
