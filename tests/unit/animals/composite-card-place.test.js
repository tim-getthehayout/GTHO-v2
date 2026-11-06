/** @file Composite group-card average and Place group save. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import en from '../../../src/i18n/locales/en.json';
import { setUnitSystem } from '../../../src/utils/preferences.js';
import { getLiveWindowAvgWeight, latestWeightForAnimal } from '../../../src/calcs/window-helpers.js';
import { renderAnimalsScreen } from '../../../src/features/animals/index.js';
import { renderDashboard } from '../../../src/features/dashboard/index.js';
import { openPlaceWizard } from '../../../src/features/events/place-wizard.js';
import '../../../src/calcs/core.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as ClassEntity from '../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as WeightEntity from '../../../src/entities/animal-weight-record.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LAND = '00000000-0000-0000-0000-0000000000c1';
const CLASS = '00000000-0000-0000-0000-0000000000d1';
const GROUP = '00000000-0000-0000-0000-0000000000e1';
const LOT = '00000000-0000-0000-0000-0000000000f1';
const LOT_KG = 45.35929094356398;

beforeAll(() => setLocale('en', en));

function seed({ recoveryRequired = false, dateJoined = '2026-01-01' } = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  localStorage.setItem('gtho_v2_home_view_mode', 'groups');

  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  setUnitSystem('imperial');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({
    operationId: OP, farmId: FARM, recoveryRequired,
  }), FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LAND, operationId: OP, farmId: FARM, name: 'East', type: 'land', landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('animalClasses', ClassEntity.create({
    id: CLASS, operationId: OP, name: 'Doe', species: 'goat', role: 'doe', defaultWeightKg: 59,
  }), ClassEntity.validate, ClassEntity.toSupabaseShape, 'animal_classes');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Goats' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('animals', AnimalEntity.create({
    id: LOT, operationId: OP, name: 'Goat Breeding Stock', sex: 'female', classId: CLASS,
    isBulk: true, bulkHeadCount: 59,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId: LOT, groupId: GROUP, dateJoined, reason: 'initial',
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  add('animalWeightRecords', WeightEntity.create({
    operationId: OP, animalId: LOT, recordedAt: '2026-11-06T12:26:36.668Z', weightKg: LOT_KG, source: 'manual',
  }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');
}

describe('composite group average', () => {
  beforeEach(() => seed());

  it('uses the latest recordedAt weight as the lot total, divided by head', () => {
    const avg = getLiveWindowAvgWeight(
      { groupId: GROUP, dateLeft: null },
      {
        memberships: getAll('animalGroupMemberships'),
        animals: getAll('animals'),
        animalClasses: getAll('animalClasses'),
        animalWeightRecords: [
          { animalId: LOT, date: '2026-01-01', weightKg: 10, recordedAt: '2026-01-01T00:00:00Z' },
          { animalId: LOT, recordedAt: '2026-11-06T12:26:36.668Z', weightKg: LOT_KG },
        ],
        now: '2026-11-06',
      },
    );
    expect(avg).toBeCloseTo(LOT_KG / 59, 6);
    expect(latestWeightForAnimal(getAll('animalWeightRecords'), LOT, '2026-11-06').weightKg).toBe(LOT_KG);
  });

  it('shows that per-head average on the animals group tile and the dashboard group card', () => {
    const animalsRoot = document.createElement('div');
    document.body.appendChild(animalsRoot);
    renderAnimalsScreen(animalsRoot);
    const tile = document.querySelector(`[data-testid="group-tile-${GROUP}"]`).textContent;
    expect(tile).toContain('59 head');
    expect(tile).toContain('avg 2 lbs');
    expect(tile).not.toContain('lbs lbs');

    const dash = document.createElement('div');
    document.body.appendChild(dash);
    renderDashboard(dash);
    document.querySelector('[data-testid="toggle-groups"]').click();
    const card = document.querySelector(`[data-testid="dashboard-group-card-${GROUP}"]`).textContent;
    expect(card).toContain('59 head');
    expect(card).toContain('avg 2 lbs');
    expect(card).toContain('59 female');
  });
});

describe('place a composite-only group', () => {
  it('does not write an event when required pre-graze fields are empty', () => {
    seed({ recoveryRequired: true });
    openPlaceWizard(GROUP, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${LAND}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    document.querySelector('[data-testid="place-wizard-save"]').click();

    expect(getAll('events')).toHaveLength(0);
    expect(getAll('eventGroupWindows')).toHaveLength(0);
    expect(document.querySelector('[data-testid="place-wizard-status"]').textContent)
      .toMatch(/not placed/i);
  });

  it('places the group once height and cover are entered, with head count 59', () => {
    seed({ recoveryRequired: true });
    openPlaceWizard(GROUP, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${LAND}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    document.querySelector('[data-testid="obs-card-forage-height"]').value = '6';
    document.querySelector('[data-testid="obs-card-forage-cover"]').value = '80';
    document.querySelector('[data-testid="place-wizard-save"]').click();

    const events = getAll('events');
    expect(events).toHaveLength(1);
    const gws = getAll('eventGroupWindows').filter(w => w.eventId === events[0].id);
    expect(gws).toHaveLength(1);
    expect(gws[0].groupId).toBe(GROUP);
    expect(gws[0].headCount).toBe(59);
    expect(gws[0].avgWeightKg).toBeCloseTo(LOT_KG / 59, 6);
  });

  it('does not create an event when the place date is before every membership', () => {
    seed({ dateJoined: '2026-11-06' });
    openPlaceWizard(GROUP, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${LAND}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    const dateInput = document.querySelector('[data-testid="place-wizard-date-in"]');
    dateInput.value = '2026-11-01';
    dateInput.dispatchEvent(new Event('input'));
    document.querySelector('[data-testid="place-wizard-save"]').click();

    expect(getAll('events')).toHaveLength(0);
    expect(getAll('eventGroupWindows')).toHaveLength(0);
    expect(document.querySelector('[data-testid="place-wizard-status"]').textContent)
      .toMatch(/not placed/i);
  });
});
