/**
 * @file #402 — farm season default at the real compiled ceiling 48 (migration
 * 049 written, held). The app must keep working before 049 is applied: the
 * season columns are absent, "Farm default…" is hidden, nothing writes them,
 * and the season falls back to the calendar year Jan 1 – Dec 31.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS } from '../../src/data/schema-release.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSetting from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import {
  FARM_SEASON_FALLBACK, resolveFarmSeason, farmSeasonWindow, validateFarmSeason, formatFarmSeason,
  isValidMonthDay, seasonWraps,
} from '../../src/calcs/farm-season.js';
import { DEFAULT_BUDGET_PERIOD } from '../../src/calcs/budget-period.js';
import {
  areFarmSeasonSettingsReleased, updateFarmSeasonSettings,
} from '../../src/features/settings/farm-season-settings.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';

beforeAll(() => setLocale('en', en));

const COLS49 = ['season_start_month', 'season_start_day', 'season_end_month', 'season_end_day'];
const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  // Pulled from prod before 049: the row has no season_* columns at all.
  const row = FarmSetting.toSupabaseShape(FarmSetting.create({ id: 'fs-1', farmId: FARM, operationId: OP }));
  add('farmSettings', FarmSetting.fromSupabaseShape(row), FarmSetting.validate, FarmSetting.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: '00000000-0000-4000-8000-0000000000c1', operationId: OP, farmId: FARM, name: 'J2', type: 'land', landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

beforeEach(() => {
  _reset();
  localStorage.clear();
  resetCalendarState();
  window.history.replaceState(null, '', '#/events');
  document.body.innerHTML = '';
});

describe('#402 season calcs', () => {
  it('fallback is the calendar year (Tim t1477s5820); the feed budget constant is untouched', () => {
    expect(FARM_SEASON_FALLBACK).toEqual({ startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 });
    expect(DEFAULT_BUDGET_PERIOD).toEqual({ startMonth: 10, startDay: 1, endMonth: 9, endDay: 30 });
  });

  it('columns absent / unset / partial / invalid → Jan 1 – Dec 31', () => {
    expect(resolveFarmSeason(null)).toEqual(FARM_SEASON_FALLBACK);
    expect(resolveFarmSeason({})).toEqual(FARM_SEASON_FALLBACK);
    expect(resolveFarmSeason({ seasonStartMonth: null, seasonStartDay: null, seasonEndMonth: null, seasonEndDay: null })).toEqual(FARM_SEASON_FALLBACK);
    expect(resolveFarmSeason({ seasonStartMonth: 3, seasonStartDay: 1 })).toEqual(FARM_SEASON_FALLBACK);
    expect(resolveFarmSeason({ seasonStartMonth: 2, seasonStartDay: 30, seasonEndMonth: 12, seasonEndDay: 31 })).toEqual(FARM_SEASON_FALLBACK);
    expect(farmSeasonWindow('2026-11-24', null)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('a wrap-around season (start after end) computes the period containing today', () => {
    const fs = { seasonStartMonth: 10, seasonStartDay: 1, seasonEndMonth: 9, seasonEndDay: 30 };
    expect(seasonWraps(resolveFarmSeason(fs))).toBe(true);
    expect(farmSeasonWindow('2026-11-24', fs)).toEqual({ start: '2026-10-01', end: '2027-09-30' });
    expect(farmSeasonWindow('2026-09-30', fs)).toEqual({ start: '2025-10-01', end: '2026-09-30' });
    expect(farmSeasonWindow('2026-10-01', fs)).toEqual({ start: '2026-10-01', end: '2027-09-30' });
    const mar = { seasonStartMonth: 3, seasonStartDay: 1, seasonEndMonth: 2, seasonEndDay: 29 };
    expect(farmSeasonWindow('2026-11-24', mar)).toEqual({ start: '2026-03-01', end: '2027-02-28' });
  });

  it('labels: one year shows "(year)"; a wrap shows both years', () => {
    expect(formatFarmSeason(FARM_SEASON_FALLBACK, '2026-11-24')).toBe('Jan 1 – Dec 31 (2026)');
    expect(formatFarmSeason({ startMonth: 10, startDay: 1, endMonth: 9, endDay: 30 }, '2026-11-24'))
      .toBe('Oct 1, 2026 – Sep 30, 2027');
  });

  it('validation: real month-days and 1–366 days (start = end rejected)', () => {
    expect(isValidMonthDay(2, 29)).toBe(true);
    expect(isValidMonthDay(4, 31)).toBe(false);
    expect(validateFarmSeason({ startMonth: '1', startDay: '1', endMonth: '12', endDay: '31' }).normalized)
      .toEqual({ seasonStartMonth: 1, seasonStartDay: 1, seasonEndMonth: 12, seasonEndDay: 31 });
    expect(validateFarmSeason({ startMonth: '4', startDay: '31', endMonth: '12', endDay: '31' }).valid).toBe(false);
    expect(validateFarmSeason({ startMonth: '5', startDay: '1', endMonth: '5', endDay: '1' }).valid).toBe(false);
    expect(validateFarmSeason({ startMonth: '5', startDay: '', endMonth: '5', endDay: '1' }).valid).toBe(false);
    expect(validateFarmSeason({ startMonth: '5', startDay: '2', endMonth: '5', endDay: '1' }).valid).toBe(true);
  });
});

describe('#402 held at ceiling 48 (049 written, not applied)', () => {
  it('49 is held with its staged farm_settings columns; editors are gated off', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(48);
    expect(HELD_SCHEMA_VERSIONS).toEqual([49]);
    expect(STAGED_COLUMNS[49]).toEqual({ farm_settings: COLS49 });
    expect(areFarmSeasonSettingsReleased()).toBe(false);
    expect(areFarmSeasonSettingsReleased(49)).toBe(true);
  });

  it('no write attempt: shapes omit the columns, a season value refuses, the update throws', () => {
    const base = FarmSetting.create({ farmId: 'f', operationId: 'op' });
    const sb = FarmSetting.toSupabaseShape(base);
    for (const c of COLS49) expect(sb).not.toHaveProperty(c);
    expect(() => FarmSetting.toSupabaseShape({ ...base, seasonStartMonth: 1 })).toThrow(/49|unreleased/i);
    expect(() => updateFarmSeasonSettings('fs-1', { startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 }))
      .toThrow(/schema 49/i);
    const pulled = FarmSetting.fromSupabaseShape(sb);
    expect(pulled.seasonStartMonth).toBeNull();
    expect(resolveFarmSeason(pulled)).toEqual(FARM_SEASON_FALLBACK);
  });

  it('Calendar opens on Jan 1 – Dec 31 of this year, hides "Farm default…", shows the device hint', () => {
    seed();
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    const year = getLocalTodayStr().slice(0, 4);
    expect(c.querySelector('[data-testid="metric-window-start"]').value).toBe(`${year}-01-01`);
    expect(c.querySelector('[data-testid="metric-window-end"]').value).toBe(`${year}-12-31`);
    expect(c.querySelector('[data-testid="metric-window-farm-default"]')).toBeNull();
    expect(c.querySelector('[data-testid="farm-season-editor"]')).toBeNull();
    expect(c.querySelector('[data-testid="metric-window-device-hint"]').textContent)
      .toBe('Custom dates apply to this device only.');
  });

  it('migration 049 file: additive columns, Jan 1 – Dec 31 defaults, range checks, stamp 49, no RLS change', () => {
    const dir = path.resolve(__dirname, '../../supabase/migrations');
    const files = fs.readdirSync(dir).filter(f => f.startsWith('049_'));
    expect(files).toEqual(['049_farm_settings_season_default.sql']);
    const sql = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS season_start_month integer NOT NULL DEFAULT 1;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS season_start_day integer NOT NULL DEFAULT 1;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS season_end_month integer NOT NULL DEFAULT 12;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS season_end_day integer NOT NULL DEFAULT 31;/);
    expect(sql).toMatch(/farm_settings_season_start_check/);
    expect(sql).toMatch(/farm_settings_season_end_check/);
    expect(sql).toMatch(/SET schema_version = 49\s+WHERE schema_version < 49/);
    expect(sql).not.toMatch(/POLICY|GRANT|ENABLE ROW LEVEL/i);
    expect(sql).not.toMatch(/return_to_cycle|preg_check_/);
  });

  it('backup 48→49 fills absent season defaults, keeps supplied values, stamps 49', () => {
    const out = BACKUP_MIGRATIONS[48](structuredClone({
      schema_version: 48,
      tables: {
        operations: [{ id: 'op', schema_version: 48 }],
        farm_settings: [{ id: 'a' }, { id: 'b', season_start_month: 10, season_start_day: 1, season_end_month: 9, season_end_day: 30 }],
      },
    }));
    expect(out.schema_version).toBe(49);
    expect(out.tables.operations[0].schema_version).toBe(49);
    expect(out.tables.farm_settings[0]).toMatchObject({ season_start_month: 1, season_start_day: 1, season_end_month: 12, season_end_day: 31 });
    expect(out.tables.farm_settings[1]).toMatchObject({ season_start_month: 10, season_start_day: 1, season_end_month: 9, season_end_day: 30 });
  });
});
