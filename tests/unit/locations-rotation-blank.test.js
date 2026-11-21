/** @file Regression: Locations + rotation management must render (blank-screen TDZ). */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';

const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const LOC = '00000000-0000-4000-8000-0000000000c1';

beforeAll(() => setLocale('en', enLocale));

function seedPasture() {
  _reset();
  localStorage.clear();
  resetCalendarState();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'North Pasture',
    type: 'land', landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

describe('locations + rotation blank-screen regression', () => {
  beforeEach(seedPasture);

  it('does not redeclare readiness in a way that TDZ-crashes the future block', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).not.toMatch(/const readiness\s*=\s*readiness\s*\|\|/);
    expect(src).toMatch(/const readinessState\s*=\s*readiness\s*\|\|/);
  });

  it('renderCalendarGrid paints the management surface for a pasture location', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    expect(() => renderCalendarGrid(container)).not.toThrow();
    expect(container.querySelector('[data-testid="calendar-grid"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="loc-mgmt-row"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="loc-mgmt-metrics"]')).toBeTruthy();
    expect(container.textContent).toContain('North Pasture');
  });
});
