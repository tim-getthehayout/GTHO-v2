/**
 * @file OI-0114 NC-1 — sub-move Open BRC auto-fill is reactive to late-bound location.
 *
 * Before the fix: renderPreGrazeCard was rendered with paddockAcres: null (the
 * farmer hasn't picked a location yet), _shared.js computed brcAvailable=false
 * once at render time, and the bale-ring listener was never attached. Typing a
 * ring count did nothing on this surface.
 *
 * After: renderForageStateRow exposes setPaddockAcres() and always attaches
 * the listener (active state is mutable). renderLocationPicker fires an
 * optional onSelect callback. submove.js wires the two together.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
// BRC-1 calc registration side-effect.
import '../../src/calcs/survey-bale-ring.js';
import { openSubmoveOpenSheet } from '../../src/features/events/submove.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000cc';
const EVT = '00000000-0000-0000-0000-0000000000dd';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({
    farmId: FARM, operationId: OP,
    baleRingResidueDiameterCm: 365.76,  // = 12 ft exactly (v1 default).
  }), FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  // 1 ha ≈ 2.47 acres — enough paddock for BRC-1 to yield < 100% cover.
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'North 40',
    type: 'land', landUse: 'pasture', areaHectares: 1.0,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
});

describe('Sub-move Open BRC — reactive late-bind (OI-0114 NC-1)', () => {
  it('helper note starts inactive before a location is picked', () => {
    openSubmoveOpenSheet({ id: EVT }, OP);
    const helper = document.querySelector('[data-testid="obs-card-bale-ring-helper"]');
    expect(helper).toBeTruthy();
    // Inactive copy contains "Set the bale-ring diameter in Settings".
    expect(helper.textContent).toMatch(/Set the bale-ring diameter/);
  });

  it('typing a ring count before location pick does nothing to cover', () => {
    openSubmoveOpenSheet({ id: EVT }, OP);
    const baleRing = document.querySelector('[data-testid="obs-card-bale-ring"]');
    const cover = document.querySelector('[data-testid="obs-card-forage-cover"]');
    baleRing.value = '14';
    baleRing.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cover.value).toBe('');
  });

  it('picking a location flips helper note to the active text with ft + acres', () => {
    openSubmoveOpenSheet({ id: EVT }, OP);
    const item = document.querySelector(`[data-testid="location-picker-item-${LOC}"]`);
    expect(item).toBeTruthy();
    item.click();
    const helper = document.querySelector('[data-testid="obs-card-bale-ring-helper"]');
    // Active copy names the ring diameter and paddock acres.
    expect(helper.textContent).toMatch(/12\.0 ft/);
    expect(helper.textContent).toMatch(/2\.47 ac/);
  });

  it('after location pick, typing a ring count populates cover via BRC-1', () => {
    openSubmoveOpenSheet({ id: EVT }, OP);
    document.querySelector(`[data-testid="location-picker-item-${LOC}"]`).click();
    const baleRing = document.querySelector('[data-testid="obs-card-bale-ring"]');
    const cover = document.querySelector('[data-testid="obs-card-forage-cover"]');
    baleRing.value = '14';
    baleRing.dispatchEvent(new Event('input', { bubbles: true }));
    // 14 rings × 12 ft diameter × 2.47 acres. BRC-1 yields a cover pct;
    // just assert it populated with a plausible integer 0–100.
    const pct = parseInt(cover.value, 10);
    expect(Number.isInteger(pct)).toBe(true);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('late-bind: ring count typed BEFORE location pick auto-fills cover on pick', () => {
    openSubmoveOpenSheet({ id: EVT }, OP);
    // Type a ring count first (helper is inactive; cover stays empty).
    const baleRing = document.querySelector('[data-testid="obs-card-bale-ring"]');
    baleRing.value = '14';
    baleRing.dispatchEvent(new Event('input', { bubbles: true }));
    const cover = document.querySelector('[data-testid="obs-card-forage-cover"]');
    expect(cover.value).toBe('');
    // Now pick a location — setPaddockAcres runs the calc retroactively.
    document.querySelector(`[data-testid="location-picker-item-${LOC}"]`).click();
    const pct = parseInt(cover.value, 10);
    expect(Number.isInteger(pct)).toBe(true);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('preview chip activates after location pick + ring count', () => {
    openSubmoveOpenSheet({ id: EVT }, OP);
    document.querySelector(`[data-testid="location-picker-item-${LOC}"]`).click();
    const baleRing = document.querySelector('[data-testid="obs-card-bale-ring"]');
    baleRing.value = '14';
    baleRing.dispatchEvent(new Event('input', { bubbles: true }));
    const chip = document.querySelector('[data-testid="obs-card-brc-preview"]');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toMatch(/\u2248/); // ≈ symbol
    expect(chip.textContent).toMatch(/% cover/);
  });
});
