import { UNIT_TABLES } from '../utils/unit-standards.js';
import { preflightUnits } from './unit-backup.js';
import { groupUnitRestoreRows } from './unit-restore-payload.js';
/**
 * @file Backup import — CP-56.
 * Implements V2_MIGRATION_PLAN.md §5.7 steps 1–10.
 * Reads a JSON backup file, validates, migrates forward if needed,
 * wholesale-replaces operation data in FK-dependency order per §5.3a.
 */

import { SERVER_ASSISTANT_TABLES } from '../features/assistant/schema.js';
import { supabase } from './supabase-client.js';
import { canExport, exportOperationBackup, downloadBackup } from './backup-export.js';
import { BACKUP_MIGRATIONS } from './backup-migrations.js';
import { pullAllRemote } from './pull-remote.js';
import { RELEASED_SCHEMA_VERSION, STAGED_COLUMNS } from './schema-release.js';
import { logger } from '../utils/logger.js';

const SUPPORTED_FORMAT_VERSION = 1;
const CURRENT_SCHEMA_VERSION = RELEASED_SCHEMA_VERSION;

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
  'batch_location_balances',
  'batch_moves',
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
  // Artifact metadata only: audio bytes have no backup/storage contract.
  'assistant_session_locks',
  'assistant_billing_policies',
  'assistant_billing_reservations',
  'assistant_billing_usage',
  'assistant_billing_settlements',
  'assistant_conversations',
  'assistant_transcript_turns',
  'voice_entry_attempts',
  'assistant_proposals',
  'assistant_proposal_revisions',
  'assistant_field_mappings',
  'assistant_review_cards',
  'assistant_review_confirmations',
  'submissions',
  'submission_field_states',
  'submission_repro_steps',
  'assistant_session_checkpoints',
  'assistant_execution_results',
  'assistant_testing_consents',
  'assistant_testing_audio',
  'assistant_restore_fences', // server-only metadata; no operations FK
  'offline_voice_notes',
];

export const BROWSER_FK_ORDER = FK_ORDER.filter(table => !SERVER_ASSISTANT_TABLES.has(table));

const TWO_PASS_TABLES = {
  animals: ['dam_id', 'sire_animal_id'],
  events: ['source_event_id'],
  assistant_transcript_turns: ['corrects_turn_id'],
  voice_entry_attempts: ['previous_attempt_id'],
  assistant_proposal_revisions: ['superseded_by_id'],
  assistant_field_mappings: ['correction_predecessor_id'],
};

const REFERENCE_TABLES = new Set();

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
  if ((backup.tables.operations || []).some(row => row.schema_version > CURRENT_SCHEMA_VERSION)) {
    return { valid: false, error: 'Operation schema version exceeds this compatible release.' };
  }
  if (CURRENT_SCHEMA_VERSION < 43 && ['event_feed_entries', 'event_feed_check_items'].some(table => (backup.tables[table] || []).some(row => !row.batch_id))) {
    return { valid: false, error: 'Batchless feed rows need verified schema 43 compatibility.' };
  }
  for (const [version, tables] of Object.entries(STAGED_COLUMNS)) {
    if (Number(version) <= CURRENT_SCHEMA_VERSION) continue;
    for (const [table, columns] of Object.entries(tables)) {
      if ((backup.tables[table] || []).some(row => columns.some(column => Object.hasOwn(row, column)))) {
        return { valid: false, error: `Backup contains unreleased schema ${version} columns. Update only after verified compatibility.` };
      }
    }
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
  if (REFERENCE_TABLES.has(table) || UNIT_TABLES.includes(table)) return;
  if (table === 'operations') return;
  if (table === 'operation_members') return;

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('operation_id', operationId);
  if (error) throw new Error(`Delete failed on ${table}: ${error.message}`);
}

/** Exact RAISE messages from 041 (and from assistant_assert_restore_unfenced,
 * which 041 PERFORMs). "discarded" is success data only — never an error match.
 * Generic SQLSTATE 42501 / P0001 are not unique, so they are not accepted alone. */
const MIGRATION_041_RAISE_MESSAGES = Object.freeze([
  'discard-empty-args-required',
  'discard-empty-auth-required',
  'discard-empty-membership-required',
  'discard-empty-refused-turns-exist',
  'assistant-restore-in-progress',
  'restore-read-committed-required',
]);

function isExact041Raise(value) {
  return MIGRATION_041_RAISE_MESSAGES.includes(String(value ?? ''));
}

function isMigration041Outcome(data, error) {
  // Success payload only when the RPC returns without an error object.
  if (!error && data === 'discarded') return true;
  if (!error) return false;
  // Only an exact error.message match counts — never error.code.
  return isExact041Raise(error.message);
}

/** True when SQL migration 041 (`assistant_discard_empty_start`) is present.
 * Only the RPC's own known outcomes count as installed. Missing function
 * (PGRST202) and any other auth, permission, gateway, or server error
 * fail closed (treat as not confirmed). Safe: membership/auth fail before DELETE. */
export async function serverHasMigration041(client = supabase) {
  if (!client?.rpc) return false;
  try {
    const { data, error } = await client.rpc('assistant_discard_empty_start', {
      p_operation: '00000000-0000-4000-8000-000000000000',
      p_conversation: '00000000-0000-4000-8000-000000000000',
    });
    return isMigration041Outcome(data, error);
  } catch {
    return false;
  }
}

/** Read-only zero-row proof for each compatible schema and its prerequisites.
 * Stamps and the 041 RPC alone never prove the 042–044 column shapes. */
export async function serverHasStagedColumns(version, client = supabase) {
  if (!STAGED_COLUMNS[version] || !client?.from) return false;
  try {
    for (const [step, tables] of Object.entries(STAGED_COLUMNS)) {
      if (Number(step) > version) continue;
      for (const [table, columns] of Object.entries(tables)) {
        const { data, error } = await client.from(table).select(columns.join(',')).limit(0);
        if (error || !Array.isArray(data)) return false;
      }
    }
    return true;
  } catch { return false; }
}

/** Stamp operations.schema_version at most 40 until the server confirms 041. */
export async function resolveOperationsSchemaStamp(requested, client = supabase) {
  if (requested > CURRENT_SCHEMA_VERSION) throw new Error('Unverified schema version: restore refused.');
  if (requested == null || requested < 41) return requested;
  if (requested >= 42) {
    if (!(await serverHasStagedColumns(requested, client)) || !(await serverHasMigration041(client))) throw new Error('Database columns are not verified for this restore version.');
    return requested;
  }
  return (await serverHasMigration041(client)) ? requested : 40;
}

async function insertTableRows(table, rows, operationId) {
  if (!rows || rows.length === 0) return;
  if (table === 'operation_members') return;

  if (table === 'operations') {
    const op = rows[0];
    if (op) {
      const schemaVersion = await resolveOperationsSchemaStamp(op.schema_version);
      const { error } = await supabase
        .from('operations')
        .update({
          name: op.name,
          timezone: op.timezone,
          currency: op.currency,
          unit_system: op.unit_system,
          schema_version: schemaVersion,
          updated_at: op.updated_at,
        })
        .eq('id', operationId);
      if (error) throw new Error(`Update failed on operations: ${error.message}`);
    }
    return;
  }

  if (UNIT_TABLES.includes(table) && CURRENT_SCHEMA_VERSION < 44) return;
  const isReference = REFERENCE_TABLES.has(table) || UNIT_TABLES.includes(table);
  const twoPassCols = TWO_PASS_TABLES[table];

  const insertRows = twoPassCols
    ? rows.map(r => {
        const copy = { ...r };
        for (const col of twoPassCols) copy[col] = null;
        return copy;
      })
    : rows;

  // missing=default alone still overwrites omissions on heterogeneous conflicts.
  // Partition validated unit payloads BEFORE batching; other tables are unchanged.
  const groups = UNIT_TABLES.includes(table) ? groupUnitRestoreRows(insertRows) : [insertRows];
  for (const group of groups) {
    for (let i = 0; i < group.length; i += INSERT_BATCH_SIZE) {
      const batch = group.slice(i, i + INSERT_BATCH_SIZE);

      if (isReference) {
        const { error } = await supabase
          .from(table)
          .upsert(batch, { onConflict: 'id', ...(UNIT_TABLES.includes(table) ? { defaultToNull: false } : {}) });
        if (error) throw new Error(`Upsert failed on ${table} (batch ${i}): ${error.message}`);
      } else {
        const { error } = await supabase
          .from(table)
          .insert(batch);
        if (error) throw new Error(`Insert failed on ${table} (batch ${i}): ${error.message}`);
      }
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

  for (const table of BROWSER_FK_ORDER) {
    if (UNIT_TABLES.includes(table) && CURRENT_SCHEMA_VERSION < 44) continue;
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

    if (REFERENCE_TABLES.has(table) || UNIT_TABLES.includes(table)) {
      if (count < expected) {
        mismatches.push({ table, expected, actual: count });
      }
    } else if (count !== expected) {
      mismatches.push({ table, expected, actual: count });
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}

/** SQL owns authority visibility and race-safe admission. No direct table reads. */
export async function preflightAssistantRestore(backup,operationId,client = supabase) {
  // The fence protects exactly this operation, never cross-operation writes
  // smuggled through a file. Global reference tables remain unscoped.
  if (backup.operation_id && backup.operation_id !== operationId) return { success: false,error: 'Restore refused: backup operation does not match the target operation.' };
  for (const table of BROWSER_FK_ORDER) {
    if (REFERENCE_TABLES.has(table)) continue;
    const rows = backup.tables?.[table];
    if (rows != null && (!Array.isArray(rows) || rows.some(row => !row || (table === 'operations' ? row.id !== operationId : row.operation_id != null && row.operation_id !== operationId)))) return { success: false,error: 'Restore refused: client rows do not match the fenced operation.' };
  }
  if ((backup.tables?.offline_voice_notes || []).some(row => row.confirmed_execution_result_id != null)) return { success: false,error: 'Restore refused: offline voice notes reference retained server execution results.' };
  try {
    const { data,error } = await client.rpc('assistant_restore_prepare',{ p_operation: operationId });
    const prepared = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!error && prepared?.outcome === 'prepared' && typeof prepared.fence_token === 'string' && prepared.fence_token.trim()) return { success: true,fenceToken: prepared.fence_token };
    const reason = !error && prepared?.outcome === 'retained-authority' ? 'retained backend authority exists'
      : !error && prepared?.outcome === 'restore-in-progress' ? 'another restore is in progress'
        : 'authoritative assistant state cannot be verified';
    return { success: false,error: `Restore refused: ${reason}.` };
  } catch { return { success: false,error: 'Restore refused: authoritative assistant preflight unavailable.' }; }
}
async function releaseRestoreFence(operationId,token,action) {
  try {
    const { data,error } = await supabase.rpc(`assistant_restore_${action}`,{ p_operation: operationId,p_fence_token: token });
    return !error && Array.isArray(data) && data.length === 1 && data[0].outcome === (action === 'finish' ? 'finished' : 'aborted');
  } catch { return false; }
}
function checkRestoreCancelled(options) { if (options.signal?.aborted) throw new Error('Restore cancelled.'); }

export async function importOperationBackup(backup, operationId, onProgress, options = {}) {
  const progress = (phase, detail, pct) => {
    if (onProgress) onProgress(phase, detail, pct);
  };

  progress('Validating', '', 5);
  const validation = validateBackup(backup);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // This runs before auto-backup, fencing and any delete/insert. It also covers
  // old backups which the compatible release would migrate to its new shape.
  if (CURRENT_SCHEMA_VERSION >= 42 && !(await serverHasStagedColumns(CURRENT_SCHEMA_VERSION))) {
    return { success: false, error: 'Database columns are not verified for this restore version.' };
  }
  // Work on a copy: failed classification/validation never changes the caller's file.
  backup = globalThis.structuredClone(backup);
  if (backup.schema_version < CURRENT_SCHEMA_VERSION) {
    const migrated = migrateBackupForward(backup);
    if (migrated.error) return { success: false, error: migrated.error };
  }
  const scopeRows = Object.values(backup.tables).flat().filter(row => row && typeof row === 'object');
  if (scopeRows.some(row => row.operation_id != null && row.operation_id !== operationId)) return { success: false, error: 'Restore refused: custom rows belong to another operation.' };
  try {
    const units = await preflightUnits(backup, operationId, supabase, CURRENT_SCHEMA_VERSION);
    if (!units.success) return units;
  } catch { return { success: false, error: 'Unit restore validation unavailable. Nothing was changed.' }; }
  const exportCheck = canExport();
  if (!exportCheck.ok) {
    return { success: false, error: 'Sync pending — retry when sync completes.' };
  }

  if (options.signal?.aborted) return { success: false,error: 'Restore cancelled.' };
  const authority = await preflightAssistantRestore(backup,operationId);
  if (!authority.success) return authority;

  let result,finished = false;
  try {
    result = await restoreBrowserTables(backup,operationId,progress,options,validation);
    if (result.success) {
      finished = await releaseRestoreFence(operationId,authority.fenceToken,'finish');
      if (!finished) result = { ...result,success: false,error: 'Restore completed but fence finish could not be verified.' };
    }
  } catch (error) { result = { success: false,error: error.message || 'Restore halted.' }; }
  finally {
    if (!finished && !await releaseRestoreFence(operationId,authority.fenceToken,'abort')) {
      // A network/auth failure cannot be treated as proof of release. Keep the
      // operation protected; never print its token or invent stale-fence expiry.
      result = { ...result,success: false,fenceReleaseFailed: true,error: `${result?.error || 'Restore halted.'} Restore fence abort could not be verified; the operation may remain fenced.` };
    }
  }
  return result;
}

async function restoreBrowserTables(backup,operationId,progress,options,validation) {
  let autoBackupFileName;
  checkRestoreCancelled(options);
  if (options.skipAutoBackup) {
    logger.info('backup', 'auto-backup skipped (empty operation)', { operation_id: operationId });
  } else {
    progress('Saving current data (auto-backup)', '', 10);
    try {
      checkRestoreCancelled(options);
      const { json, fileName } = await exportOperationBackup(operationId);
      autoBackupFileName = fileName.replace('gtho-v2-backup__', 'gtho-v2-auto-backup-before-restore__');
      downloadBackup(json, autoBackupFileName);
    } catch (err) {
      logger.error('backup', 'auto-backup failed, halting import', { error: err.message });
      return { success: false, error: `Failed to save auto-backup: ${err.message}. Import halted.` };
    }
  }

  checkRestoreCancelled(options);
  // Break only nullable self-links; retained values come from the backup on restore.
  // This is wholesale restore, NOT finished-at retention cleanup.
  for (const [table, columns] of Object.entries(TWO_PASS_TABLES)) {
    checkRestoreCancelled(options);
    try {
      const changes = Object.fromEntries(columns.map(column => [column, null]));
      const { error } = await supabase.from(table).update(changes).eq('operation_id', operationId);
      if (error) throw error;
    } catch (err) {
      return { success: false, error: `Detach failed on ${table}: ${err.message}`, autoBackupFileName };
    }
  }

  const deleteOrder = [...BROWSER_FK_ORDER].reverse();
  const totalSteps = deleteOrder.length + BROWSER_FK_ORDER.length;
  let stepsDone = 0;

  for (const table of deleteOrder) {
    checkRestoreCancelled(options);
    progress('Replacing data', `Deleting ${table}`, 25 + Math.round((stepsDone / totalSteps) * 50));
    try {
      checkRestoreCancelled(options);
      await deleteTableRows(table, operationId);
    } catch (err) {
      logger.error('backup', 'import failed', { stage: 'delete', table, error: err.message });
      return { success: false, error: `Delete failed on ${table}: ${err.message}`, autoBackupFileName };
    }
    stepsDone++;
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  for (const table of BROWSER_FK_ORDER) {
    checkRestoreCancelled(options);
    const rows = backup.tables[table] || [];
    progress('Replacing data', `Inserting ${table} (${rows.length} rows)`, 25 + Math.round((stepsDone / totalSteps) * 50));
    try {
      checkRestoreCancelled(options);
      await insertTableRows(table, rows, operationId);
    } catch (err) {
      logger.error('backup', 'import failed', { stage: 'insert', table, error: err.message });
      return { success: false, error: `Insert failed on ${table}: ${err.message}`, autoBackupFileName };
    }
    stepsDone++;
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  checkRestoreCancelled(options);
  progress('Refreshing', '', 85);
  try {
    await pullAllRemote();
  } catch (err) {
    logger.error('backup', 'store re-hydrate failed after import', { error: err.message });
    return { success: false,error: 'Store refresh failed after import.',autoBackupFileName };
  }

  progress('Verifying', '', 90);
  const parityResult = await parityCheck(backup, operationId);

  const totalRows = BROWSER_FK_ORDER.reduce((sum, t) => sum + (backup.tables[t] || []).length, 0);
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

  checkRestoreCancelled(options);
  progress('Done', '', 100);

  return {
    success: parityResult.pass,
    autoBackupFileName,
    parityResult,
    error: parityResult.pass ? undefined : 'Import verification failed. Check the parity report.',
  };
}

export { FK_ORDER, REFERENCE_TABLES, TWO_PASS_TABLES, CURRENT_SCHEMA_VERSION };
