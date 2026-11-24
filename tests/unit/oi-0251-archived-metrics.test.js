/**
 * @file OI-0251 Ap/Ud — farm setting include_archived_locations_in_metrics
 * (schema 50, held). Archived land pasture/mixed-use locations (e.g. the Sheep
 * history backfill) count in the Period totals strip (Calendar + List) and the
 * Home pasture DMI unless the setting is explicitly false; an absent column
 * (pre-050) means true. Rows, lists and pickers stay !archived. The Report
 * preferences dialog opens from the shared season bar on Calendar and List.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetCalendarState, setMetricWindow, setView } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid, _resetFarmSeasonEditor, formatDmiPerAcre } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import {
  isManagementLocation, filterManagementLocations, filterMetricLocations, includeArchivedInMetrics,
  buildLocationMetricRows, aggregatePeriodTotals, computeLocationMetrics, formatMetricValue,
} from '../../src/features/events/rotation-calendar/location-metrics.js';
import * as FarmSetting from '../../src/entities/farm-setting.js';
import {
  RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS, ARCHIVED_METRICS_SCHEMA_VERSION,
} from '../../src/data/schema-release.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { formatPerArea } from '../../src/utils/units.js';
import { validateBackup } from '../../src/data/backup-import.js';
import {
  isArchivedMetricsSettingReleased, updateIncludeArchivedInMetrics,
} from '../../src/features/settings/report-preferences.js';

beforeAll(() => setLocale('en', enLocale));

const ok = () => ({ valid: true, errors: [] });
const put = (type, rec) => add(type, rec, ok, r => r, type);
const origWidth = window.innerWidth;

const live = { id: 'L1', operationId: 'op', farmId: 'farm', name: 'North', type: 'land', landUse: 'pasture', areaHectares: 4, archived: false };
const hist = { id: 'SH', operationId: 'op', farmId: 'farm', name: 'Sheep history', type: 'land', landUse: 'pasture', areaHectares: null, archived: true };

function seed(settingValue) {
  _reset();
  localStorage.clear();
  resetCalendarState();
  _resetFarmSeasonEditor();
  window.history.replaceState(null, '', '#/events');
  document.body.innerHTML = '';
  put('operations', { id: 'op', name: 'Op', unitSystem: 'imperial' });
  put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
  const fsRow = { id: 'fs', farmId: 'farm', operationId: 'op', seasonStartMonth: 1, seasonStartDay: 1, seasonEndMonth: 12, seasonEndDay: 31 };
  if (settingValue !== undefined) fsRow.includeArchivedLocationsInMetrics = settingValue;
  put('farmSettings', fsRow);
  put('locations', { ...live });
  put('locations', { ...hist });
  put('groups', { id: 'g1', operationId: 'op', name: 'Cows' });
  put('groups', { id: 'gs', operationId: 'op', name: 'Sheep' });
  // Cattle on the live paddock: 1 hd @ 500 kg, no members → 2.5% default.
  put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: '2026-06-01' });
  put('eventPaddockWindows', { id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'L1', dateOpened: '2026-03-04', dateClosed: '2026-06-01', areaPct: 100 });
  put('eventGroupWindows', { id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1', dateJoined: '2026-03-04', dateLeft: '2026-06-01', headCount: 1, avgWeightKg: 500 });
  // OI-0251 Sheep history: closed, archived, no area, 70 hd @ 45.36 kg, no members.
  put('events', { id: 'evS', operationId: 'op', farmId: 'farm', dateOut: '2026-11-06' });
  put('eventPaddockWindows', { id: 'pwS', operationId: 'op', eventId: 'evS', locationId: 'SH', dateOpened: '2026-03-04', dateClosed: '2026-11-06', areaPct: 100 });
  put('eventGroupWindows', { id: 'gwS', operationId: 'op', eventId: 'evS', groupId: 'gs', dateJoined: '2026-03-04', dateLeft: '2026-11-06', headCount: 70, avgWeightKg: 45.36 });
}

function mount() {
  const c = document.createElement('div');
  document.body.appendChild(c);
  renderCalendarGrid(c);
  return c;
}
const stripText = (c, key) => c.querySelector(`[data-testid="loc-mgmt-period-total-${key}"]`)?.textContent ?? null;
const rowIds = (c) => [...c.querySelectorAll('[data-location-id]')].map(n => n.dataset.locationId);
const lb = (text) => Number(String(text).replace(/[^0-9.]/g, ''));

describe('OI-0251 Ap: X1 filter', () => {
  it('archived excluded by default; included only on request; land + pasture/mixed still required', () => {
    expect(isManagementLocation(hist)).toBe(false);
    expect(isManagementLocation(hist, { includeArchived: true })).toBe(true);
    expect(isManagementLocation({ ...hist, landUse: 'crop' }, { includeArchived: true })).toBe(false);
    expect(isManagementLocation({ ...hist, type: 'confinement', landUse: null }, { includeArchived: true })).toBe(false);
    expect(filterManagementLocations([live, hist]).map(l => l.id)).toEqual(['L1']);
  });

  it('setting: absent / null / true → include; only explicit false excludes', () => {
    expect(includeArchivedInMetrics(null)).toBe(true);
    expect(includeArchivedInMetrics({})).toBe(true);
    expect(includeArchivedInMetrics({ includeArchivedLocationsInMetrics: null })).toBe(true);
    expect(includeArchivedInMetrics({ includeArchivedLocationsInMetrics: true })).toBe(true);
    expect(includeArchivedInMetrics({ includeArchivedLocationsInMetrics: false })).toBe(false);
    expect(filterMetricLocations([live, hist], {}).map(l => l.id)).toEqual(['L1', 'SH']);
    expect(filterMetricLocations([live, hist], { includeArchivedLocationsInMetrics: false }).map(l => l.id)).toEqual(['L1']);
  });
});

describe('OI-0251 Ap: Period totals strip + Home pasture DMI', () => {
  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); window.innerWidth = 1280; });
  afterEach(() => { window.innerWidth = origWidth; _reset(); document.body.innerHTML = ''; });

  function totals(settingValue) {
    seed(settingValue);
    setMetricWindow('2026-01-01', '2026-12-31');
    const out = {};
    for (const view of ['calendar', 'list']) {
      document.body.innerHTML = '';
      setView(view);
      const c = mount();
      out[view] = { pasture: stripText(c, 'pastureDmi'), rows: rowIds(c) };
    }
    return out;
  }

  it('column absent (pre-050): Sheep history counts in the strip on Calendar and List; its row stays hidden', () => {
    const on = totals(undefined);
    const off = totals(false);
    expect(on.calendar.pasture).toBe(on.list.pasture);
    expect(off.calendar.pasture).toBe(off.list.pasture);
    // 70 × 45.36 × 2.5% = 79.38 kg/day ≈ 175 lb/day × 247 days (Mar 4 – Nov 5).
    const sheepLb = 70 * 100 * 0.025 * 247;
    const diff = lb(on.calendar.pasture) - lb(off.calendar.pasture);
    expect(Math.abs(diff - sheepLb) / sheepLb).toBeLessThan(0.01);
    for (const v of ['calendar', 'list']) {
      expect(on[v].rows).not.toContain('SH');
      expect(off[v].rows).not.toContain('SH');
    }
  });

  it('explicit true equals absent', () => {
    expect(totals(true).calendar.pasture).toBe(totals(undefined).calendar.pasture);
  });

  it('buildLocationMetricRows (Home pasture DMI path) follows ctx.farmSettings', () => {
    seed(undefined);
    const ctx = {
      events: [{ id: 'evS', operationId: 'op', farmId: 'farm', dateOut: '2026-11-06' }],
      paddockWindows: [{ id: 'pwS', eventId: 'evS', locationId: 'SH', dateOpened: '2026-03-04', dateClosed: '2026-11-06', areaPct: 100 }],
      groupWindows: [{ id: 'gwS', eventId: 'evS', groupId: 'gs', dateJoined: '2026-03-04', dateLeft: '2026-11-06', headCount: 70, avgWeightKg: 45.36 }],
      windowStart: '2026-03-04', windowEnd: '2026-03-04', today: '2026-11-24',
    };
    const onRows = buildLocationMetricRows([live, hist], ctx);
    const offRows = buildLocationMetricRows([live, hist], { ...ctx, farmSettings: { includeArchivedLocationsInMetrics: false } });
    expect(onRows.map(r => r.locationId)).toEqual(['L1', 'SH']);
    expect(offRows.map(r => r.locationId)).toEqual(['L1']);
    expect(aggregatePeriodTotals(onRows).pastureDmiKg).toBeCloseTo(70 * 45.36 * 0.025, 3);
  });

  it('(e) no-area Sheep history: per-area figures are — (null), not 0', () => {
    seed(undefined);
    const ctx = {
      events: [{ id: 'evS', operationId: 'op', farmId: 'farm', dateOut: '2026-11-06' }],
      paddockWindows: [{ id: 'pwS', eventId: 'evS', locationId: 'SH', dateOpened: '2026-03-04', dateClosed: '2026-11-06', areaPct: 100 }],
      groupWindows: [{ id: 'gwS', eventId: 'evS', groupId: 'gs', dateJoined: '2026-03-04', dateLeft: '2026-11-06', headCount: 70, avgWeightKg: 45.36 }],
      locations: [live, hist], windowStart: '2026-03-04', windowEnd: '2026-03-10', today: '2026-11-24',
    };
    const m = computeLocationMetrics(hist, ctx);
    expect(m.dmiKg).toBeGreaterThan(0);
    for (const k of ['dmiPerHa', 'audsPerHa', 'nPerHa', 'pPerHa', 'kPerHa']) expect(m[k], k).toBeNull();
    expect(m.hasArea).toBeFalsy();
    expect(formatDmiPerAcre(m, { unitSystem: 'imperial' })).toBe('—');
    expect(formatPerArea(m.nPerHa, 'npk', { unitSystem: 'imperial' })).toBe('—');
    expect(formatMetricValue(m.dmiPerHa)).toBe('—');
  });
});

describe('OI-0251 Ud: Report preferences dialog', () => {
  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); window.innerWidth = 1280; });
  afterEach(() => { window.innerWidth = origWidth; _reset(); document.body.innerHTML = ''; });

  for (const view of ['calendar', 'list']) {
    it(`opens from ${view}; holds period defaults + the archive toggle (disabled until 54 is released)`, () => {
      seed(undefined);
      setView(view);
      let c = mount();
      const btn = c.querySelector('[data-testid="report-prefs-open"]');
      expect(btn.textContent).toBe('Report preferences…');
      btn.click();
      c = document.body.querySelector('[data-testid="report-prefs-dialog"]');
      expect(c.getAttribute('role')).toBe('dialog');
      expect(c.querySelector('[data-testid="farm-season-editor"]')).toBeTruthy();
      const box = c.querySelector('[data-testid="report-prefs-include-archived"]');
      expect(box.checked).toBe(true);
      expect(box.disabled).toBe(!isArchivedMetricsSettingReleased());
      expect(c.textContent).toContain('Include archived locations in metrics');
    });
  }
});

describe('OI-0251 Ap: schema 50 held plumbing', () => {
  it('050 is held above the ceiling (049 pattern); the column is staged; writes refuse until released', () => {
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
    expect(() => FarmSetting.toSupabaseShape(pulled)).not.toThrow();
  });

  it('backup: CP-56 49 → 50 adds the default true (absent-only); unreleased column is rejected on import', () => {
    const b = { schema_version: 49, tables: { operations: [{ schema_version: 49 }], farm_settings: [{ id: 'a' }, { id: 'b', include_archived_locations_in_metrics: false }] } };
    const out = BACKUP_MIGRATIONS[49](b);
    expect(out.schema_version).toBe(50);
    expect(out.tables.operations[0].schema_version).toBe(50);
    expect(out.tables.farm_settings.map(r => r.include_archived_locations_in_metrics)).toEqual([true, false]);
    const res = validateBackup({
      format: 'gtho-v2-backup', format_version: 1, schema_version: RELEASED_SCHEMA_VERSION, operation_id: 'op',
      tables: { operations: [{ schema_version: RELEASED_SCHEMA_VERSION }], farm_settings: [{ id: 'x', include_archived_locations_in_metrics: true }] },
    });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/unreleased schema 50/);
  });

  it('migration file 050: additive boolean NOT NULL DEFAULT true; unconditional 49 → 50 stamp', () => {
    const dir = path.resolve(__dirname, '../../supabase/migrations');
    expect(fs.readdirSync(dir).filter(f => /^05\d_/.test(f))).toEqual(['050_farm_settings_include_archived_locations_in_metrics.sql']);
    const sql = fs.readFileSync(path.join(dir, '050_farm_settings_include_archived_locations_in_metrics.sql'), 'utf8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS include_archived_locations_in_metrics boolean NOT NULL DEFAULT true/);
    expect(sql).toMatch(/SET schema_version = 50\s+WHERE schema_version < 50;/);
  });
});
