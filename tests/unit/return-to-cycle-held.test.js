/**
 * @file Held-gate for schema 48 — farm_settings return-to-cycle days.
 * RELEASED stays 47; 048 is staged/held until Tim yes + verified backup apply.
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
import {
  areReturnToCycleSettingsReleased,
  validateReturnToCycleDays,
  updateFarmReturnToCycleSettings,
} from '../../src/features/settings/preg-check-settings.js';
import { DEFAULT_RETURN_TO_CYCLE_BY_FAMILY } from '../../src/calcs/bull-exposure.js';
import fs from 'fs';
import path from 'path';

beforeEach(() => setLocale('en', en));

const COLS48 = [
  'return_to_cycle_days_cattle',
  'return_to_cycle_days_sheep',
  'return_to_cycle_days_goat',
];

describe('return-to-cycle held at ceiling 47', () => {
  it('RELEASED stays 47; 48 held and staged; CURRENT stays 47', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(47);
    expect(CURRENT_SCHEMA_VERSION).toBe(47);
    expect(HELD_SCHEMA_VERSIONS).toEqual([48]);
    expect(STAGED_COLUMNS[48]).toEqual({ farm_settings: COLS48 });
    expect(areReturnToCycleSettingsReleased()).toBe(false);
    expect(areReturnToCycleSettingsReleased(47)).toBe(false);
    expect(areReturnToCycleSettingsReleased(48)).toBe(true);
  });

  it('migration 048 file exists and defaults are P-a 45/25/25 with distinct names', () => {
    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.startsWith('048_'));
    expect(files).toEqual(['048_farm_settings_return_to_cycle_days.sql']);
    const sql = fs.readFileSync(path.join(migrationsDir, files[0]), 'utf8');
    expect(sql).toMatch(/return_to_cycle_days_cattle/);
    expect(sql).toMatch(/return_to_cycle_days_sheep/);
    expect(sql).toMatch(/return_to_cycle_days_goat/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS return_to_cycle_days_/);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS preg_check_/);
    expect(sql).toMatch(/DEFAULT 45/);
    expect(sql).toMatch(/DEFAULT 25/);
    expect(sql).toMatch(/schema_version = 48/);
    expect(DEFAULT_RETURN_TO_CYCLE_BY_FAMILY).toEqual({ cattle: 45, sheep: 25, goat: 25 });
  });

  it('releasedColumns(48) omits null and throws on non-null while held', () => {
    const nulls = Object.fromEntries(COLS48.map(c => [c, null]));
    expect(releasedColumns(48, nulls)).toEqual({});
    expect(() => releasedColumns(48, {
      ...nulls,
      return_to_cycle_days_cattle: 45,
    })).toThrow(/migration 48|unreleased/i);
  });

  it('farm-setting toSupabaseShape omits return-to-cycle cols while held', () => {
    const base = FarmSetting.create({ farmId: 'f', operationId: 'op' });
    const sb = FarmSetting.toSupabaseShape(base);
    for (const c of COLS48) expect(sb).not.toHaveProperty(c);
    expect(() => FarmSetting.toSupabaseShape({
      ...base, returnToCycleDaysCattle: 45, returnToCycleDaysSheep: 25, returnToCycleDaysGoat: 25,
    })).toThrow(/migration 48|unreleased/i);
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

  it('editors gated: update throws while held; validation accepts P-a defaults', () => {
    const good = {
      returnToCycleDaysCattle: 45,
      returnToCycleDaysSheep: 25,
      returnToCycleDaysGoat: 25,
    };
    expect(validateReturnToCycleDays(good).valid).toBe(true);
    expect(() => updateFarmReturnToCycleSettings('fs1', good)).toThrow(/schema 48/i);
  });
});
