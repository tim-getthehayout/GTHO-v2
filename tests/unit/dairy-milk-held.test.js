/**
 * #449 dairy milk at a mocked ceiling 50 (051 held; the pre-release state and
 * any client still below 51). Released at the real ceiling 51 — see
 * dairy-milk-released.test.js. Nothing is written,
 * pulled, exported or restored for the dairy tables/columns and every dairy
 * surface is hidden (acceptance 3, 4, 6, 10, 11 — ceiling < 51 side).
 */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 50, HELD_SCHEMA_VERSIONS: [51] }));
const db = vi.hoisted(() => ({ rows: {}, calls: [], proofs: [], missingTables: [] }));
vi.mock('../../src/data/supabase-client.js', async () => {
  const { makeBackupClient } = await import('./historical-backup-double.js');
  return { supabase: makeBackupClient(db) };
});
vi.mock('../../src/features/auth/session.js', () => ({ getUser: () => ({ id: 'user', email: 'test@example.test' }) }));
import { readFileSync } from 'node:fs';
import { CustomSync } from '../../src/data/custom-sync.js';
import { _reset, setSyncAdapter, mergeRemote, add, getAll, getById } from '../../src/data/store.js';
import {
  RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS, STAGED_TABLES, DAIRY_SCHEMA_VERSION, isTableReleased,
} from '../../src/data/schema-release.js';
import { BACKUP_TABLES, exportOperationBackup } from '../../src/data/backup-export.js';
import { FK_ORDER, CURRENT_SCHEMA_VERSION, importOperationBackup, validateBackup } from '../../src/data/backup-import.js';
import { localSupabaseRow } from '../../src/data/push-all.js';
import { pullAllRemote } from '../../src/data/pull-remote.js';
import * as MilkPickup from '../../src/entities/milk-pickup.js';
import * as CalfMilk from '../../src/entities/calf-milk-feeding.js';
import * as FarmSetting from '../../src/entities/farm-setting.js';
import * as Group from '../../src/entities/group.js';
import { renderMilkScreen, isDairyVisibleNow } from '../../src/features/milk/index.js';
import { openGroupSheet } from '../../src/features/animals/index.js';
import { renderDairySettingsCard } from '../../src/features/settings/dairy-settings.js';
import { resolveFieldModuleKeys, FIELD_MODULES_DEFAULT } from '../../src/features/field-mode/index.js';

const OP = '00000000-0000-4000-8000-0000000449b1';
const FARM = '00000000-0000-4000-8000-0000000449b2';
const DAIRY_TABLES = ['milk_pickups', 'calf_milk_feedings'];

function seed() {
  mergeRemote('operations', [{ id: OP, name: 'Op', unitSystem: 'imperial' }]);
  mergeRemote('farms', [{ id: FARM, operationId: OP, name: 'Home' }]);
  mergeRemote('farmSettings', [FarmSetting.create({ id: 'fs1', farmId: FARM, operationId: OP })]);
  mergeRemote('animalClasses', [{ id: 'c1', operationId: OP, name: 'Cows', species: 'dairy_cattle', role: 'cow' }]);
  mergeRemote('animals', [{ id: 'a1', operationId: OP, classId: 'c1', sex: 'female', active: true, cullDate: null }]);
  mergeRemote('userPreferences', [{ id: 'p1', userId: 'user', activeFarmId: FARM, fieldModeQuickActions: null }]);
}

beforeEach(() => {
  localStorage.clear(); _reset();
  document.body.innerHTML = '';
  db.rows = {}; db.calls = []; db.proofs = []; db.missingTables = [...DAIRY_TABLES];
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { setSyncAdapter(null); vi.restoreAllMocks(); });

it('mocked ceiling 50; 051 is held with the locked staged columns and tables', () => {
  expect(RELEASED_SCHEMA_VERSION).toBe(50);
  expect(CURRENT_SCHEMA_VERSION).toBe(50);
  expect(DAIRY_SCHEMA_VERSION).toBe(51);
  expect(HELD_SCHEMA_VERSIONS).toEqual([51]);
  expect(STAGED_TABLES[51]).toEqual(DAIRY_TABLES);
  expect(Object.keys(STAGED_COLUMNS[51]).sort()).toEqual(['calf_milk_feedings', 'farm_settings', 'groups', 'milk_pickups']);
  expect(STAGED_COLUMNS[51].farm_settings).toEqual(['dairy_mode', 'milk_kg_per_l', 'milk_grazing_offset_days', 'milk_totals_mode']);
  expect(STAGED_COLUMNS[51].groups).toEqual(['is_milking']);
  for (const table of DAIRY_TABLES) {
    expect(isTableReleased(table, 50)).toBe(false);
    expect(isTableReleased(table, 51)).toBe(true);
    expect(BACKUP_TABLES[table]).toEqual({ paginate: true });
    for (const parent of ['operations', 'farms', 'groups']) expect(FK_ORDER.indexOf(table)).toBeGreaterThan(FK_ORDER.indexOf(parent));
  }
});

it('3 · below 51 farm_settings dairy values and groups.is_milking are not written and read as defaults', () => {
  const fsRow = FarmSetting.toSupabaseShape(FarmSetting.create({ id: 'fs', farmId: FARM, operationId: OP }));
  for (const col of STAGED_COLUMNS[51].farm_settings) expect(fsRow).not.toHaveProperty(col);
  const read = FarmSetting.fromSupabaseShape({ ...fsRow, dairy_mode: 'on', milk_kg_per_l: '2', milk_grazing_offset_days: 5, milk_totals_mode: 'spread_daily' });
  expect(FarmSetting.resolveDairySettings(read)).toEqual({ dairyMode: 'auto', milkKgPerL: 1.0305073, milkGrazingOffsetDays: 1, milkTotalsMode: 'per_pickup' });
  expect(FarmSetting.resolveDairySettings(read).milkKgPerL * 8.345404).toBeCloseTo(8.6, 2);
  const gRow = Group.toSupabaseShape(Group.create({ id: 'g', operationId: OP, name: 'Herd' }));
  expect(gRow).not.toHaveProperty('is_milking');
  expect(Group.fromSupabaseShape({ ...gRow, is_milking: true }).isMilking).toBe(false);
  // A dairy value set below 51 refuses rather than writing (store rolls back).
  expect(() => FarmSetting.toSupabaseShape(FarmSetting.create({ id: 'fs', farmId: FARM, operationId: OP, dairyMode: 'on' }))).toThrow();
});

it('below 51 milk records refuse to write and the store rolls back', () => {
  seed();
  const p = MilkPickup.create({ operationId: OP, farmId: FARM, pickedUpAt: new Date().toISOString(), weightKg: 100 });
  expect(() => MilkPickup.toSupabaseShape(p)).toThrow(/unreleasedSchema|51/);
  expect(() => CalfMilk.toSupabaseShape(CalfMilk.create({ operationId: OP, farmId: FARM, volumeL: 2, kgPerLSnapshot: 1.03 }))).toThrow(/unreleasedSchema|51/);
  expect(() => add('milkPickups', p, MilkPickup.validate, MilkPickup.toSupabaseShape, 'milk_pickups')).toThrow();
  expect(getAll('milkPickups')).toEqual([]);
  mergeRemote('milkPickups', [p]);
  for (const table of DAIRY_TABLES) expect(localSupabaseRow(table, p.id)).toBeNull();
});

it('4/6/11 · below 51 every dairy surface is hidden', () => {
  seed(); // auto + an active dairy cow would show at 51
  expect(isDairyVisibleNow()).toBe(false);
  const c = document.createElement('div'); document.body.appendChild(c);
  renderMilkScreen(c);
  expect(c.querySelector('[data-testid="milk-hidden"]')).toBeTruthy();
  expect(renderDairySettingsCard(getById('farmSettings', 'fs1'))).toBeNull();
  expect(resolveFieldModuleKeys(null)).toEqual(FIELD_MODULES_DEFAULT);
  mergeRemote('groups', [{ id: 'g1', operationId: OP, name: 'Herd', color: '#000', isMilking: false, archivedAt: null }]);
  openGroupSheet(getById('groups', 'g1'), OP);
  expect(document.querySelector('[data-testid="group-sheet-milking"]')).toBeNull();
  document.querySelector('[data-testid="group-sheet-save"]').click();
  expect(getById('groups', 'g1').isMilking).toBe(false);
});

it('10 · pull never reads the held tables', async () => {
  const pulled = [];
  setSyncAdapter({ isOnline: async () => true, pullAll: async table => { pulled.push(table); return []; }, flush: async () => {}, push: () => {}, getQueuedItems: () => [], getDeadLetters: () => [] });
  await pullAllRemote();
  expect(pulled.length).toBeGreaterThan(10);
  for (const table of DAIRY_TABLES) expect(pulled).not.toContain(table);
});

it('10 · export and restore skip the held tables; a backup carrying them is refused', async () => {
  setSyncAdapter(new CustomSync());
  db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 50 }];
  const backup = JSON.parse((await exportOperationBackup(OP)).json);
  for (const table of DAIRY_TABLES) expect(backup.tables).not.toHaveProperty(table);
  expect(db.calls.some(call => DAIRY_TABLES.includes(call.table))).toBe(false);
  const result = await importOperationBackup(backup, OP, null, { skipAutoBackup: true });
  expect(result, result.error).toMatchObject({ success: true });
  expect(db.calls.some(call => DAIRY_TABLES.includes(call.table))).toBe(false);
  const envelope = tables => ({ format: 'gtho-v2-backup', format_version: 1, schema_version: 50, operation_id: OP, tables: { operations: [{ id: OP, schema_version: 50 }], ...tables } });
  const row = { id: 'x', operation_id: OP, farm_id: FARM, picked_up_at: '2026-11-09T11:00:00Z', weight_kg: 1 };
  const refused = validateBackup(envelope({ milk_pickups: [row] }));
  expect(refused.valid).toBe(false);
  expect(refused.error).toMatch(/unreleased schema 51/);
  expect(validateBackup(envelope({ groups: [{ id: 'g', operation_id: OP, name: 'Herd', is_milking: true }] })).valid).toBe(false);
  expect(validateBackup({ ...envelope({}), schema_version: 51 }).valid).toBe(false);
});

it('051 SQL: written only, both tables with the four RLS policies, columns NOT NULL with defaults, 50 → 51 stamp', () => {
  const sql = readFileSync('supabase/migrations/051_dairy_milk.sql', 'utf8');
  expect(sql).toContain('WRITTEN ONLY / NOT APPLIED');
  expect(sql).toMatch(/^BEGIN;$/m);
  expect(sql.trim().endsWith('COMMIT;')).toBe(true);
  for (const table of DAIRY_TABLES) {
    expect(sql).toContain(`CREATE TABLE public.${table} (`);
    expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    for (const action of ['select', 'insert', 'update', 'delete']) expect(sql).toMatch(new RegExp(`CREATE POLICY ${table}_${action} ON public\\.${table} FOR ${action.toUpperCase()} TO authenticated`));
  }
  expect(sql).not.toMatch(/WITH CHECK \(true\)/i);
  expect(sql).toMatch(/dairy_mode text NOT NULL DEFAULT 'auto'/);
  expect(sql).toMatch(/milk_kg_per_l numeric NOT NULL DEFAULT 1\.0305073/);
  expect(sql).toMatch(/milk_grazing_offset_days integer NOT NULL DEFAULT 1/);
  expect(sql).toMatch(/milk_totals_mode text NOT NULL DEFAULT 'per_pickup'/);
  expect(sql).toMatch(/is_milking boolean NOT NULL DEFAULT false/);
  const statements = sql.split(';').map(part => part.replace(/--.*$/gm, '').trim()).filter(Boolean);
  expect(statements.at(-2)).toMatch(/^UPDATE (public\.)?operations SET schema_version = 51 WHERE schema_version < 51$/);
});
