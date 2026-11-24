/** 045 released: the real compiled ceiling is 49; export and restore still round-trip both tables. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ rows: {}, calls: [], proofs: [], missingTables: [] }));
vi.mock('../../src/data/supabase-client.js', async () => {
  const { makeBackupClient } = await import('./historical-backup-double.js');
  return { supabase: makeBackupClient(db) };
});
vi.mock('../../src/features/auth/session.js', () => ({ getUser: () => ({ id: 'user', email: 'test@example.test' }) }));
import { CustomSync } from '../../src/data/custom-sync.js';
import { _reset, setSyncAdapter } from '../../src/data/store.js';
import { RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS, STAGED_TABLES, isTableReleased } from '../../src/data/schema-release.js';
import { exportOperationBackup } from '../../src/data/backup-export.js';
import { CURRENT_SCHEMA_VERSION, importOperationBackup } from '../../src/data/backup-import.js';
import { HISTORICAL_TABLES, historicalRows } from './historical-backup-double.js';

const OP = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
beforeEach(() => {
  localStorage.clear(); _reset();
  db.rows = {}; db.calls = []; db.proofs = []; db.missingTables = [];
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  setSyncAdapter(new CustomSync());
});
afterEach(() => { setSyncAdapter(null); vi.restoreAllMocks(); });

it('045–049 are released: ceiling 49; held empty; staged manifests kept as proofs', () => {
  expect(RELEASED_SCHEMA_VERSION).toBe(49);
  expect(HELD_SCHEMA_VERSIONS).toEqual([50]);
  expect(Object.keys(STAGED_COLUMNS[45])).toEqual(HISTORICAL_TABLES);
  expect(STAGED_TABLES[45]).toEqual(HISTORICAL_TABLES);
  for (const table of HISTORICAL_TABLES) expect(isTableReleased(table)).toBe(true);
});

it('released export reads both tables filtered by operation', async () => {
  expect(CURRENT_SCHEMA_VERSION).toBe(49);
  const mine = historicalRows(OP), theirs = historicalRows(OTHER);
  db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 45 }];
  for (const table of HISTORICAL_TABLES) db.rows[table] = [...mine[table], ...theirs[table].map(row => ({ ...row, id: `${row.id}-x` }))];
  const backup = JSON.parse((await exportOperationBackup(OP)).json);
  for (const table of HISTORICAL_TABLES) {
    expect(backup.tables[table]).toEqual(mine[table]);
    expect(db.calls.find(call => call.table === table).filters).toEqual([['operation_id', OP]]);
  }
});

it('round-trips both tables through export and restore at 45 and proves the 045 columns first', async () => {
  const rows = historicalRows(OP);
  db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 45 }];
  for (const table of HISTORICAL_TABLES) db.rows[table] = structuredClone(rows[table]);
  const backup = JSON.parse((await exportOperationBackup(OP)).json);
  for (const table of HISTORICAL_TABLES) db.rows[table] = [{ ...rows[table][0], id: 'stale', source_key: 'stale' }];
  const result = await importOperationBackup(backup, OP, null, { skipAutoBackup: true });
  expect(result, result.error).toMatchObject({ success: true });
  for (const table of HISTORICAL_TABLES) {
    expect(db.rows[table]).toEqual(rows[table]);
    expect(db.proofs).toContainEqual({ table, columns: STAGED_COLUMNS[45][table].join(',') });
  }
});

it('restores a 44 backup at 49 with both tables empty', async () => {
  db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 49 }];
  const backup = { format: 'gtho-v2-backup', format_version: 1, schema_version: 44, operation_id: OP, tables: { operations: [{ id: OP, name: 'Farm', schema_version: 44 }] } };
  const result = await importOperationBackup(backup, OP, null, { skipAutoBackup: true });
  expect(result, result.error).toMatchObject({ success: true });
  for (const table of HISTORICAL_TABLES) expect(db.rows[table] || []).toEqual([]);
  expect(db.rows.operations[0].schema_version).toBe(49);
});

it('refuses restore at 45 when a 045 column cannot be proven', async () => {
  db.missingTables = ['historical_animal_basis'];
  db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 45 }];
  const backup = { format: 'gtho-v2-backup', format_version: 1, schema_version: 45, operation_id: OP, tables: { operations: [{ id: OP, schema_version: 45 }] } };
  const result = await importOperationBackup(backup, OP, null, { skipAutoBackup: true });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/columns|verified/i);
  expect(db.calls.every(call => call.operation === 'select')).toBe(true);
});
