/**
 * @file Backup export — CP-55.
 * Exports an operation-scoped JSON backup per V2_MIGRATION_PLAN.md §5.
 * Reads from Supabase (§5.6.3), not local store.
 */

import { supabase } from './supabase-client.js';
import { getSyncAdapter } from './store.js';
import { REFERENCE_TABLES } from './backup-import.js';
import { logger } from '../utils/logger.js';

/**
 * Tables included in the backup per §5.3.
 * Key = Supabase table name. Value = { paginate: boolean } for large tables.
 * Excludes: operation_members, app_logs, release_notes (§5.4).
 */
export const BACKUP_TABLES = {
  // D1
  operations:                { paginate: false },
  farms:                     { paginate: false },
  farm_settings:             { paginate: false },
  user_preferences:          { paginate: false },
  // D2
  locations:                 { paginate: false },
  forage_types:              { paginate: false },
  // D3
  animal_classes:            { paginate: false },
  animals:                   { paginate: false },
  groups:                    { paginate: false },
  animal_group_memberships:  { paginate: false },
  // D4
  feed_types:                { paginate: false },
  batches:                   { paginate: false },
  batch_adjustments:         { paginate: false },
  // D5
  events:                    { paginate: true },
  event_paddock_windows:     { paginate: true },
  event_observations:        { paginate: true },
  event_group_windows:       { paginate: true },
  event_feed_entries:        { paginate: true },
  event_feed_checks:         { paginate: true },
  event_feed_check_items:    { paginate: true },
  // D6
  surveys:                   { paginate: false },
  survey_draft_entries:      { paginate: false },
  paddock_observations:      { paginate: true },
  // D7
  harvest_events:            { paginate: false },
  harvest_event_fields:      { paginate: false },
  // D8
  input_product_categories:  { paginate: false },
  input_product_units:       { paginate: false },
  input_products:            { paginate: false },
  spreaders:                 { paginate: false },
  soil_tests:                { paginate: false },
  amendments:                { paginate: false },
  amendment_locations:        { paginate: false },
  manure_batches:            { paginate: false },
  manure_batch_transactions: { paginate: false },
  npk_price_history:         { paginate: false },
  // D9
  ai_bulls:                  { paginate: false },
  treatment_categories:      { paginate: false },
  treatment_types:           { paginate: false },
  dose_units:                { paginate: false },
  animal_bcs_scores:         { paginate: true },
  animal_treatments:         { paginate: true },
  animal_breeding_records:   { paginate: false },
  animal_heat_records:       { paginate: true },
  animal_calving_records:    { paginate: false },
  animal_weight_records:     { paginate: true },
  animal_notes:              { paginate: false },
  // D10
  batch_nutritional_profiles: { paginate: false },
  // D11
  submissions:               { paginate: false },
  todos:                     { paginate: false },
  todo_assignments:          { paginate: false },
};

const PAGE_SIZE = 1000;

/**
 * Check if the app is ready to export (online + no pending sync).
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canExport() {
  const adapter = getSyncAdapter();
  if (!adapter) return { ok: false, reason: 'no_adapter' };

  let status;
  try {
    status = adapter.getStatus();
  } catch {
    status = 'offline';
  }

  if (status === 'offline') return { ok: false, reason: 'offline' };
  if (status === 'syncing') return { ok: false, reason: 'syncing' };
  if (status === 'error') return { ok: false, reason: 'sync_error' };

  return { ok: true };
}

/**
 * Fetch all rows for a table scoped to an operation.
 * Uses pagination for large tables per §5.6.3.
 * @param {string} table
 * @param {string} operationId
 * @param {boolean} paginate
 * @returns {Promise<Array<object>>}
 */
async function fetchTable(table, operationId, paginate) {
  if (!supabase) throw new Error('Supabase client not configured');

  // Global reference tables (dose_units, input_product_units): no operation_id column
  const isGlobal = REFERENCE_TABLES.has(table);
  const filterCol = table === 'operations' ? 'id' : 'operation_id';

  if (!paginate) {
    let query = supabase.from(table).select('*');
    if (!isGlobal) query = query.eq(filterCol, operationId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    return data || [];
  }

  // Paginated fetch
  const allRows = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(table).select('*');
    if (!isGlobal) query = query.eq(filterCol, operationId);
    query = query.range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch ${table} (offset ${offset}): ${error.message}`);
    allRows.push(...(data || []));
    hasMore = (data || []).length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Generate the operation slug for the file name per §5.2.
 * Kebab-case, ASCII-only, truncated to 48 chars.
 * @param {string} name
 * @returns {string}
 */
function operationSlug(name) {
  return (name || 'unnamed')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/**
 * Get the build stamp from the page meta tag.
 * @returns {string}
 */
function getBuildStamp() {
  const meta = document.querySelector('meta[name="app-version"]');
  return meta ? meta.getAttribute('content') : 'dev';
}

/**
 * Export an operation's data as a JSON backup.
 * @param {string} operationId
 * @param {Function} [onProgress] - Called with (tableName, pctComplete) during export
 * @returns {Promise<{ json: string, fileName: string, rowCount: number }>}
 */
export async function exportOperationBackup(operationId, onProgress) {
  if (!supabase) throw new Error('Supabase client not configured');

  const tableNames = Object.keys(BACKUP_TABLES);
  const tables = {};
  let totalRows = 0;

  for (let i = 0; i < tableNames.length; i++) {
    const tableName = tableNames[i];
    const { paginate } = BACKUP_TABLES[tableName];

    const rows = await fetchTable(tableName, operationId, paginate);
    tables[tableName] = rows;
    totalRows += rows.length;

    if (onProgress) {
      const pct = Math.round(((i + 1) / tableNames.length) * 100);
      onProgress(tableName, pct);
    }

    // Yield between tables so the main thread stays responsive (§5.6.7)
    if (i < tableNames.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Get operation record for schema_version and name
  const opRow = (tables.operations || [])[0];
  if (!opRow) throw new Error('Operation not found in export');

  const schemaVersion = opRow.schema_version ?? 14;
  const opName = opRow.name || 'unnamed';

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  const now = new Date();
  const exportedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '');

  const envelope = {
    format: 'gtho-v2-backup',
    format_version: 1,
    schema_version: schemaVersion,
    exported_at: exportedAt,
    exported_by: {
      user_id: user?.id || 'unknown',
      email: user?.email || 'unknown',
    },
    operation_id: operationId,
    build_stamp: getBuildStamp(),
    counts: {
      farms: (tables.farms || []).length,
      events: (tables.events || []).length,
      animals: (tables.animals || []).length,
      batches: (tables.batches || []).length,
      todos: (tables.todos || []).length,
    },
    tables,
  };

  const json = JSON.stringify(envelope, null, 2);
  const slug = operationSlug(opName);
  const fileName = `gtho-v2-backup__${slug}__${dateStamp}__schema-v${schemaVersion}.json`;

  logger.info('backup', 'export complete', {
    operation_id: operationId,
    row_count: totalRows,
    file_bytes: json.length,
  });

  return { json, fileName, rowCount: totalRows };
}

/**
 * Trigger a file download in the browser.
 * @param {string} json
 * @param {string} fileName
 */
export function downloadBackup(json, fileName) {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get the list of table names included in the backup.
 * Useful for tests and validation.
 * @returns {string[]}
 */
export function getBackupTableNames() {
  return Object.keys(BACKUP_TABLES);
}
