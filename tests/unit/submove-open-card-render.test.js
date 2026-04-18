/**
 * @file Regression — sub-move Open sheet actually renders the pre-graze card
 * in the live DOM (OI-0112 surface #4). Complements the card-unit tests by
 * driving the public sheet entry point.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openSubmoveOpenSheet } from '../../src/features/events/submove.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000cc';
const EVENT_ID = '00000000-0000-0000-0000-0000000000dd';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM,
    name: 'North 40', type: 'land', landUse: 'pasture', areaHectares: 8,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
});

describe('Sub-move Open sheet renders the pre-graze card (OI-0112 regression)', () => {
  it('pre-graze card container appears inside the submove panel', () => {
    openSubmoveOpenSheet({ id: EVENT_ID }, OP);
    const panel = document.getElementById('submove-open-sheet-panel');
    expect(panel).toBeTruthy();
    const card = panel.querySelector('[data-testid="obs-pre-graze-card"]');
    expect(card, 'obs-pre-graze-card should render inside submove Open sheet').toBeTruthy();
    // Every pre-graze field testid should be present.
    expect(card.querySelector('[data-testid="obs-card-forage-height"]')).toBeTruthy();
    expect(card.querySelector('[data-testid="obs-card-forage-cover"]')).toBeTruthy();
    expect(card.querySelector('[data-testid="obs-card-bale-ring"]')).toBeTruthy();
    expect(card.querySelector('[data-testid="obs-card-forage-quality"]')).toBeTruthy();
    expect(card.querySelector('[data-testid="obs-card-condition-good"]')).toBeTruthy();
    expect(card.querySelector('[data-testid="obs-card-notes"]')).toBeTruthy();
  });
});
