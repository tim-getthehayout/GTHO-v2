/** Held 045 (historical feedings + animal basis) at the real compiled ceiling 44. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ rows: {}, calls: [], proofs: [], missingTables: [] }));
vi.mock('../../src/data/supabase-client.js', async () => {
  const { makeBackupClient } = await import('./historical-backup-double.js');
  return { supabase: makeBackupClient(db) };
});
vi.mock('../../src/features/auth/session.js', () => ({ getUser: () => ({ id: 'user', email: 'test@example.test' }) }));
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CustomSync } from '../../src/data/custom-sync.js';
import { _reset, setSyncAdapter } from '../../src/data/store.js';
import { RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS, STAGED_TABLES, isTableReleased } from '../../src/data/schema-release.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { BACKUP_TABLES, exportOperationBackup } from '../../src/data/backup-export.js';
import { FK_ORDER, importOperationBackup, validateBackup } from '../../src/data/backup-import.js';
import { HISTORICAL_TABLES, historicalRows } from './historical-backup-double.js';

const OP = '00000000-0000-4000-8000-0000000000a1';
beforeEach(() => {
  localStorage.clear(); _reset();
  db.rows = {}; db.calls = []; db.proofs = []; db.missingTables = [...HISTORICAL_TABLES];
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  setSyncAdapter(new CustomSync());
});
afterEach(() => { setSyncAdapter(null); vi.restoreAllMocks(); });

it('045 is held: ceiling stays 44 with the locked staged columns and tables', () => {
  expect(RELEASED_SCHEMA_VERSION).toBe(44);
  expect(HELD_SCHEMA_VERSIONS).toEqual([45]);
  expect(STAGED_COLUMNS[45]).toEqual({
    historical_feedings: ['operation_id', 'source_key', 'species', 'unit_snapshot', 'weight_per_unit_kg_snapshot', 'dm_pct_snapshot'],
    historical_animal_basis: ['operation_id', 'source_key', 'species', 'head_count', 'avg_weight_kg', 'dmi_pct_snapshot'],
  });
  expect(STAGED_TABLES[45]).toEqual(HISTORICAL_TABLES);
  for (const table of HISTORICAL_TABLES) {
    expect(isTableReleased(table)).toBe(false);
    expect(isTableReleased(table, 45)).toBe(true);
    expect(BACKUP_TABLES[table]).toEqual({ paginate: false });
  }
  expect(isTableReleased('batches')).toBe(true);
});

it('CP-56 FK order puts both tables after farms, groups, animal classes, feed types and batch moves', () => {
  for (const table of HISTORICAL_TABLES) {
    for (const parent of ['farms', 'groups', 'animal_classes', 'feed_types', 'batch_moves']) {
      expect(FK_ORDER.indexOf(table)).toBeGreaterThan(FK_ORDER.indexOf(parent));
    }
  }
});

it('backup migration 44 → 45 adds both empty tables, keeps rows already present and stamps every operation', () => {
  const old = { schema_version: 44, tables: { operations: [{ id: OP, schema_version: 44 }, { id: 'other', schema_version: 44 }] } };
  expect(BACKUP_MIGRATIONS[44](old)).toBe(old);
  expect(old.tables.historical_feedings).toEqual([]);
  expect(old.tables.historical_animal_basis).toEqual([]);
  expect(old.schema_version).toBe(45);
  expect(old.tables.operations.map(op => op.schema_version)).toEqual([45, 45]);
  const kept = historicalRows(OP);
  const withRows = { schema_version: 44, tables: { operations: [], ...structuredClone(kept) } };
  BACKUP_MIGRATIONS[44](withRows);
  expect(withRows.tables.historical_feedings).toEqual(kept.historical_feedings);
  expect(withRows.tables.historical_animal_basis).toEqual(kept.historical_animal_basis);
});

it('refuses a backup carrying 045 columns at ceiling 44', () => {
  const envelope = tables => ({ format: 'gtho-v2-backup', format_version: 1, schema_version: 44, operation_id: OP, tables: { operations: [{ id: OP, schema_version: 44 }], ...tables } });
  const rows = historicalRows(OP);
  for (const table of HISTORICAL_TABLES) {
    const result = validateBackup(envelope({ [table]: rows[table] }));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unreleased schema 45/);
  }
  expect(validateBackup(envelope({ historical_feedings: [], historical_animal_basis: [] })).valid).toBe(true);
  expect(validateBackup({ ...envelope({}), schema_version: 45 }).valid).toBe(false);
});

it('held export never reads the unapplied tables', async () => {
  db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 44 }];
  const { json } = await exportOperationBackup(OP);
  const backup = JSON.parse(json);
  for (const table of HISTORICAL_TABLES) expect(backup.tables).not.toHaveProperty(table);
  expect(db.calls.some(call => HISTORICAL_TABLES.includes(call.table))).toBe(false);
});

it('held restore never deletes, inserts, proves or counts the unapplied tables', async () => {
  db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 44 }];
  const backup = { format: 'gtho-v2-backup', format_version: 1, schema_version: 44, operation_id: OP, tables: { operations: [{ id: OP, name: 'Farm', schema_version: 44 }] } };
  const result = await importOperationBackup(backup, OP, null, { skipAutoBackup: true });
  expect(result, result.error).toMatchObject({ success: true });
  expect(db.calls.some(call => HISTORICAL_TABLES.includes(call.table))).toBe(false);
});

it('045 SQL follows the locked shape', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/045_historical_feed_basis.sql'), 'utf8');
  expect(sql.startsWith('-- WRITTEN ONLY / NOT APPLIED.')).toBe(true);
  expect(sql).toMatch(/^BEGIN;$/m);
  expect(sql.trim().endsWith('COMMIT;')).toBe(true);
  const statements = sql.split(';').map(part => part.replace(/--.*$/gm, '').trim()).filter(Boolean);
  expect(statements.at(-2)).toBe('UPDATE public.operations SET schema_version = 45 WHERE schema_version < 45');
  expect(sql).not.toMatch(/WITH CHECK \(true\)/i);
  for (const table of HISTORICAL_TABLES) {
    expect(sql).toContain(`CREATE TABLE public.${table} (`);
    expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    for (const action of ['select', 'insert', 'update', 'delete']) expect(sql).toContain(`CREATE POLICY ${table}_${action} ON public.${table} FOR ${action.toUpperCase()} TO authenticated`);
    expect(sql).toContain(`CONSTRAINT ${table}_source_key_unique UNIQUE (operation_id, source_key)`);
  }
  expect(sql.match(/ON DELETE SET NULL/g)).toHaveLength(6);
});
