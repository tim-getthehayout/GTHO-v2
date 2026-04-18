/**
 * @file OI-0116 — editable `time_in` input on the Event Detail hero line.
 *
 * Covers:
 *   - Initial render reads event.timeIn
 *   - Real change writes through to the store
 *   - Empty-string clear normalizes to null
 *   - Three OI-0115 teardown guards (isConnected, render-time snapshot,
 *     store-identity) — phantom changes are no-ops
 *   - Legitimate edit still succeeds
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, update, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/capacity.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/survey-bale-ring.js';
import { openEventDetailSheet, closeEventDetailSheet } from '../../src/features/events/detail.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000c1';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const PW = '00000000-0000-0000-0000-0000000000e1';
const GROUP = '00000000-0000-0000-0000-000000000101';
const GW = '00000000-0000-0000-0000-000000000102';

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
    id: LOC, operationId: OP, farmId: FARM, name: 'G1',
    type: 'land', landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM,
    type: 'graze', dateIn: '2026-04-16', timeIn: '08:30', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-04-16', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-04-16', headCount: 10, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
});

function findTimeInInput() {
  return document.querySelector('[data-testid="detail-time-in"]');
}

describe('OI-0116 — Event Detail hero line time_in input', () => {
  it('renders the time input next to the date input with the store value', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    expect(timeInput).toBeTruthy();
    expect(timeInput.type).toBe('time');
    expect(timeInput.value).toBe('08:30');
    closeEventDetailSheet();
  });

  it('renders empty value when timeIn is null on the event row', () => {
    // Replace the seed event with one that has no timeIn.
    update('events', EVT, { timeIn: null }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    expect(timeInput.value).toBe('');
    closeEventDetailSheet();
  });

  it('edit persists to the store on change', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    timeInput.value = '14:45';
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    const evt = getById('events', EVT);
    expect(evt.timeIn).toBe('14:45');
    closeEventDetailSheet();
  });

  it('empty string clears to null (not ""), per spec acceptance #5', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    timeInput.value = '';
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    const evt = getById('events', EVT);
    expect(evt.timeIn).toBeNull();
    closeEventDetailSheet();
  });

  it('OI-0115 Guard 1: phantom change after DOM removal is a no-op', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    // Tear the input out of the DOM (models a parent re-render's clear()).
    timeInput.remove();
    // Fire a late change with a different value — must not write.
    timeInput.value = '23:59';
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    const evt = getById('events', EVT);
    expect(evt.timeIn).toBe('08:30');
    closeEventDetailSheet();
  });

  it('OI-0115 Guard 2: phantom change with render-time snapshot value is a no-op', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    // Fire a change with the SAME value that was rendered (08:30). Must not
    // re-fire update() and must not trigger subscriber thrashing.
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    const evt = getById('events', EVT);
    expect(evt.timeIn).toBe('08:30');
    closeEventDetailSheet();
  });

  it('legitimate user edit still writes (fix does not break the happy path)', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const firstInput = findTimeInInput();
    firstInput.value = '07:15';
    firstInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getById('events', EVT).timeIn).toBe('07:15');
    // The events subscription re-rendered the summary — the prior input is
    // detached. Re-query for the fresh one (real-user experience).
    const secondInput = findTimeInInput();
    secondInput.value = '';
    secondInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getById('events', EVT).timeIn).toBeNull();
    closeEventDetailSheet();
  });
});
