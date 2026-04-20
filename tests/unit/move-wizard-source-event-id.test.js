/**
 * @file OI-0122 — `sourceEventId` is always set on new events created by a
 * rotation, regardless of whether the destination farm equals the source
 * farm. The DMI-8 chart's date-routing bridge (dmi-chart-context.js:140-142)
 * depends on this link to back-fill pre-start days from the prior event's
 * cascade. The display-side "← Moved from {farm}" banner at
 * events/index.js:346 is already farm-id gated, so same-farm rotations won't
 * trigger a spurious banner.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openMoveWizard } from '../../src/features/events/move-wizard.js';

const OP = '00000000-0000-0000-0000-000000000aa1';
const FARM_A = '00000000-0000-0000-0000-000000000bb1';
const FARM_B = '00000000-0000-0000-0000-000000000bb2';
const SRC_LOC = '00000000-0000-0000-0000-000000000c11';
const DST_LOC_SAME = '00000000-0000-0000-0000-000000000c12'; // Farm A
const DST_LOC_CROSS = '00000000-0000-0000-0000-000000000c21'; // Farm B
const EVT = '00000000-0000-0000-0000-000000000d11';
const SRC_PW = '00000000-0000-0000-0000-000000000e11';
const GROUP = '00000000-0000-0000-0000-000000000f11';
const GW = '00000000-0000-0000-0000-000000000101';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM_A, operationId: OP, name: 'Farm A' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farms', FarmEntity.create({ id: FARM_B, operationId: OP, name: 'Farm B' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM_A, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM_B, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  for (const [id, farmId, name] of [
    [SRC_LOC, FARM_A, 'Source'],
    [DST_LOC_SAME, FARM_A, 'Dest same-farm'],
    [DST_LOC_CROSS, FARM_B, 'Dest cross-farm'],
  ]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM_A,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: SRC_PW, operationId: OP, eventId: EVT, locationId: SRC_LOC,
    dateOpened: '2026-04-01', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM_A, name: 'Group' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-04-01', headCount: 10, avgWeightKg: 450,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  for (let i = 0; i < 10; i++) {
    const aid = `00000000-0000-0000-0000-0000000a0${i.toString().padStart(2, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `A${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP,
      dateJoined: '2026-04-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
});

function driveSameFarm() {
  const event = { id: EVT, dateIn: '2026-04-01', dateOut: null };
  openMoveWizard(event, OP, FARM_A, {});
  // Step 1: dest type "new"
  document.querySelector('[data-testid="move-wizard-dest-new"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  // Step 2: pick same-farm destination (destFarmId defaults to source farm)
  document.querySelector(`[data-testid="location-picker-item-${DST_LOC_SAME}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
  // Step 3: save
  document.querySelector('[data-testid="move-wizard-save"]').click();
}

function driveCrossFarm() {
  const event = { id: EVT, dateIn: '2026-04-01', dateOut: null };
  openMoveWizard(event, OP, FARM_A, {});
  document.querySelector('[data-testid="move-wizard-dest-new"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  // Step 2: switch destination farm to Farm B via the farm-select dropdown
  const farmSelect = document.querySelector('[data-testid="move-wizard-farm-select"]');
  farmSelect.value = FARM_B;
  farmSelect.dispatchEvent(new Event('change', { bubbles: true }));
  // After re-render, pick cross-farm location
  document.querySelector(`[data-testid="location-picker-item-${DST_LOC_CROSS}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
  document.querySelector('[data-testid="move-wizard-save"]').click();
}

describe('Move wizard — sourceEventId population (OI-0122)', () => {
  it('same-farm rotation sets sourceEventId on the new event', () => {
    driveSameFarm();
    const newEvents = getAll('events').filter(e => e.id !== EVT);
    expect(newEvents.length).toBe(1);
    expect(newEvents[0].sourceEventId).toBe(EVT);
    expect(newEvents[0].farmId).toBe(FARM_A);
  });

  it('cross-farm rotation sets sourceEventId and uses the destination farm', () => {
    driveCrossFarm();
    const newEvents = getAll('events').filter(e => e.id !== EVT);
    expect(newEvents.length).toBe(1);
    expect(newEvents[0].sourceEventId).toBe(EVT);
    expect(newEvents[0].farmId).toBe(FARM_B);
  });
});
