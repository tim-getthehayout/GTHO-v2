/**
 * @file #488 — schema-backed guard: no entity push payload may send null for a
 * NOT NULL column. Postgres applies a column DEFAULT only when the key is
 * omitted; an explicit null fails NOT NULL (23502). FarmSetting sent null for the
 * 13 NOT NULL DEFAULT columns from 047–049, so every new operation lost its
 * farm_settings row and Settings showed "Something went wrong".
 *
 * NOT NULL / DEFAULT come from replaying supabase/migrations/*.sql (001→latest,
 * static parse — not a live migration). Every client-pushed entity in
 * SYNC_REGISTRY is checked (server-only assistant tables are excluded there and
 * never pushed by the client; 045 historical tables are pull-only).
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadMigrationNotNull } from './migration-not-null.js';
import { SYNC_REGISTRY } from '../../../src/data/sync-registry.js';
import { SERVER_ASSISTANT_TABLES } from '../../../src/features/assistant/schema.js';
import * as FarmSetting from '../../../src/entities/farm-setting.js';
import * as Operation from '../../../src/entities/operation.js';
import { DEFAULT_PREG_CHECK_BY_FAMILY, DEFAULT_RETURN_TO_CYCLE_BY_FAMILY } from '../../../src/calcs/bull-exposure.js';
import { FARM_SEASON_FALLBACK } from '../../../src/calcs/farm-season.js';
import { isTableReleased } from '../../../src/data/schema-release.js';

const root = resolve(import.meta.dirname, '../../..');
const { files, tables } = loadMigrationNotNull(root);
const modules = import.meta.glob('../../../src/entities/*.js', { eager: true });
const OP = '00000000-0000-4000-8000-000000000488';
const FARM = '00000000-0000-4000-8000-000000000489';

/** table → entity module, matched by the registry's own fromSupabaseShape. */
const ENTITIES = Object.entries(SYNC_REGISTRY).map(([entityType, { table, from }]) => ({
  entityType, table, mod: Object.values(modules).find(m => m.fromSupabaseShape === from),
}));
const PUSHED = ENTITIES.filter(e => e.mod?.create && e.mod?.toSupabaseShape);
const PULL_ONLY = ENTITIES.filter(e => !e.mod?.toSupabaseShape).map(e => e.table).sort();

const FARM_SETTINGS_047_049 = [
  'preg_check_min_days_since_exposure_cattle', 'preg_check_min_days_post_calving_cattle',
  'preg_check_min_days_since_exposure_sheep', 'preg_check_min_days_post_calving_sheep',
  'preg_check_min_days_since_exposure_goat', 'preg_check_min_days_post_calving_goat',
  'return_to_cycle_days_cattle', 'return_to_cycle_days_sheep', 'return_to_cycle_days_goat',
  'season_start_month', 'season_start_day', 'season_end_month', 'season_end_day',
];

const DUMMY = {
  uuid: () => crypto.randomUUID(), text: () => 'x', 'text[]': () => ['x'], json: () => ({}), jsonb: () => ({}),
  numeric: () => 1, integer: () => 1, smallint: () => 1, boolean: () => true,
  date: () => '2026-11-27', timestamptz: () => '2026-11-27T12:00:00.000Z',
};
/** Caller-supplied values for every NOT NULL column without a DEFAULT (FKs, dates, required text). */
function requiredInput(mod, table) {
  const notNull = tables[table];
  return Object.fromEntries(Object.entries(mod.FIELDS)
    .filter(([, f]) => notNull[f.sbColumn] && !notNull[f.sbColumn].hasDefault)
    .map(([key, f]) => [key, DUMMY[f.type]()]));
}
const nullNotNull = (payload, table) => Object.keys(tables[table]).filter(c => c in payload && payload[c] == null);
const omittedWithoutDefault = (payload, table) => Object.entries(tables[table]).filter(([c, i]) => !(c in payload) && !i.hasDefault).map(([c]) => c);

describe('#488 migration NOT NULL parse', () => {
  it('replays 001 through 052 and sees the 047–049 farm_settings columns as NOT NULL DEFAULT', () => {
    expect(files[0]).toMatch(/^001_/);
    expect(files.at(-1)).toMatch(/^052_/);
    for (const c of FARM_SETTINGS_047_049) expect(tables.farm_settings[c]).toMatchObject({ hasDefault: true });
    expect(Object.keys(tables.farm_settings).filter(c => !tables.farm_settings[c].hasDefault).sort()).toEqual(['farm_id', 'operation_id']);
  });

  it('audits every client-pushed entity in SYNC_REGISTRY against a migrated table', () => {
    expect(PUSHED.length).toBeGreaterThanOrEqual(60);
    for (const { table } of PUSHED) expect(tables[table], table).toBeTruthy();
    expect(PULL_ONLY).toEqual(['historical_animal_basis', 'historical_feedings']);
    for (const { table } of ENTITIES) expect(SERVER_ASSISTANT_TABLES.has(table), table).toBe(false);
  });
});

describe('#488 toSupabaseShape(create(...)) never sends null for a NOT NULL column', () => {
  for (const { entityType, table, mod } of PUSHED) {
    it(`${entityType} (${table})`, () => {
      // #436: 052 is written and held; toSupabaseShape must refuse until the ceiling is 52.
      if (!isTableReleased(table)) {
        expect(() => mod.toSupabaseShape(mod.create(requiredInput(mod, table)))).toThrow();
        return;
      }
      // Default-constructed (onboarding/seed shape): no NOT NULL DEFAULT column may be null.
      const bare = mod.toSupabaseShape(mod.create({}));
      const defaulted = Object.keys(tables[table]).filter(c => tables[table][c].hasDefault && c in bare && bare[c] == null);
      expect(defaulted, `${table} NOT NULL DEFAULT columns sent as null`).toEqual([]);
      // With the caller-supplied required values: no NOT NULL column null, none silently missing.
      const full = mod.toSupabaseShape(mod.create(requiredInput(mod, table)));
      expect(nullNotNull(full, table), `${table} NOT NULL columns sent as null`).toEqual([]);
      expect(omittedWithoutDefault(full, table), `${table} NOT NULL columns without DEFAULT omitted`).toEqual([]);
    });
  }

  it('operations onboarding shape sends no null NOT NULL column', () => {
    const shape = Operation.toOnboardingSupabaseShape(Operation.create({ name: 'Op' }));
    expect(nullNotNull(shape, 'operations')).toEqual([]);
  });
});

describe('#488 FarmSetting onboarding payload', () => {
  const onboarding = () => FarmSetting.create({ farmId: FARM, operationId: OP, includeArchivedLocationsInMetrics: true });
  const literal = expr => (expr === 'true' ? true : expr === 'false' ? false : /^'.*'$/.test(expr) ? expr.slice(1, -1) : Number(expr));

  it('sends every NOT NULL column, each defaulted one at its migration DEFAULT', () => {
    const payload = FarmSetting.toSupabaseShape(onboarding());
    expect(nullNotNull(payload, 'farm_settings')).toEqual([]);
    expect(omittedWithoutDefault(payload, 'farm_settings')).toEqual([]);
    for (const [col, { defaultExpr }] of Object.entries(tables.farm_settings)) {
      if (['id', 'created_at', 'updated_at', 'farm_id', 'operation_id'].includes(col)) continue;
      expect(payload[col], col).toBe(literal(defaultExpr));
    }
  });

  it('a record with every defaulted field null or missing still sends the DB defaults (never null)', () => {
    const nulled = onboarding();
    const missing = onboarding();
    for (const key of Object.keys(FarmSetting.FARM_SETTINGS_COLUMN_DEFAULTS)) { nulled[key] = null; delete missing[key]; }
    for (const record of [nulled, missing]) {
      const payload = FarmSetting.toSupabaseShape(record);
      expect(nullNotNull(payload, 'farm_settings')).toEqual([]);
      for (const c of FARM_SETTINGS_047_049) expect(payload[c], c).toBe(literal(tables.farm_settings[c].defaultExpr));
    }
  });

  it('passes the 047–051 farm_settings CHECK constraints', () => {
    const p = FarmSetting.toSupabaseShape(onboarding());
    for (const c of FARM_SETTINGS_047_049.slice(0, 9)) expect(p[c], c).toBeGreaterThanOrEqual(0); // 047/048: >= 0
    const monthDay = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= (m === 2 ? 29 : [4, 6, 9, 11].includes(m) ? 30 : 31);
    expect(monthDay(p.season_start_month, p.season_start_day)).toBe(true); // 049 season_start_check
    expect(monthDay(p.season_end_month, p.season_end_day)).toBe(true); // 049 season_end_check
    expect(typeof p.include_archived_locations_in_metrics).toBe('boolean'); // 050
    expect(['auto', 'on', 'off']).toContain(p.dairy_mode); // 051
    expect(p.milk_kg_per_l > 0 && Number.isFinite(p.milk_kg_per_l)).toBe(true);
    expect(p.milk_grazing_offset_days >= 0 && p.milk_grazing_offset_days <= 14).toBe(true);
    expect(['per_pickup', 'spread_daily']).toContain(p.milk_totals_mode);
  });

  it('pushed defaults equal the compute-on-read fallbacks, so unset local values read the same', () => {
    const D = FarmSetting.FARM_SETTINGS_COLUMN_DEFAULTS;
    for (const [family, Family] of [['cattle', 'Cattle'], ['sheep', 'Sheep'], ['goat', 'Goat']]) {
      expect(D[`pregCheckMinDaysSinceExposure${Family}`]).toBe(DEFAULT_PREG_CHECK_BY_FAMILY[family].minDaysSinceExposure);
      expect(D[`pregCheckMinDaysPostCalving${Family}`]).toBe(DEFAULT_PREG_CHECK_BY_FAMILY[family].minDaysPostCalving);
      expect(D[`returnToCycleDays${Family}`]).toBe(DEFAULT_RETURN_TO_CYCLE_BY_FAMILY[family]);
    }
    expect({ startMonth: D.seasonStartMonth, startDay: D.seasonStartDay, endMonth: D.seasonEndMonth, endDay: D.seasonEndDay }).toEqual(FARM_SEASON_FALLBACK);
    const created = FarmSetting.create({ farmId: FARM, operationId: OP });
    for (const [key, value] of Object.entries(D)) if (created[key] != null) expect(created[key], key).toBe(value);
  });
});
