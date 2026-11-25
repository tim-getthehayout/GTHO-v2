/**
 * #449 dairy milk — acceptance tests 1–11 at the real released ceiling 51
 * (051 applied and verified on v2 prod 2026-11-25). The held side (ceiling 50)
 * stays covered in dairy-milk-held.test.js. Brief: session_briefs/DAIRY_MILK_2026-11-24.md.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ rows: {}, calls: [], proofs: [], missingTables: [] }));
vi.mock('../../src/data/supabase-client.js', async () => {
  const { makeBackupClient } = await import('./historical-backup-double.js');
  return { supabase: makeBackupClient(db) };
});
vi.mock('../../src/features/auth/session.js', () => ({ getUser: () => ({ id: 'user', email: 'test@example.test' }) }));
import { CustomSync } from '../../src/data/custom-sync.js';
import { _reset, setSyncAdapter, mergeRemote, getAll, getById, update } from '../../src/data/store.js';
import { RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, isTableReleased } from '../../src/data/schema-release.js';
import { BACKUP_TABLES } from '../../src/data/backup-export.js';
import { FK_ORDER } from '../../src/data/backup-import.js';
import { localSupabaseRow } from '../../src/data/push-all.js';
import { exportOperationBackup } from '../../src/data/backup-export.js';
import { importOperationBackup, CURRENT_SCHEMA_VERSION } from '../../src/data/backup-import.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import * as MilkPickup from '../../src/entities/milk-pickup.js';
import * as CalfMilk from '../../src/entities/calf-milk-feeding.js';
import * as FarmSetting from '../../src/entities/farm-setting.js';
import * as Group from '../../src/entities/group.js';
import { toStoredValue } from '../../src/features/settings/unit-descriptor.js';
import { isDairyVisible, perPickupTotals, spreadDailyTotals, milkingGrazingOn, milkingGroupIds, recentDrivers } from '../../src/features/milk/milk-calcs.js';
import { openMilkPickupSheet, formatPickupSpan, calfMilkPreview, buildMilkRows, renderMilkScreen, _resetMilkPage, NO_MILKING_GROUP_HINT, isDairyVisibleNow } from '../../src/features/milk/index.js';
import { openGroupSheet } from '../../src/features/animals/index.js';
import { resolveFieldModuleKeys, availableFieldModules, FIELD_MODULES_DEFAULT } from '../../src/features/field-mode/index.js';
import { renderDairySettingsCard, milkDensityLabel } from '../../src/features/settings/dairy-settings.js';

const OP = '00000000-0000-4000-8000-0000000449a1';
const FARM = '00000000-0000-4000-8000-0000000449f1';
const FARM2 = '00000000-0000-4000-8000-0000000449f2';
const DAIRY_CLASS = '00000000-0000-4000-8000-0000000449c1';
const BEEF_CLASS = '00000000-0000-4000-8000-0000000449c2';
const at = (m, d, h, min = 0) => new Date(2026, m - 1, d, h, min).toISOString();
const pickup = (id, ts, kg, farmId = FARM, extra = {}) => MilkPickup.create({ id, operationId: OP, farmId, pickedUpAt: ts, weightKg: kg, ...extra });
const feeding = (id, ts, litres, farmId = FARM, extra = {}) => CalfMilk.create({ id, operationId: OP, farmId, fedAt: ts, volumeL: litres, kgPerLSnapshot: 1.0305073, ...extra });

function seedBase({ dairyMode = 'auto', totals = 'per_pickup', offset = 1, dairyAnimal = true, unitSystem = 'imperial' } = {}) {
  mergeRemote('operations', [{ id: OP, name: 'Op', unitSystem }]);
  mergeRemote('farms', [{ id: FARM, operationId: OP, name: 'Home' }]);
  mergeRemote('farmSettings', [FarmSetting.create({ id: 'fs1', farmId: FARM, operationId: OP, dairyMode, milkTotalsMode: totals, milkGrazingOffsetDays: offset, milkKgPerL: 1.0305073 })]);
  mergeRemote('animalClasses', [{ id: DAIRY_CLASS, operationId: OP, name: 'Cows', species: 'dairy_cattle', role: 'cow' }, { id: BEEF_CLASS, operationId: OP, name: 'Steers', species: 'beef_cattle', role: 'steer' }]);
  if (dairyAnimal) mergeRemote('animals', [{ id: 'a1', operationId: OP, classId: DAIRY_CLASS, sex: 'female', active: true, cullDate: null }]);
  mergeRemote('userPreferences', [{ id: 'p1', userId: 'user', activeFarmId: FARM, fieldModeQuickActions: null }]);
}

beforeEach(() => {
  localStorage.clear(); _reset(); _resetMilkPage();
  document.body.innerHTML = '';
  db.rows = {}; db.calls = []; db.proofs = []; db.missingTables = [];
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { setSyncAdapter(null); vi.restoreAllMocks(); });

it('runs at the real released ceiling 51 with nothing held', () => {
  expect(RELEASED_SCHEMA_VERSION).toBe(51);
  expect(CURRENT_SCHEMA_VERSION).toBe(51);
  expect(HELD_SCHEMA_VERSIONS).toEqual([]);
  expect(isTableReleased('milk_pickups', RELEASED_SCHEMA_VERSION)).toBe(true);
  expect(isTableReleased('calf_milk_feedings', RELEASED_SCHEMA_VERSION)).toBe(true);
});

describe('1 · entity round trip and validation', () => {
  it('pickups and feedings round-trip; numeric strings come back as numbers', () => {
    const p = pickup('p1', at(11, 9, 6), 250.5, FARM, { driver: ' Dan ' });
    expect(p.driver).toBe('Dan');
    const row = MilkPickup.toSupabaseShape(p);
    expect(row).toMatchObject({ operation_id: OP, farm_id: FARM, weight_kg: 250.5, driver: 'Dan' });
    expect(MilkPickup.fromSupabaseShape({ ...row, weight_kg: '250.5' })).toEqual(p);
    const f = feeding('f1', at(11, 9, 17), 37.854, FARM, { groupId: 'g1' });
    const frow = CalfMilk.toSupabaseShape(f);
    expect(frow).toMatchObject({ volume_l: 37.854, kg_per_l_snapshot: 1.0305073, group_id: 'g1' });
    expect(CalfMilk.fromSupabaseShape({ ...frow, volume_l: '37.854', kg_per_l_snapshot: '1.0305073' })).toEqual(f);
  });
  it('rejects ≤ 0, a bad timestamp and a missing farm or operation', () => {
    expect(MilkPickup.validate(pickup('p', at(11, 9, 6), 1)).valid).toBe(true);
    for (const kg of [0, -1, null, 'x']) expect(MilkPickup.validate(pickup('p', at(11, 9, 6), kg)).valid).toBe(false);
    expect(MilkPickup.validate({ ...pickup('p', at(11, 9, 6), 1), pickedUpAt: 'nope' }).valid).toBe(false);
    expect(MilkPickup.validate({ ...pickup('p', at(11, 9, 6), 1), farmId: null }).valid).toBe(false);
    expect(MilkPickup.validate({ ...pickup('p', at(11, 9, 6), 1), operationId: null }).valid).toBe(false);
    expect(CalfMilk.validate(feeding('f', at(11, 9, 6), 2)).valid).toBe(true);
    for (const l of [0, -2]) expect(CalfMilk.validate(feeding('f', at(11, 9, 6), l)).valid).toBe(false);
    expect(CalfMilk.validate({ ...feeding('f', at(11, 9, 6), 2), kgPerLSnapshot: 0 }).valid).toBe(false);
    expect(CalfMilk.validate({ ...feeding('f', at(11, 9, 6), 2), fedAt: 'bad' }).valid).toBe(false);
    expect(CalfMilk.validate({ ...feeding('f', at(11, 9, 6), 2), farmId: null }).valid).toBe(false);
    expect(CalfMilk.validate({ ...feeding('f', at(11, 9, 6), 2), operationId: null }).valid).toBe(false);
  });
});

describe('2 · calf milk weight', () => {
  it('10 gal at the default factor shows 86.0 lb; old records keep their snapshot', () => {
    const litres = toStoredValue(10, { measureType: 'volume' }, 'imperial');
    expect(calfMilkPreview(litres, FarmSetting.DAIRY_DEFAULTS.milkKgPerL, 'imperial')).toBe('86.0 lb');
    const f = feeding('f1', at(11, 9, 6), litres);
    const before = CalfMilk.calfMilkKg(f);
    seedBase();
    update('farmSettings', 'fs1', { milkKgPerL: 1.1 }, FarmSetting.validate, FarmSetting.toSupabaseShape, 'farm_settings');
    expect(getById('farmSettings', 'fs1').milkKgPerL).toBe(1.1);
    expect(CalfMilk.calfMilkKg(f)).toBe(before);
    expect(milkDensityLabel('imperial')).toBe('Milk lb per gallon');
    expect(milkDensityLabel('metric')).toBe('Milk kg per L');
  });
});

describe('3 · settings and group flag at 51', () => {
  it('farm_settings dairy columns round-trip; unset values push the NOT NULL defaults, never null', () => {
    const fs = FarmSetting.create({ id: 'fs', farmId: FARM, operationId: OP, dairyMode: 'on', milkKgPerL: 1.02, milkGrazingOffsetDays: 3, milkTotalsMode: 'spread_daily' });
    const row = FarmSetting.toSupabaseShape(fs);
    expect(row).toMatchObject({ dairy_mode: 'on', milk_kg_per_l: 1.02, milk_grazing_offset_days: 3, milk_totals_mode: 'spread_daily' });
    expect(FarmSetting.fromSupabaseShape(row)).toMatchObject({ dairyMode: 'on', milkKgPerL: 1.02, milkGrazingOffsetDays: 3, milkTotalsMode: 'spread_daily' });
    const blank = FarmSetting.toSupabaseShape(FarmSetting.create({ id: 'fs2', farmId: FARM, operationId: OP }));
    expect(blank).toMatchObject({ dairy_mode: 'auto', milk_kg_per_l: 1.0305073, milk_grazing_offset_days: 1, milk_totals_mode: 'per_pickup' });
    expect(FarmSetting.validate({ ...fs, milkGrazingOffsetDays: 15 }).valid).toBe(false);
    expect(FarmSetting.validate({ ...fs, milkKgPerL: 0 }).valid).toBe(false);
    expect(FarmSetting.validate({ ...fs, dairyMode: 'maybe' }).valid).toBe(false);
  });
  it('groups.is_milking round-trips and is never pushed as null', () => {
    const g = Group.create({ id: 'g1', operationId: OP, name: 'Milkers', isMilking: true });
    const row = Group.toSupabaseShape(g);
    expect(row.is_milking).toBe(true);
    expect(Group.fromSupabaseShape(row).isMilking).toBe(true);
    expect(Group.toSupabaseShape(Group.create({ id: 'g2', operationId: OP, name: 'Dry' })).is_milking).toBe(false);
  });
});

describe('4 · visibility matrix', () => {
  const farms = [{ id: FARM }, { id: FARM2 }];
  const animalClasses = [{ id: DAIRY_CLASS, species: 'dairy_cattle' }, { id: BEEF_CLASS, species: 'beef_cattle' }];
  const fsFor = (mode, farmId = FARM) => ({ farmId, dairyMode: mode });
  const cow = (extra = {}) => ({ id: 'a', classId: DAIRY_CLASS, active: true, cullDate: null, ...extra });
  it('auto, on, off, All farms and the ceiling', () => {
    const base = { farmId: FARM, farms, animalClasses };
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('auto')], animals: [cow()] })).toBe(true);
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('auto')], animals: [] })).toBe(false);
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('auto')], animals: [cow({ classId: BEEF_CLASS })] })).toBe(false);
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('auto')], animals: [cow({ cullDate: '2026-10-01' })] })).toBe(false);
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('auto')], animals: [cow({ active: false })] })).toBe(false);
    expect(isDairyVisible({ ...base, farmSettings: [], animals: [cow()] })).toBe(true); // no row → auto
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('on')], animals: [] })).toBe(true);
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('off')], animals: [cow()] })).toBe(false);
    // All farms: shown if any farm shows.
    const all = { ...base, farmId: null };
    expect(isDairyVisible({ ...all, farmSettings: [fsFor('off'), fsFor('on', FARM2)], animals: [] })).toBe(true);
    expect(isDairyVisible({ ...all, farmSettings: [fsFor('off'), fsFor('off', FARM2)], animals: [cow()] })).toBe(false);
    // Ceiling below 51 hides everything.
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('on')], animals: [cow()], ceiling: 50 })).toBe(false);
    expect(isDairyVisible({ ...base, farmSettings: [fsFor('on')], animals: [cow()], ceiling: 51 })).toBe(true);
  });
  it('isDairyVisibleNow reads the store for the active farm', () => {
    seedBase({ dairyMode: 'auto' });
    expect(isDairyVisibleNow()).toBe(true);
    seedBase({ dairyMode: 'off' });
    expect(isDairyVisibleNow()).toBe(false);
  });
});

describe('5 · grazing offset', () => {
  const groups = [
    { id: 'gm', name: 'Milkers', isMilking: true, archivedAt: null },
    { id: 'gh', name: 'Heifers', isMilking: true, archivedAt: null },
    { id: 'gx', name: 'Old', isMilking: true, archivedAt: '2026-01-01T00:00:00Z' },
    { id: 'gd', name: 'Dry', isMilking: false, archivedAt: null },
  ];
  const groupWindows = [
    { groupId: 'gm', eventId: 'e1', dateJoined: '2026-11-10', dateLeft: '2026-11-10' },
    { groupId: 'gh', eventId: 'e2', dateJoined: '2026-11-01', dateLeft: null },
    { groupId: 'gx', eventId: 'e3', dateJoined: '2026-11-01', dateLeft: null },
    { groupId: 'gd', eventId: 'e4', dateJoined: '2026-11-01', dateLeft: null },
  ];
  const paddockWindows = [
    { eventId: 'e1', locationId: 'L1', dateOpened: '2026-11-10', dateClosed: '2026-11-10' },
    { eventId: 'e2', locationId: 'L2', dateOpened: '2026-11-01', dateClosed: null },
    { eventId: 'e3', locationId: 'L3', dateOpened: '2026-11-01', dateClosed: null },
    { eventId: 'e4', locationId: 'L4', dateOpened: '2026-11-01', dateClosed: null },
  ];
  const locations = [{ id: 'L1', name: 'North' }, { id: 'L2', name: 'Creek' }, { id: 'L3', name: 'Gone' }, { id: 'L4', name: 'Dry lot' }];
  const ctx = { groups, groupWindows, paddockWindows, locations, today: '2026-11-24' };
  it('offset 1 puts Nov 10 grazing on the Nov 11 milk row, labelled Nov 10; two groups stack; only flagged, live groups', () => {
    const { grazingDate, blocks } = milkingGrazingOn('2026-11-11', { ...ctx, offsetDays: 1 });
    expect(grazingDate).toBe('2026-11-10');
    expect(blocks.map(b => [b.groupId, b.locationName])).toEqual([['gm', 'North'], ['gh', 'Creek']]);
    expect(milkingGrazingOn('2026-11-12', { ...ctx, offsetDays: 1 }).blocks.map(b => b.groupId)).toEqual(['gh']);
  });
  it('offsets 0 and 14', () => {
    expect(milkingGrazingOn('2026-11-10', { ...ctx, offsetDays: 0 })).toMatchObject({ grazingDate: '2026-11-10' });
    expect(milkingGrazingOn('2026-11-10', { ...ctx, offsetDays: 0 }).blocks.map(b => b.groupId)).toEqual(['gm', 'gh']);
    const r14 = milkingGrazingOn('2026-11-24', { ...ctx, offsetDays: 14 });
    expect(r14.grazingDate).toBe('2026-11-10');
    expect(r14.blocks.map(b => b.groupId)).toEqual(['gm', 'gh']);
  });
  it('the milk row draws the shifted grazing with the real grazing date', () => {
    seedBase({ offset: 1 });
    mergeRemote('groups', groups.map(g => ({ ...g, operationId: OP })));
    mergeRemote('eventGroupWindows', groupWindows.map((w, i) => ({ id: `gw${i}`, operationId: OP, headCount: 1, avgWeightKg: 500, ...w })));
    mergeRemote('eventPaddockWindows', paddockWindows.map((w, i) => ({ id: `pw${i}`, operationId: OP, ...w })));
    mergeRemote('locations', locations.map(l => ({ ...l, operationId: OP, farmId: FARM, type: 'land' })));
    mergeRemote('milkPickups', [pickup('p1', at(11, 11, 6), 400)]);
    const rows = buildMilkRows({ view: 'pickups', from: '2026-11-01', to: '2026-11-30', farmId: FARM, groupIds: milkingGroupIds(getAll('groups')), unitSystem: 'imperial' });
    const cell = rows[0].querySelector('[data-testid="milk-paddock"]');
    expect(cell.dataset.grazingDate).toBe('2026-11-10');
    expect(cell.querySelectorAll('[data-testid="milk-paddock-block"]')).toHaveLength(2);
    expect(cell.textContent).toContain('North');
    expect(cell.textContent).toContain('Nov 10');
  });
});

describe('5b · paddock column limited to the pickup\'s own farm (R3)', () => {
  it('a milking group grazing another farm is not drawn beside this farm\'s milk', () => {
    const groups = [{ id: 'gm', name: 'Milkers', isMilking: true, archivedAt: null }];
    const groupWindows = [{ groupId: 'gm', eventId: 'e1', dateJoined: '2026-11-01', dateLeft: null }, { groupId: 'gm', eventId: 'e2', dateJoined: '2026-11-01', dateLeft: null }];
    const paddockWindows = [{ eventId: 'e1', locationId: 'LH', dateOpened: '2026-11-01', dateClosed: null }, { eventId: 'e2', locationId: 'LN', dateOpened: '2026-11-01', dateClosed: null }];
    const locations = [{ id: 'LH', name: 'Home field', farmId: FARM }, { id: 'LN', name: 'North field', farmId: FARM2 }];
    const ctx = { groups, groupWindows, paddockWindows, locations, today: '2026-11-24', offsetDays: 1 };
    expect(milkingGrazingOn('2026-11-11', { ...ctx, farmId: FARM }).blocks.map(b => b.locationName)).toEqual(['Home field']);
    expect(milkingGrazingOn('2026-11-11', { ...ctx, farmId: FARM2 }).blocks.map(b => b.locationName)).toEqual(['North field']);
    seedBase();
    mergeRemote('farms', [{ id: FARM2, operationId: OP, name: 'North' }]);
    mergeRemote('groups', groups.map(g => ({ ...g, operationId: OP })));
    mergeRemote('eventGroupWindows', groupWindows.map((w, i) => ({ id: `gw${i}`, operationId: OP, headCount: 1, avgWeightKg: 500, ...w })));
    mergeRemote('eventPaddockWindows', paddockWindows.map((w, i) => ({ id: `pw${i}`, operationId: OP, ...w })));
    mergeRemote('locations', locations.map(l => ({ ...l, operationId: OP, type: 'land' })));
    mergeRemote('milkPickups', [pickup('p1', at(11, 11, 6), 400)]);
    const rows = buildMilkRows({ view: 'pickups', from: '2026-11-01', to: '2026-11-30', farmId: FARM, groupIds: ['gm'], unitSystem: 'imperial' });
    const cell = rows[0].querySelector('[data-testid="milk-paddock"]');
    expect(cell.textContent).toContain('Home field');
    expect(cell.textContent).not.toContain('North field');
  });
});

describe('6 · active milking group switch, hint and page filter', () => {
  it('shows the switch when dairy is visible and saves the flag', () => {
    seedBase();
    mergeRemote('groups', [{ id: 'g1', operationId: OP, name: 'Herd', color: '#000', isMilking: false, archivedAt: null }]);
    openGroupSheet(getById('groups', 'g1'), OP);
    const box = document.querySelector('[data-testid="group-sheet-milking"]');
    expect(box).toBeTruthy();
    expect(document.querySelector('[data-testid="group-sheet-milking-field"]').textContent).toContain('Active milking group');
    box.checked = true;
    document.querySelector('[data-testid="group-sheet-save"]').click();
    expect(getById('groups', 'g1').isMilking).toBe(true);
  });
  it('hides the switch when dairy is not visible', () => {
    seedBase({ dairyMode: 'off' });
    mergeRemote('groups', [{ id: 'g1', operationId: OP, name: 'Herd', color: '#000', isMilking: false, archivedAt: null }]);
    openGroupSheet(getById('groups', 'g1'), OP);
    expect(document.querySelector('[data-testid="group-sheet-milking"]')).toBeNull();
  });
  it('with no group flagged the hint shows and saving still works; the page filter defaults to flagged groups', () => {
    seedBase();
    mergeRemote('groups', [{ id: 'g1', operationId: OP, name: 'Herd', color: '#000', isMilking: false, archivedAt: null }]);
    const c = document.createElement('div'); document.body.appendChild(c);
    renderMilkScreen(c);
    expect(c.querySelector('[data-testid="milk-no-group-hint"]').textContent).toContain(NO_MILKING_GROUP_HINT);
    expect(c.querySelector('[data-testid="milk-no-group-hint"] a').getAttribute('href')).toBe('#/animals');
    // Release copy: the hint names where the switch lives (group sheet).
    expect(NO_MILKING_GROUP_HINT).toBe("No milking group set. Open a group, turn on 'Active milking group'.");
    expect(renderDairySettingsCard(getById('farmSettings', 'fs1')).querySelector('[data-testid="settings-dairy-no-group-hint"]').textContent).toBe(NO_MILKING_GROUP_HINT);
    // Saving a pickup still works with no milking group set.
    openMilkPickupSheet();
    document.querySelector('[data-testid="milk-pickup-weight"]').value = '100';
    document.querySelector('[data-testid="milk-pickup-driver"]').value = 'Dan';
    document.querySelector('[data-testid="milk-save"]').click();
    expect(getAll('milkPickups')).toHaveLength(1);
    expect(getAll('milkPickups')[0]).toMatchObject({ farmId: FARM, operationId: OP, driver: 'Dan' });
    expect(getAll('milkPickups')[0].weightKg).toBeCloseTo(45.359, 2);
    // Flag one group: the filter now defaults to it.
    _resetMilkPage();
    mergeRemote('groups', [{ id: 'g2', operationId: OP, name: 'Milkers', color: '#000', isMilking: true, archivedAt: null }]);
    const c2 = document.createElement('div'); document.body.appendChild(c2);
    renderMilkScreen(c2);
    expect(c2.querySelector('[data-testid="milk-no-group-hint"]')).toBeNull();
    expect(renderDairySettingsCard(getById('farmSettings', 'fs1')).querySelector('[data-testid="settings-dairy-no-group-hint"]')).toBeNull();
    const chips = [...c2.querySelectorAll('[data-testid="milk-group-chip"]')];
    expect(chips.filter(ch => ch.className.includes('btn-green')).map(ch => ch.dataset.groupId)).toEqual(['g2']);
  });
});

describe('7 · per_pickup totals', () => {
  it('the Nov 11 total holds only the Nov 9 5 PM feeding; the Nov 11 7 AM feeding is since last pickup', () => {
    const pickups = [pickup('p1', at(11, 9, 6), 300), pickup('p2', at(11, 11, 6), 400)];
    const feedings = [feeding('f1', at(11, 9, 17), 10), feeding('f2', at(11, 11, 7), 5)];
    const { rows, sinceLast } = perPickupTotals(pickups, feedings);
    const nov11 = rows.find(r => r.pickup.id === 'p2');
    expect(nov11.feedings.map(f => f.id)).toEqual(['f1']);
    expect(nov11.spanDays).toBe(2);
    expect(nov11.totalKg).toBeCloseTo(400 + 10 * 1.0305073, 6);
    expect(nov11.kgPerDay).toBeCloseTo(nov11.totalKg / 2, 6);
    expect(rows.find(r => r.pickup.id === 'p1')).toMatchObject({ prevPickedUpAt: null, spanDays: null, kgPerDay: null, calfKg: 0 });
    expect(sinceLast).toHaveLength(1);
    expect(sinceLast[0].feedings.map(f => f.id)).toEqual(['f2']);
  });
  it('the page shows the span and lb/day', () => {
    seedBase();
    mergeRemote('milkPickups', [pickup('p1', at(11, 9, 6, 10), 300), pickup('p2', at(11, 11, 6, 5), 400)]);
    mergeRemote('calfMilkFeedings', [feeding('f1', at(11, 9, 17), 10), feeding('f2', at(11, 11, 7), 5)]);
    const rows = buildMilkRows({ view: 'all', from: '2026-11-01', to: '2026-11-30', farmId: FARM, groupIds: [], unitSystem: 'imperial' });
    expect(rows[0].dataset.testid).toBe('milk-row-since-last');
    const totals = rows.filter(r => r.dataset.testid === 'milk-row-pickup-total');
    expect(totals).toHaveLength(2);
    const span = totals[0].querySelector('[data-testid="milk-total-span"]').textContent;
    expect(span).toMatch(/Nov 9 6:10\s?AM → Nov 11 6:05\s?AM, 2 days/);
    expect(totals[0].textContent).toContain('/day');
    expect(totals[1].textContent).toContain('First pickup');
  });
});

describe('7b · span year (Design ruling 5)', () => {
  const now = new Date(2026, 10, 25, 9, 0);
  it('no year inside the current year', () => {
    expect(formatPickupSpan(at(11, 9, 6, 10), at(11, 11, 6, 5), 2, now)).toMatch(/^Nov 9 6:10\s?AM → Nov 11 6:05\s?AM, 2 days$/);
  });
  it('year on both ends when the span crosses a year boundary', () => {
    const a = new Date(2026, 11, 30, 6).toISOString(), b = new Date(2027, 0, 1, 6).toISOString();
    expect(formatPickupSpan(a, b, 2, new Date(2027, 0, 2))).toMatch(/^Dec 30, 2026 6:00\s?AM → Jan 1, 2027 6:00\s?AM, 2 days$/);
  });
  it('year when the span falls outside the current year', () => {
    const a = new Date(2025, 10, 9, 6).toISOString(), b = new Date(2025, 10, 10, 6).toISOString();
    expect(formatPickupSpan(a, b, 1, now)).toMatch(/^Nov 9, 2025 6:00\s?AM → Nov 10, 2025 6:00\s?AM, 1 day$/);
  });
});

describe('8 · spread_daily totals', () => {
  it('All farms (R1): each farm uses its own milk_totals_mode and grazing offset; total rows carry the farm name', () => {
    seedBase({ totals: 'spread_daily', offset: 1 });
    mergeRemote('farms', [{ id: FARM2, operationId: OP, name: 'North' }]);
    mergeRemote('farmSettings', [FarmSetting.create({ id: 'fs2', farmId: FARM2, operationId: OP, dairyMode: 'auto', milkTotalsMode: 'per_pickup', milkGrazingOffsetDays: 3 })]);
    mergeRemote('userPreferences', [{ id: 'p1', userId: 'user', activeFarmId: null, fieldModeQuickActions: null }]);
    mergeRemote('milkPickups', [
      pickup('p1', at(11, 9, 6), 300), pickup('p2', at(11, 11, 6), 400),
      pickup('q1', at(11, 9, 7), 100, FARM2), pickup('q2', at(11, 11, 7), 200, FARM2),
    ]);
    const build = () => buildMilkRows({ view: 'all', from: '2026-11-01', to: '2026-11-30', farmId: null, groupIds: [], unitSystem: 'imperial' });
    const rows = build();
    const totalIds = new Set(['milk-row-day', 'milk-row-pickup-total', 'milk-row-since-last']);
    const totals = rows.filter(r => totalIds.has(r.dataset.testid));
    const farmOf = r => r.querySelector('[data-testid="milk-row-farm"]')?.dataset.farmId;
    // Every total row is labelled with its farm.
    expect(totals.every(r => r.querySelector('[data-testid="milk-row-farm"]'))).toBe(true);
    const home = totals.filter(r => farmOf(r) === FARM), north = totals.filter(r => farmOf(r) === FARM2);
    expect(home[0].textContent).toContain('Home · ');
    expect(north[0].textContent).toContain('North · ');
    // Home (spread_daily): 3 day rows (2 est.), no pickup totals.
    expect(home.map(r => r.dataset.testid)).toEqual(['milk-row-day', 'milk-row-day', 'milk-row-day']);
    expect(home.filter(r => r.textContent.includes('est.'))).toHaveLength(2);
    // North (per_pickup): two pickup totals over its own pickups only.
    expect(north.map(r => r.dataset.testid)).toEqual(['milk-row-pickup-total', 'milk-row-pickup-total']);
    expect(north[0].querySelector('[data-testid="milk-total-span"]').textContent).toMatch(/Nov 9 7:00\s?AM → Nov 11 7:00\s?AM, 2 days/);
    // Each farm's own grazing offset: Home 1 day, North 3 days.
    expect(home[0].querySelector('[data-testid="milk-paddock"]').dataset.grazingDate).toBe('2026-11-10');
    expect(north[0].querySelector('[data-testid="milk-paddock"]').dataset.grazingDate).toBe('2026-11-08');
    // Switching one farm's mode leaves the other's rows alone.
    update('farmSettings', 'fs2', { milkTotalsMode: 'spread_daily' }, FarmSetting.validate, FarmSetting.toSupabaseShape, 'farm_settings');
    const again = build();
    expect(again.filter(r => r.dataset.testid === 'milk-row-pickup-total')).toHaveLength(0);
    expect(again.filter(r => r.dataset.testid === 'milk-row-day')).toHaveLength(6);
  });
  it('one farm shown: no farm label on total rows', () => {
    seedBase();
    mergeRemote('milkPickups', [pickup('p1', at(11, 9, 6), 300), pickup('p2', at(11, 11, 6), 400)]);
    const rows = buildMilkRows({ view: 'all', from: '2026-11-01', to: '2026-11-30', farmId: null, groupIds: [], unitSystem: 'imperial' });
    expect(rows.some(r => r.querySelector('[data-testid="milk-row-farm"]'))).toBe(false);
  });
  it('first pickup on its date; the 400 lb pickup splits 200 est. over Nov 10 and Nov 11 (+ calf)', () => {
    const pickups = [pickup('p1', at(11, 9, 6), 300), pickup('p2', at(11, 11, 6), 400)];
    const feedings = [feeding('f1', at(11, 11, 7), 10)];
    const days = spreadDailyTotals(pickups, feedings);
    expect(days.get('2026-11-09')).toMatchObject({ pickupKg: 300, estimated: false });
    expect(days.get('2026-11-10')).toMatchObject({ pickupKg: 200, estimated: true, calfKg: 0 });
    expect(days.get('2026-11-11').pickupKg).toBe(200);
    expect(days.get('2026-11-11').estimated).toBe(true);
    expect(days.get('2026-11-11').totalKg).toBeCloseTo(200 + 10 * 1.0305073, 6);
  });
  it('two pickups on the same date both count on that date; farms are isolated', () => {
    const days = spreadDailyTotals([
      pickup('p1', at(11, 9, 6), 300), pickup('p2', at(11, 9, 18), 100),
      pickup('q1', at(11, 5, 6), 50, FARM2), pickup('q2', at(11, 9, 6), 80, FARM2),
    ], []);
    // FARM: 400 on Nov 9. FARM2: 80 spread over Nov 6–9 (20/day) + its first on Nov 5.
    expect(days.get('2026-11-09').pickupKg).toBeCloseTo(400 + 20, 6);
    expect(days.get('2026-11-06').pickupKg).toBeCloseTo(20, 6);
    expect(days.get('2026-11-05').pickupKg).toBe(50);
    const farmOnly = spreadDailyTotals([pickup('p1', at(11, 9, 6), 300), pickup('p2', at(11, 9, 18), 100)], []);
    expect(farmOnly.get('2026-11-09')).toMatchObject({ pickupKg: 400, estimated: false });
    expect(farmOnly.has('2026-11-06')).toBe(false);
  });
  it('switching the setting re-renders without changing records', async () => {
    seedBase({ totals: 'per_pickup' });
    mergeRemote('milkPickups', [pickup('p1', at(11, 9, 6), 300), pickup('p2', at(11, 11, 6), 400)]);
    const before = JSON.stringify(getAll('milkPickups'));
    const c = document.createElement('div'); document.body.appendChild(c);
    renderMilkScreen(c);
    // the page range defaults to the last 14 days; widen it
    const from = c.querySelector('[data-testid="milk-from"]');
    from.value = '2026-11-01'; from.dispatchEvent(new Event('change'));
    const to = c.querySelector('[data-testid="milk-to"]');
    to.value = '2026-11-30'; to.dispatchEvent(new Event('change'));
    expect(c.querySelectorAll('[data-testid="milk-row-pickup-total"]')).toHaveLength(2);
    expect(c.querySelectorAll('[data-testid="milk-row-day"]')).toHaveLength(0);
    update('farmSettings', 'fs1', { milkTotalsMode: 'spread_daily' }, FarmSetting.validate, FarmSetting.toSupabaseShape, 'farm_settings');
    await Promise.resolve(); // store notifications drain on a microtask
    expect(c.querySelectorAll('[data-testid="milk-row-pickup-total"]')).toHaveLength(0);
    const dayRows = [...c.querySelectorAll('[data-testid="milk-row-day"]')];
    expect(dayRows).toHaveLength(3);
    expect(dayRows.filter(r => r.textContent.includes('est.'))).toHaveLength(2);
    expect(JSON.stringify(getAll('milkPickups'))).toBe(before);
  });
});

describe('9 · backup at 51', () => {
  it('a 50 backup gets empty tables, the farm_settings defaults and is_milking false', async () => {
    const old = {
      schema_version: 50,
      tables: { operations: [{ id: OP, schema_version: 50 }], farm_settings: [{ id: 'fs', farm_id: FARM }], groups: [{ id: 'g', name: 'Herd' }] },
    };
    BACKUP_MIGRATIONS[50](old);
    expect(old.schema_version).toBe(51);
    expect(old.tables.milk_pickups).toEqual([]);
    expect(old.tables.calf_milk_feedings).toEqual([]);
    expect(old.tables.farm_settings[0]).toMatchObject({ dairy_mode: 'auto', milk_kg_per_l: 1.0305073, milk_grazing_offset_days: 1, milk_totals_mode: 'per_pickup' });
    expect(old.tables.groups[0].is_milking).toBe(false);
    // absent-only: present values survive
    const keep = { schema_version: 50, tables: { operations: [], farm_settings: [{ id: 'fs', dairy_mode: 'on' }], groups: [{ id: 'g', is_milking: true }] } };
    BACKUP_MIGRATIONS[50](keep);
    expect(keep.tables.farm_settings[0].dairy_mode).toBe('on');
    expect(keep.tables.groups[0].is_milking).toBe(true);
  });
  it('a 50 backup restores at 51 with both tables empty', async () => {
    setSyncAdapter(new CustomSync());
    expect(CURRENT_SCHEMA_VERSION).toBe(51);
    db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 51 }];
    const backup = { format: 'gtho-v2-backup', format_version: 1, schema_version: 50, operation_id: OP, tables: { operations: [{ id: OP, name: 'Farm', schema_version: 50 }] } };
    const result = await importOperationBackup(backup, OP, null, { skipAutoBackup: true });
    expect(result, result.error).toMatchObject({ success: true });
    expect(db.rows.milk_pickups || []).toEqual([]);
    expect(db.rows.calf_milk_feedings || []).toEqual([]);
  });
  it('export → import at 51 keeps the rows and the flags', async () => {
    setSyncAdapter(new CustomSync());
    const p = MilkPickup.toSupabaseShape(pickup('11111111-0000-4000-8000-000000000001', at(11, 9, 6), 300));
    const f = CalfMilk.toSupabaseShape(feeding('11111111-0000-4000-8000-000000000002', at(11, 9, 17), 10));
    const g = { ...Group.toSupabaseShape(Group.create({ id: '11111111-0000-4000-8000-000000000003', operationId: OP, name: 'Milkers', isMilking: true })) };
    db.rows.operations = [{ id: OP, name: 'Farm', schema_version: 51 }];
    db.rows.milk_pickups = [p, { ...p, id: 'other', operation_id: 'someone-else' }];
    db.rows.calf_milk_feedings = [f];
    db.rows.groups = [g];
    const backup = JSON.parse((await exportOperationBackup(OP)).json);
    expect(backup.tables.milk_pickups).toEqual([p]);
    expect(backup.tables.calf_milk_feedings).toEqual([f]);
    expect(backup.tables.groups.find(r => r.id === g.id).is_milking).toBe(true);
    db.rows.milk_pickups = [{ ...p, id: 'stale' }];
    db.rows.calf_milk_feedings = [];
    db.rows.groups = [];
    const result = await importOperationBackup(backup, OP, null, { skipAutoBackup: true });
    expect(result, result.error).toMatchObject({ success: true });
    expect(db.rows.milk_pickups.filter(r => r.operation_id === OP)).toEqual([p]);
    expect(db.rows.calf_milk_feedings).toEqual([f]);
    expect(db.rows.groups.find(r => r.id === g.id).is_milking).toBe(true);
  });
});

describe('10 · sync, backup and export include both tables at 51', () => {
  it('both tables are released, in the backup table list after their parents, and push from the store', () => {
    seedBase();
    for (const table of ['milk_pickups', 'calf_milk_feedings']) {
      expect(isTableReleased(table, RELEASED_SCHEMA_VERSION)).toBe(true);
      expect(BACKUP_TABLES[table]).toEqual({ paginate: true });
      for (const parent of ['operations', 'farms', 'groups']) expect(FK_ORDER.indexOf(table)).toBeGreaterThan(FK_ORDER.indexOf(parent));
    }
    const p = pickup('22222222-0000-4000-8000-000000000001', at(11, 9, 6), 300);
    const f = feeding('22222222-0000-4000-8000-000000000002', at(11, 9, 17), 10);
    mergeRemote('milkPickups', [p]);
    mergeRemote('calfMilkFeedings', [f]);
    expect(localSupabaseRow('milk_pickups', p.id)).toEqual(MilkPickup.toSupabaseShape(p));
    expect(localSupabaseRow('calf_milk_feedings', f.id)).toEqual(CalfMilk.toSupabaseShape(f));
  });

  it('pulls milk_pickups and calf_milk_feedings once released', async () => {
    const { pullAllRemote } = await import('../../src/data/pull-remote.js');
    const pulled = [];
    setSyncAdapter({ isOnline: async () => true, pullAll: async table => { pulled.push(table); return []; }, flush: async () => {}, push: () => {}, getQueuedItems: () => [], getDeadLetters: () => [] });
    await pullAllRemote();
    expect(pulled).toContain('milk_pickups');
    expect(pulled).toContain('calf_milk_feedings');
  });
});

describe('11 · phone quick actions', () => {
  it('dairy tiles are offered only while visible; never-customised users get them by default', () => {
    expect(availableFieldModules(false).some(m => m.key === 'milkpickup')).toBe(false);
    expect(availableFieldModules(true).filter(m => m.dairy).map(m => m.key)).toEqual(['milkpickup', 'feedcalves']);
    expect(resolveFieldModuleKeys(null, true)).toEqual([...FIELD_MODULES_DEFAULT, 'milkpickup', 'feedcalves']);
    expect(resolveFieldModuleKeys(null, false)).toEqual(FIELD_MODULES_DEFAULT);
    // A customised list is kept as chosen (no auto-add), and dairy keys drop while hidden.
    expect(resolveFieldModuleKeys(['feed'], true)).toEqual(['feed']);
    expect(resolveFieldModuleKeys(['feed', 'milkpickup'], true)).toEqual(['feed', 'milkpickup']);
    expect(resolveFieldModuleKeys(['feed', 'milkpickup'], false)).toEqual(['feed']);
  });
  it('the Dairy settings card renders at 51 with the three choices', () => {
    seedBase();
    const card = renderDairySettingsCard(getById('farmSettings', 'fs1'));
    expect(card).toBeTruthy();
    expect(card.querySelector('[data-testid="settings-dairy-mode"]').value).toBe('auto');
    expect(card.querySelector('[data-testid="settings-milk-density"]').value).toBe('8.60');
    expect(card.querySelector('[data-testid="settings-milk-totals"]').value).toBe('per_pickup');
    expect(card.textContent).toContain('Spread over days since last pickup');
    card.querySelector('[data-testid="settings-milk-totals"]').value = 'spread_daily';
    card.querySelector('[data-testid="settings-dairy-save"]').click();
    expect(getById('farmSettings', 'fs1')).toMatchObject({ milkTotalsMode: 'spread_daily', milkKgPerL: 1.0305073 });
  });
  it('recent drivers: 5 most recent distinct', () => {
    const ps = ['A', 'B', 'a', 'C', 'D', 'E', 'F'].map((d, i) => pickup(`p${i}`, at(11, 1 + i, 6), 1, FARM, { driver: d }));
    expect(recentDrivers(ps)).toEqual(['F', 'E', 'D', 'C', 'a']);
  });
});
