/**
 * @file OI-0185 — `window-close-guard.js` unit tests.
 *
 * Covers the shared dry-run-close helper consumed by close.js + move-wizard.js.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import {
  checkWindowCloses,
  hasWindowCloseConflict,
} from '../../src/features/events/window-close-guard.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';

const OP = '00000000-0000-0000-0000-000000018501';
const FARM = '00000000-0000-0000-0000-000000018502';
const LOC_A = '00000000-0000-0000-0000-0000000185a1';
const LOC_B = '00000000-0000-0000-0000-0000000185a2';
const EVT = '00000000-0000-0000-0000-000000018511';
const PW_A = '00000000-0000-0000-0000-0000000185b1';
const PW_B = '00000000-0000-0000-0000-0000000185b2';
const GROUP = '00000000-0000-0000-0000-0000000185c1';
const GW = '00000000-0000-0000-0000-0000000185d1';

function seedBase() {
  _reset();
  localStorage.clear();
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  for (const [id, name] of [[LOC_A, 'E-5'], [LOC_B, 'B-3']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateIn: '2026-06-01',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
}

beforeEach(() => seedBase());

describe('checkWindowCloses — no conflicts', () => {
  it('returns [] when there are no open windows on the event', () => {
    expect(checkWindowCloses(EVT, '2026-06-30')).toEqual([]);
  });

  it('returns [] when every open window opens on or before the out-date', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-06-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-06-02', headCount: 12, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    expect(checkWindowCloses(EVT, '2026-06-30')).toEqual([]);
  });

  it('ignores already-closed windows', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-06-14', dateClosed: '2026-06-20', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    expect(checkWindowCloses(EVT, '2026-06-06')).toEqual([]);
  });
});

describe('checkWindowCloses — paddock window conflict (the 2026-06-14 repro)', () => {
  beforeEach(() => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-06-14', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  });

  it('flags the paddock window when out-date precedes its dateOpened', () => {
    const conflicts = checkWindowCloses(EVT, '2026-06-06');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'paddock',
      windowId: PW_A,
      eventId: EVT,
      locationId: LOC_A,
      openDate: '2026-06-14',
      outDate: '2026-06-06',
    });
    expect(conflicts[0].entityError).toMatch(/dateClosed must be on or after dateOpened/);
  });

  it('aggregates multiple paddock-window conflicts in one call', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_B, operationId: OP, eventId: EVT, locationId: LOC_B,
      dateOpened: '2026-06-15', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const conflicts = checkWindowCloses(EVT, '2026-06-06');
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map(c => c.windowId).sort()).toEqual([PW_A, PW_B].sort());
  });

  it('hasWindowCloseConflict returns true when any conflict exists, false otherwise', () => {
    expect(hasWindowCloseConflict(EVT, '2026-06-06')).toBe(true);
    expect(hasWindowCloseConflict(EVT, '2026-06-30')).toBe(false);
  });
});

describe('checkWindowCloses — group window conflict', () => {
  it('flags the group window when out-date precedes its dateJoined', () => {
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-06-14', headCount: 12, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    const conflicts = checkWindowCloses(EVT, '2026-06-06');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'group',
      windowId: GW,
      eventId: EVT,
      groupId: GROUP,
      openDate: '2026-06-14',
      outDate: '2026-06-06',
    });
    expect(conflicts[0].entityError).toMatch(/dateLeft must be on or after dateJoined/);
  });
});

describe('checkWindowCloses — opts.scopedGroupWindowIds', () => {
  it('restricts the GW check to listed ids', () => {
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-06-14', headCount: 12, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    // Another GW that would also conflict, but we scope the check to only GW.
    const OTHER = '00000000-0000-0000-0000-0000000185dd';
    add('groups', GroupEntity.create({ id: '00000000-0000-0000-0000-0000000185cc', operationId: OP, farmId: FARM, name: 'Other' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: OTHER, operationId: OP, eventId: EVT, groupId: '00000000-0000-0000-0000-0000000185cc',
      dateJoined: '2026-06-15', headCount: 4, avgWeightKg: 600,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    const conflicts = checkWindowCloses(EVT, '2026-06-06', null, {
      scopedGroupWindowIds: [GW],
      includePaddockWindows: false,
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].windowId).toBe(GW);
  });
});

describe('checkWindowCloses — opts.includePaddockWindows=false', () => {
  it('skips paddock-window checks when caller has not yet committed to closing them', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-06-14', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-06-01', headCount: 12, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    // PW conflicts (opens 06-14, out 06-06) but is skipped; GW is clean.
    const conflicts = checkWindowCloses(EVT, '2026-06-06', null, {
      includePaddockWindows: false,
    });
    expect(conflicts).toEqual([]);
  });
});

describe('checkWindowCloses — defensive returns', () => {
  it('returns [] for missing eventId / outDate', () => {
    expect(checkWindowCloses(null, '2026-06-06')).toEqual([]);
    expect(checkWindowCloses(EVT, null)).toEqual([]);
  });
});
