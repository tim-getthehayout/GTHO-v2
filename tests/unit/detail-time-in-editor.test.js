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
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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
import { getEventStart } from '../../src/features/events/event-start.js';

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
  // setEventStart prompts via window.confirm when more than one tied window
  // will move on a move-later; auto-accept in tests so writes proceed.
  vi.stubGlobal('confirm', () => true);
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
  // OI-0117: event no longer stores date_in/time_in — the anchor paddock
  // window carries the start datetime via date_opened / time_opened.
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM,
    type: 'graze', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-04-16', timeOpened: '08:30', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-04-16', timeJoined: '08:30', headCount: 10, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
});

function findTimeInInput() {
  return document.querySelector('[data-testid="detail-time-in"]');
}

async function flush() {
  await Promise.resolve(); await Promise.resolve();
}

describe('OI-0116/OI-0117 — Event Detail hero line time input (derived + write-through)', () => {
  it('renders the time input next to the date input with the derived child-window time', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    expect(timeInput).toBeTruthy();
    expect(timeInput.type).toBe('time');
    expect(timeInput.value).toBe('08:30');
    closeEventDetailSheet();
  });

  it('renders empty value when the anchor paddock window has no timeOpened', () => {
    update('eventPaddockWindows', PW, { timeOpened: null }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    expect(timeInput.value).toBe('');
    closeEventDetailSheet();
  });

  it('edit writes through to the earliest child paddock window timeOpened', async () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    timeInput.value = '14:45';
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(getEventStart(EVT)?.time).toBe('14:45');
    expect(getById('eventPaddockWindows', PW).timeOpened).toBe('14:45');
    closeEventDetailSheet();
  });

  it('empty string clears child-window timeOpened to null (not "")', async () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    timeInput.value = '';
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(getEventStart(EVT)?.time).toBeNull();
    expect(getById('eventPaddockWindows', PW).timeOpened).toBeNull();
    closeEventDetailSheet();
  });

  it('OI-0115 Guard 1: phantom change after DOM removal is a no-op', async () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    timeInput.remove();
    timeInput.value = '23:59';
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(getById('eventPaddockWindows', PW).timeOpened).toBe('08:30');
    closeEventDetailSheet();
  });

  it('OI-0115 Guard 2: phantom change with render-time snapshot value is a no-op', async () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const timeInput = findTimeInInput();
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(getById('eventPaddockWindows', PW).timeOpened).toBe('08:30');
    closeEventDetailSheet();
  });

  it('legitimate user edit still writes (fix does not break the happy path)', async () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const firstInput = findTimeInInput();
    firstInput.value = '07:15';
    firstInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(getById('eventPaddockWindows', PW).timeOpened).toBe('07:15');
    const secondInput = findTimeInInput();
    secondInput.value = '';
    secondInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(getById('eventPaddockWindows', PW).timeOpened).toBeNull();
    closeEventDetailSheet();
  });
});
