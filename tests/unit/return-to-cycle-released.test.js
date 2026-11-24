/**
 * @file Released schema 48 — farm_settings return-to-cycle days are in shapes
 * and restore proofs at the real compiled ceiling 49.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import {
  RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS,
} from '../../src/data/schema-release.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { CURRENT_SCHEMA_VERSION } from '../../src/data/backup-import.js';
import * as FarmSetting from '../../src/entities/farm-setting.js';
import { releasedColumns } from '../../src/data/schema-columns.js';
import { _reset, add, getById } from '../../src/data/store.js';
import {
  areReturnToCycleSettingsReleased,
  updateFarmReturnToCycleSettings,
} from '../../src/features/settings/preg-check-settings.js';

beforeEach(() => {
  setLocale('en', en);
  _reset();
  localStorage.clear();
});

const COLS48 = [
  'return_to_cycle_days_cattle',
  'return_to_cycle_days_sheep',
  'return_to_cycle_days_goat',
];

describe('return-to-cycle released at schema 49', () => {
  it('keeps ceiling 49 with held cleared and staged 48 proof kept', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(49);
    expect(CURRENT_SCHEMA_VERSION).toBe(49);
    expect(HELD_SCHEMA_VERSIONS).toEqual([54]); // OI-0251 054 held
    expect(STAGED_COLUMNS[48]).toEqual({ farm_settings: COLS48 });
    expect(areReturnToCycleSettingsReleased()).toBe(true);
    expect(areReturnToCycleSettingsReleased(47)).toBe(false);
    expect(areReturnToCycleSettingsReleased(48)).toBe(true);
  });

  it('releasedColumns(48) includes nulls and supplied values', () => {
    const nulls = Object.fromEntries(COLS48.map(c => [c, null]));
    expect(releasedColumns(48, nulls)).toEqual(nulls);
    expect(releasedColumns(48, {
      ...nulls,
      return_to_cycle_days_cattle: 45,
    })).toMatchObject({ return_to_cycle_days_cattle: 45 });
  });

  it('farm-setting toSupabaseShape includes return-to-cycle cols', () => {
    const base = FarmSetting.create({ farmId: 'f', operationId: 'op' });
    const sb = FarmSetting.toSupabaseShape(base);
    for (const c of COLS48) expect(sb).toHaveProperty(c, null);
    expect(FarmSetting.toSupabaseShape({
      ...base, returnToCycleDaysCattle: 45, returnToCycleDaysSheep: 25, returnToCycleDaysGoat: 25,
    })).toMatchObject({
      return_to_cycle_days_cattle: 45,
      return_to_cycle_days_sheep: 25,
      return_to_cycle_days_goat: 25,
    });
  });

  it('backup 47→48 sets missing return-to-cycle defaults and stamps 48', () => {
    const backup = {
      schema_version: 47,
      tables: {
        operations: [{ id: 'op', schema_version: 47 }],
        farm_settings: [
          { id: 'fs1' },
          { id: 'fs2', return_to_cycle_days_cattle: 60 },
        ],
      },
    };
    const out = BACKUP_MIGRATIONS[47](structuredClone(backup));
    expect(out.schema_version).toBe(48);
    expect(out.tables.operations[0].schema_version).toBe(48);
    expect(out.tables.farm_settings[0].return_to_cycle_days_cattle).toBe(45);
    expect(out.tables.farm_settings[0].return_to_cycle_days_sheep).toBe(25);
    expect(out.tables.farm_settings[0].return_to_cycle_days_goat).toBe(25);
    expect(out.tables.farm_settings[1].return_to_cycle_days_cattle).toBe(60);
    expect(out.tables.farm_settings[1].return_to_cycle_days_sheep).toBe(25);
  });

  it('updateFarmReturnToCycleSettings succeeds on the real ceiling', () => {
    const row = FarmSetting.create({ farmId: 'f', operationId: 'op' });
    add('farmSettings', row, FarmSetting.validate, FarmSetting.toSupabaseShape, 'farm_settings');
    const good = {
      returnToCycleDaysCattle: 45,
      returnToCycleDaysSheep: 25,
      returnToCycleDaysGoat: 25,
    };
    const updated = updateFarmReturnToCycleSettings(row.id, good);
    expect(updated).toMatchObject(good);
    expect(getById('farmSettings', row.id)).toMatchObject(good);
  });
});
