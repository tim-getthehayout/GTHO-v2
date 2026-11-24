/**
 * @file Held-gate for OI-0251 Ap — farm_settings.include_archived_locations_in_metrics,
 * replayed at a mocked ceiling 49 (the state before 050 was released). The real
 * ceiling is 50 now; see oi-0251-archived-metrics.test.js. Under the mock the
 * column is never written, a pull reads null (→ include), and a backup carrying
 * the column is refused.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 49, HELD_SCHEMA_VERSIONS: [50] }));
import * as FarmSetting from '../../src/entities/farm-setting.js';
import {
  RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS, ARCHIVED_METRICS_SCHEMA_VERSION,
} from '../../src/data/schema-release.js';
import { validateBackup } from '../../src/data/backup-import.js';
import {
  isArchivedMetricsSettingReleased, updateIncludeArchivedInMetrics,
} from '../../src/features/settings/report-preferences.js';
import { includeArchivedInMetrics } from '../../src/features/events/rotation-calendar/location-metrics.js';

describe('OI-0251 Ap: schema 50 held (mocked ceiling 49)', () => {
  it('050 is held above the ceiling; the column is staged; writes refuse until released', () => {
    expect(ARCHIVED_METRICS_SCHEMA_VERSION).toBe(50);
    expect(RELEASED_SCHEMA_VERSION).toBe(49);
    expect(HELD_SCHEMA_VERSIONS).toEqual([50]);
    expect(STAGED_COLUMNS[50]).toEqual({ farm_settings: ['include_archived_locations_in_metrics'] });
    expect(isArchivedMetricsSettingReleased()).toBe(false);
    expect(isArchivedMetricsSettingReleased(50)).toBe(true);
    expect(() => updateIncludeArchivedInMetrics('fs', false)).toThrow(/schema 50/);
  });

  it('entity: default null omits the column; a pre-release pull with the column reads null (→ include)', () => {
    const shape = FarmSetting.toSupabaseShape(FarmSetting.create({ id: 'fs', farmId: 'farm', operationId: 'op' }));
    expect(Object.hasOwn(shape, 'include_archived_locations_in_metrics')).toBe(false);
    const pulled = FarmSetting.fromSupabaseShape({ ...shape, include_archived_locations_in_metrics: false });
    expect(pulled.includeArchivedLocationsInMetrics).toBeNull();
    expect(includeArchivedInMetrics(pulled)).toBe(true);
    expect(() => FarmSetting.toSupabaseShape(pulled)).not.toThrow();
    expect(() => FarmSetting.toSupabaseShape({ ...pulled, includeArchivedLocationsInMetrics: false })).toThrow(/50|unreleased/i);
  });

  it('backup: a 49 backup carrying the unreleased column is rejected on import', () => {
    const res = validateBackup({
      format: 'gtho-v2-backup', format_version: 1, schema_version: 49, operation_id: 'op',
      tables: { operations: [{ schema_version: 49 }], farm_settings: [{ id: 'x', include_archived_locations_in_metrics: true }] },
    });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/unreleased schema 50/);
  });
});
