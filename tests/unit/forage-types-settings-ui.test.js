/**
 * @file OI-0125 / SP-13 — Forage Types Settings card + Edit sheet.
 *
 * Covers the acceptance criteria in SP-13:
 *   - List renders one row per non-archived forage type for the active op
 *   - `+ Add` opens the sheet in Add mode; Save inserts a new row with
 *     `is_seeded = false` and the row appears in the list after save
 *   - Edit on a seeded row pre-fills the sheet; Save preserves `is_seeded`
 *   - Delete-guard blocks when any `locations.forageTypeId` references the row
 *   - Round-trip: imperial `3.0 in` for Min Residual stores `7.62 cm`, reloads as `3.0`
 *   - Round-trip: imperial `300` for DM per inch per acre stores `132.36 kg/cm/ha`
 *     (via `DM_LBS_IN_AC_TO_KG_CM_HA = 0.4412`), reloads as `300`
 *   - Metric user sees native metric values unchanged
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll, getById, getOperation } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as ForageTypeEntity from '../../src/entities/forage-type.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as UserPrefEntity from '../../src/entities/user-preference.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';

import { renderSettingsScreen } from '../../src/features/settings/index.js';
import { openForageTypeSheet } from '../../src/features/settings/forage-type-sheet.js';

const OP = '00000000-0000-0000-0000-000000000aa1';
const FARM = '00000000-0000-0000-0000-000000000bb1';
const FT_SEEDED = '00000000-0000-0000-0000-000000000cc1';
const FT_CUSTOM = '00000000-0000-0000-0000-000000000cc2';
const LOC = '00000000-0000-0000-0000-000000000dd1';

beforeAll(() => setLocale('en', enLocale));

function seed({ unitSystem = 'imperial' } = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('userPreferences', UserPrefEntity.create({
    userId: 'test-user', operationId: OP,
  }), UserPrefEntity.validate, UserPrefEntity.toSupabaseShape, 'user_preferences');
  add('forageTypes', ForageTypeEntity.create({
    id: FT_SEEDED, operationId: OP, name: 'Mixed Grass',
    dmPct: 35, nPerTonneDm: 24, pPerTonneDm: 3, kPerTonneDm: 20,
    dmKgPerCmPerHa: 110, minResidualHeightCm: 7.62, utilizationPct: 65,
    isSeeded: true,
  }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
}

function rootContainer() {
  const c = document.createElement('div');
  document.body.appendChild(c);
  return c;
}

describe('OI-0125 — Forage Types Settings card', () => {
  beforeEach(() => seed());

  it('renders a row for each non-archived forage type with seeded badge', () => {
    const c = rootContainer();
    renderSettingsScreen(c);
    const row = c.querySelector(`[data-testid="settings-forage-row-${FT_SEEDED}"]`);
    expect(row, 'row for seeded forage should render').toBeTruthy();
    expect(row.textContent).toContain('Mixed Grass');
    const badge = c.querySelector(`[data-testid="settings-forage-seeded-${FT_SEEDED}"]`);
    expect(badge, 'seeded badge should render on seeded row').toBeTruthy();
  });

  it('+ Add opens the sheet in Add mode (no seeded badge, empty fields)', () => {
    const c = rootContainer();
    renderSettingsScreen(c);
    c.querySelector('[data-testid="settings-forage-add"]').click();
    // Sheet is now open (markup lives under settings sections in DOM).
    const nameInput = document.querySelector('[data-testid="forage-sheet-name"]');
    expect(nameInput, 'Add sheet name input should exist').toBeTruthy();
    expect(nameInput.value).toBe('');
    // Seeded badge must NOT appear in Add mode.
    expect(document.querySelector('[data-testid="forage-sheet-seeded-badge"]')).toBeFalsy();
  });

  it('save empty name → inline error, no row added', () => {
    const c = rootContainer();
    renderSettingsScreen(c);
    c.querySelector('[data-testid="settings-forage-add"]').click();
    document.querySelector('[data-testid="forage-sheet-save"]').click();
    const status = document.querySelector('[data-testid="forage-sheet-status"]');
    expect(status.textContent).toMatch(/required/i);
    // Store unchanged.
    expect(getAll('forageTypes').length).toBe(1);
  });

  it('save a new forage type inserts with isSeeded=false and appears in list', () => {
    const c = rootContainer();
    renderSettingsScreen(c);
    c.querySelector('[data-testid="settings-forage-add"]').click();
    document.querySelector('[data-testid="forage-sheet-name"]').value = 'DEBL Mixed Pasture';
    document.querySelector('[data-testid="forage-sheet-dmPct"]').value = '35';
    document.querySelector('[data-testid="forage-sheet-save"]').click();
    const fresh = getAll('forageTypes').find(f => f.name === 'DEBL Mixed Pasture');
    expect(fresh).toBeTruthy();
    expect(fresh.isSeeded).toBe(false);
    expect(fresh.operationId).toBe(OP);
    // List re-renders via subscribe.
    const row = c.querySelector(`[data-testid="settings-forage-row-${fresh.id}"]`);
    expect(row).toBeTruthy();
  });

  it('edit a seeded row preserves isSeeded=true on save', () => {
    const c = rootContainer();
    renderSettingsScreen(c);
    c.querySelector(`[data-testid="settings-forage-edit-${FT_SEEDED}"]`).click();
    const nameInput = document.querySelector('[data-testid="forage-sheet-name"]');
    nameInput.value = 'Mixed Grass (edited)';
    document.querySelector('[data-testid="forage-sheet-save"]').click();
    const refreshed = getById('forageTypes', FT_SEEDED);
    expect(refreshed.name).toBe('Mixed Grass (edited)');
    expect(refreshed.isSeeded).toBe(true);
  });

  it('delete-guard blocks when a location references the forage type', () => {
    add('forageTypes', ForageTypeEntity.create({
      id: FT_CUSTOM, operationId: OP, name: 'Custom', isSeeded: false,
    }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
    add('locations', LocationEntity.create({
      id: LOC, operationId: OP, farmId: FARM, name: 'G1',
      type: 'land', landUse: 'pasture', areaHectares: 2, forageTypeId: FT_CUSTOM,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    const c = rootContainer();
    renderSettingsScreen(c);
    let alertedWith = null;
    const origAlert = window.alert;
    window.alert = (msg) => { alertedWith = msg; };
    try {
      c.querySelector(`[data-testid="settings-forage-delete-${FT_CUSTOM}"]`).click();
    } finally {
      window.alert = origAlert;
    }
    expect(alertedWith).toMatch(/in use|cannot delete/i);
    expect(getById('forageTypes', FT_CUSTOM), 'row should still exist').toBeTruthy();
  });

  it('delete proceeds when no location references the forage type (confirm true)', () => {
    add('forageTypes', ForageTypeEntity.create({
      id: FT_CUSTOM, operationId: OP, name: 'Unused', isSeeded: false,
    }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
    const c = rootContainer();
    renderSettingsScreen(c);
    const origConfirm = window.confirm;
    window.confirm = () => true;
    try {
      c.querySelector(`[data-testid="settings-forage-delete-${FT_CUSTOM}"]`).click();
    } finally {
      window.confirm = origConfirm;
    }
    expect(getById('forageTypes', FT_CUSTOM)).toBeFalsy();
  });

  it('imperial round-trip: enter 3.0 in for Min Residual → store 7.62 cm → re-display 3.0', () => {
    const c = rootContainer();
    renderSettingsScreen(c);
    openForageTypeSheet(null, OP);
    document.querySelector('[data-testid="forage-sheet-name"]').value = 'Roundtrip test';
    document.querySelector('[data-testid="forage-sheet-minResidualHeightCm"]').value = '3.0';
    document.querySelector('[data-testid="forage-sheet-save"]').click();
    const fresh = getAll('forageTypes').find(f => f.name === 'Roundtrip test');
    expect(fresh.minResidualHeightCm).toBeCloseTo(7.62, 2);
    // Reopen — display must read "3.0" in.
    openForageTypeSheet(fresh, OP);
    const rehydrated = document.querySelector('[data-testid="forage-sheet-minResidualHeightCm"]');
    expect(rehydrated.value).toBe('3.0');
  });

  it('imperial round-trip: enter 300 lbs/in/ac for DM yield → store 132.36 kg/cm/ha → re-display 300', () => {
    const c = rootContainer();
    renderSettingsScreen(c);
    openForageTypeSheet(null, OP);
    document.querySelector('[data-testid="forage-sheet-name"]').value = 'DM yield test';
    document.querySelector('[data-testid="forage-sheet-dmKgPerCmPerHa"]').value = '300';
    document.querySelector('[data-testid="forage-sheet-save"]').click();
    const fresh = getAll('forageTypes').find(f => f.name === 'DM yield test');
    // DM_LBS_IN_AC_TO_KG_CM_HA = 0.4412 → 300 × 0.4412 = 132.36.
    expect(fresh.dmKgPerCmPerHa).toBeCloseTo(132.36, 2);
    openForageTypeSheet(fresh, OP);
    const rehydrated = document.querySelector('[data-testid="forage-sheet-dmKgPerCmPerHa"]');
    expect(rehydrated.value).toBe('300');
  });

  it('metric round-trip: values stored unchanged, display unchanged (no conversion loss)', () => {
    seed({ unitSystem: 'metric' });
    expect(getOperation()?.unitSystem).toBe('metric');
    const c = rootContainer();
    renderSettingsScreen(c);
    c.querySelector(`[data-testid="settings-forage-edit-${FT_SEEDED}"]`).click();
    const residualInput = document.querySelector('[data-testid="forage-sheet-minResidualHeightCm"]');
    // Seeded row stored 7.62; metric display uses 1 decimal → "7.6".
    expect(residualInput.value).toBe('7.6');
    const dmYieldInput = document.querySelector('[data-testid="forage-sheet-dmKgPerCmPerHa"]');
    // Seeded row stored 110; metric precision 1 → "110.0".
    expect(dmYieldInput.value).toBe('110.0');
  });
});
