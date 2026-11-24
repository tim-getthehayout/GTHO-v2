/**
 * @file Released schema 47 — farm_settings per-species preg-check thresholds are in shapes
 * and restore proofs at the real compiled ceiling 48.
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

beforeEach(() => setLocale('en', en));

const COLS47 = [
  'preg_check_min_days_since_exposure_cattle',
  'preg_check_min_days_post_calving_cattle',
  'preg_check_min_days_since_exposure_sheep',
  'preg_check_min_days_post_calving_sheep',
  'preg_check_min_days_since_exposure_goat',
  'preg_check_min_days_post_calving_goat',
];

describe('preg-check thresholds released at schema 47', () => {
  it('keeps ceiling 48 with held cleared and staged 47 proof kept', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(48);
    expect(CURRENT_SCHEMA_VERSION).toBe(48);
    expect(HELD_SCHEMA_VERSIONS).toEqual([49]);
    expect(STAGED_COLUMNS[47]).toEqual({ farm_settings: COLS47 });
  });

  it('releasedColumns(47) includes nulls and supplied values', () => {
    const nulls = Object.fromEntries(COLS47.map(c => [c, null]));
    expect(releasedColumns(47, nulls)).toEqual(nulls);
    expect(releasedColumns(47, {
      ...nulls,
      preg_check_min_days_since_exposure_cattle: 35,
    })).toMatchObject({ preg_check_min_days_since_exposure_cattle: 35 });
  });

  it('farm-setting toSupabaseShape includes preg-check cols', () => {
    const base = FarmSetting.create({ farmId: 'f', operationId: 'op' });
    const sb = FarmSetting.toSupabaseShape(base);
    for (const c of COLS47) expect(sb).toHaveProperty(c, null);
    expect(FarmSetting.toSupabaseShape({
      ...base, pregCheckMinDaysSinceExposureCattle: 35, pregCheckMinDaysPostCalvingCattle: 45,
    })).toMatchObject({
      preg_check_min_days_since_exposure_cattle: 35,
      preg_check_min_days_post_calving_cattle: 45,
    });
  });

  it('backup 46→47 sets missing per-species defaults and stamps 47', () => {
    const backup = {
      schema_version: 46,
      tables: {
        operations: [{ id: 'op', schema_version: 46 }],
        farm_settings: [
          { id: 'fs1' },
          {
            id: 'fs2',
            preg_check_min_days_since_exposure_cattle: 28,
            preg_check_min_days_post_calving_cattle: 40,
          },
        ],
      },
    };
    const out = BACKUP_MIGRATIONS[46](structuredClone(backup));
    expect(out.schema_version).toBe(47);
    expect(out.tables.operations[0].schema_version).toBe(47);
    expect(out.tables.farm_settings[0].preg_check_min_days_since_exposure_cattle).toBe(35);
    expect(out.tables.farm_settings[0].preg_check_min_days_post_calving_cattle).toBe(45);
    expect(out.tables.farm_settings[0].preg_check_min_days_since_exposure_sheep).toBe(25);
    expect(out.tables.farm_settings[0].preg_check_min_days_post_calving_sheep).toBe(30);
    expect(out.tables.farm_settings[0].preg_check_min_days_since_exposure_goat).toBe(25);
    expect(out.tables.farm_settings[0].preg_check_min_days_post_calving_goat).toBe(30);
    expect(out.tables.farm_settings[1].preg_check_min_days_since_exposure_cattle).toBe(28);
    expect(out.tables.farm_settings[1].preg_check_min_days_post_calving_cattle).toBe(40);
    expect(out.tables.farm_settings[1].preg_check_min_days_since_exposure_sheep).toBe(25);
  });
});
