/**
 * @file Unit tests for the event-start derivation + write-through helpers (OI-0117).
 * Covers the six scenarios named in the spec + tied-earliest cases.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import {
  getEventStart, getEventStartDate, getEventStartFloorExcluding, setEventStart,
} from '../../src/features/events/event-start.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC_A = '00000000-0000-0000-0000-0000000000c1';
const LOC_B = '00000000-0000-0000-0000-0000000000c2';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const PW_A = '00000000-0000-0000-0000-0000000000e1';
const PW_B = '00000000-0000-0000-0000-0000000000e2';
const GROUP = '00000000-0000-0000-0000-000000000101';
const GW = '00000000-0000-0000-0000-000000000102';

beforeAll(() => setLocale('en', enLocale));

function seed() {
  _reset();
  localStorage.clear();
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('locations', LocationEntity.create({
    id: LOC_A, operationId: OP, farmId: FARM, name: 'A', type: 'land',
    landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: LOC_B, operationId: OP, farmId: FARM, name: 'B', type: 'land',
    landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
}

beforeEach(seed);

describe('getEventStart — read path', () => {
  it('returns null for an event with no child windows + logs a warning', () => {
    const r = getEventStart(EVT);
    expect(r).toBeNull();
  });

  it('single-child event: returns the paddock window opening', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const r = getEventStart(EVT);
    expect(r).toEqual({
      date: '2026-04-15', time: '08:00',
      sourceWindowId: PW_A, sourceWindowType: 'paddock',
    });
  });

  it('paddock+group: returns the earlier of the two', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-16', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-04-15', timeJoined: '14:00',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    const r = getEventStart(EVT);
    expect(r.date).toBe('2026-04-15');
    expect(r.time).toBe('14:00');
    expect(r.sourceWindowType).toBe('group');
  });

  it('null time sorts earlier than explicit time on the same date', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: null,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_B, operationId: OP, eventId: EVT, locationId: LOC_B,
      dateOpened: '2026-04-15', timeOpened: '09:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const r = getEventStart(EVT);
    expect(r.sourceWindowId).toBe(PW_A);
  });
});

describe('getEventStartDate convenience', () => {
  it('returns just the date string', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    expect(getEventStartDate(EVT)).toBe('2026-04-15');
  });

  it('returns null when event has no child windows', () => {
    expect(getEventStartDate(EVT)).toBeNull();
  });
});

describe('getEventStartFloorExcluding — edit-dialog guard helper', () => {
  beforeEach(() => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_B, operationId: OP, eventId: EVT, locationId: LOC_B,
      dateOpened: '2026-04-18', timeOpened: '13:30',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  });

  it('excludes the window being edited — the earliest one can move earlier', () => {
    // Editing PW_A (the current earliest). Floor is PW_B.
    const floor = getEventStartFloorExcluding(EVT, PW_A, 'paddock');
    expect(floor).toEqual({ date: '2026-04-18', time: '13:30', name: 'B' });
  });

  it('editing a non-earliest window: floor is the earliest sibling', () => {
    const floor = getEventStartFloorExcluding(EVT, PW_B, 'paddock');
    expect(floor).toEqual({ date: '2026-04-15', time: '08:00', name: 'A' });
  });

  it('single-child event: no floor (anything is allowed)', () => {
    seed();
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    expect(getEventStartFloorExcluding(EVT, PW_A, 'paddock')).toBeNull();
  });
});

describe('setEventStart — write path', () => {
  it('move-earlier: updates only the current earliest window', async () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-18', timeOpened: '13:30',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_B, operationId: OP, eventId: EVT, locationId: LOC_B,
      dateOpened: '2026-04-20', timeOpened: '09:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const r = await setEventStart(EVT, '2026-04-15', '13:31');
    expect(r.updated).toBe(1);
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-04-15');
    expect(getById('eventPaddockWindows', PW_A).timeOpened).toBe('13:31');
    expect(getById('eventPaddockWindows', PW_B).dateOpened).toBe('2026-04-20');
  });

  it('move-later with no conflict: updates the earliest', async () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const r = await setEventStart(EVT, '2026-04-17', '09:00');
    expect(r.updated).toBe(1);
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-04-17');
  });

  it('move-later rejected when a non-earliest sibling would be orphaned', async () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_B, operationId: OP, eventId: EVT, locationId: LOC_B,
      dateOpened: '2026-04-16', timeOpened: '09:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const r = await setEventStart(EVT, '2026-04-17', null);
    expect(r.updated).toBe(0);
    expect(r.blockedBy).toBeTruthy();
    expect(r.blockedBy.name).toBe('B');
    expect(r.blockedBy.date).toBe('2026-04-16');
    // Neither window should have moved.
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-04-15');
    expect(getById('eventPaddockWindows', PW_B).dateOpened).toBe('2026-04-16');
  });

  it('tied-earliest on move-later: confirm→update all tied windows atomically (option a)', async () => {
    // PW_A and PW_B both open at 2026-04-15 08:00.
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_B, operationId: OP, eventId: EVT, locationId: LOC_B,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const confirm = vi.fn(() => true);
    const r = await setEventStart(EVT, '2026-04-17', '08:00', { confirm });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toEqual(['A', 'B']);
    expect(r.updated).toBe(2);
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-04-17');
    expect(getById('eventPaddockWindows', PW_B).dateOpened).toBe('2026-04-17');
  });

  it('tied-earliest on move-later with user cancel: no windows updated', async () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_B, operationId: OP, eventId: EVT, locationId: LOC_B,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const r = await setEventStart(EVT, '2026-04-17', '08:00', { confirm: () => false });
    expect(r.cancelled).toBe(true);
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-04-15');
    expect(getById('eventPaddockWindows', PW_B).dateOpened).toBe('2026-04-15');
  });

  it('tied set spanning paddock + group is handled together', async () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-04-15', timeJoined: '08:00',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    const r = await setEventStart(EVT, '2026-04-17', '08:00', { confirm: () => true });
    expect(r.updated).toBe(2);
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-04-17');
    expect(getById('eventGroupWindows', GW).dateJoined).toBe('2026-04-17');
  });

  it('same-as-current is a no-op', async () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-15', timeOpened: '08:00',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const r = await setEventStart(EVT, '2026-04-15', '08:00');
    expect(r.updated).toBe(0);
  });
});
