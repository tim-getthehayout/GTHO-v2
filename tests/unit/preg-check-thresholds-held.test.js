/**
 * @file Held schema 47 — farm_settings preg-check thresholds (not yet applied).
 * Ceiling stays 45; HELD includes 46 and 47.
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

describe('preg-check thresholds held at schema 47', () => {
  it('keeps ceiling 45 with 46 and 47 held', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(45);
    expect(CURRENT_SCHEMA_VERSION).toBe(45);
    expect(HELD_SCHEMA_VERSIONS).toEqual([46, 47]);
    expect(STAGED_COLUMNS[47]).toEqual({
      farm_settings: [
        'preg_check_min_days_since_exposure',
        'preg_check_min_days_post_calving',
      ],
    });
  });

  it('releasedColumns(47) omits null and throws on non-null while held', () => {
    expect(releasedColumns(47, {
      preg_check_min_days_since_exposure: null,
      preg_check_min_days_post_calving: null,
    })).toEqual({});
    expect(() => releasedColumns(47, {
      preg_check_min_days_since_exposure: 35,
      preg_check_min_days_post_calving: 45,
    })).toThrow(/migration 47|unreleased/i);
  });

  it('farm-setting toSupabaseShape omits preg-check cols while held', () => {
    const base = FarmSetting.create({ farmId: 'f', operationId: 'op' });
    const sb = FarmSetting.toSupabaseShape(base);
    expect(sb).not.toHaveProperty('preg_check_min_days_since_exposure');
    expect(sb).not.toHaveProperty('preg_check_min_days_post_calving');
    expect(() => FarmSetting.toSupabaseShape({
      ...base, pregCheckMinDaysSinceExposure: 35, pregCheckMinDaysPostCalving: 45,
    })).toThrow(/migration 47|unreleased/i);
  });

  it('backup 46→47 sets missing preg-check defaults and stamps 47', () => {
    const backup = {
      schema_version: 46,
      tables: {
        operations: [{ id: 'op', schema_version: 46 }],
        farm_settings: [
          { id: 'fs1' },
          { id: 'fs2', preg_check_min_days_since_exposure: 28, preg_check_min_days_post_calving: 40 },
        ],
      },
    };
    const out = BACKUP_MIGRATIONS[46](structuredClone(backup));
    expect(out.schema_version).toBe(47);
    expect(out.tables.operations[0].schema_version).toBe(47);
    expect(out.tables.farm_settings[0].preg_check_min_days_since_exposure).toBe(35);
    expect(out.tables.farm_settings[0].preg_check_min_days_post_calving).toBe(45);
    expect(out.tables.farm_settings[1].preg_check_min_days_since_exposure).toBe(28);
    expect(out.tables.farm_settings[1].preg_check_min_days_post_calving).toBe(40);
  });
});
