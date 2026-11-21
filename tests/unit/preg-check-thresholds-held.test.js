/**
 * @file Held-gate for schema 47 — farm_settings per-species preg-check thresholds, replayed at a
 * mocked ceiling 45 (the state before 046/047 were released). The real ceiling is 47 now; see
 * preg-check-thresholds-released.test.js.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 45, HELD_SCHEMA_VERSIONS: [46, 47] }));
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

describe('preg-check thresholds held at mocked ceiling 45', () => {
  it('at ceiling 45, 46 and 47 are held and staged farm_settings columns are kept', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(45);
    expect(CURRENT_SCHEMA_VERSION).toBe(45);
    expect(HELD_SCHEMA_VERSIONS).toEqual([46, 47]);
    expect(STAGED_COLUMNS[47]).toEqual({ farm_settings: COLS47 });
  });

  it('releasedColumns(47) omits null and throws on non-null while held', () => {
    const nulls = Object.fromEntries(COLS47.map(c => [c, null]));
    expect(releasedColumns(47, nulls)).toEqual({});
    expect(() => releasedColumns(47, {
      ...nulls,
      preg_check_min_days_since_exposure_cattle: 35,
    })).toThrow(/migration 47|unreleased/i);
  });

  it('farm-setting toSupabaseShape omits preg-check cols while held', () => {
    const base = FarmSetting.create({ farmId: 'f', operationId: 'op' });
    const sb = FarmSetting.toSupabaseShape(base);
    for (const c of COLS47) expect(sb).not.toHaveProperty(c);
    expect(() => FarmSetting.toSupabaseShape({
      ...base, pregCheckMinDaysSinceExposureCattle: 35, pregCheckMinDaysPostCalvingCattle: 45,
    })).toThrow(/migration 47|unreleased/i);
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
