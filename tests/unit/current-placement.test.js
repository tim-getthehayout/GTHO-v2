/** @file OI-0205 — shared current-placement resolver. Pure fixtures; no git or absolute paths. */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolveCurrentPlacement,
  listOpenPaddocksForEvent,
  formatPaddockDisplayName,
} from '../../src/data/current-placement.js';
import {
  _reset, add, update, getAll, getGroupCurrentFarm, getVisibleGroups,
  maybeSplitForGroup, resolveGroupCurrentPlacement, setActiveFarm,
} from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as EventEntity from '../../src/entities/event.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as UserPrefEntity from '../../src/entities/user-preference.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';

const GROUP = 'group-cow-calf';
const EVENT_CURRENT = 'event-nov-2';
const EVENT_ORPHAN = 'event-jul-27';
const EVENT_OTHER = 'event-other-open';
const LOC_E1 = 'loc-e-1';
const LOC_E2 = 'loc-e-2';
const LOC_F1 = 'loc-f-1';

function loc(id, name) {
  return { id, name };
}

function ev(id, { dateOut = null, farmId = 'farm-a' } = {}) {
  return { id, farmId, dateOut, dateIn: '2026-01-01' };
}

function gw(id, { groupId = GROUP, eventId, dateJoined, timeJoined = null, dateLeft = null } = {}) {
  return { id, groupId, eventId, dateJoined, timeJoined, dateLeft };
}

function pw(id, { eventId, locationId, dateOpened, timeOpened = null, dateClosed = null } = {}) {
  return { id, eventId, locationId, dateOpened, timeOpened, dateClosed };
}

const currentEvent = ev(EVENT_CURRENT);
const orphanEvent = ev(EVENT_ORPHAN, { dateOut: '2026-08-01' });
const locations = [loc(LOC_E1, 'E - 1'), loc(LOC_E2, 'E - 2'), loc(LOC_F1, 'F - 1')];

const currentWindows = [
  gw('gw-orphan', { eventId: EVENT_ORPHAN, dateJoined: '2026-07-27', timeJoined: '08:00' }),
  gw('gw-current', { eventId: EVENT_CURRENT, dateJoined: '2026-11-02', timeJoined: '09:00' }),
];

const paddocks = [
  pw('pw-e1', { eventId: EVENT_CURRENT, locationId: LOC_E1, dateOpened: '2026-11-02', timeOpened: '09:00' }),
  pw('pw-e2', { eventId: EVENT_CURRENT, locationId: LOC_E2, dateOpened: '2026-11-02', timeOpened: '09:05' }),
  pw('pw-orphan', { eventId: EVENT_ORPHAN, locationId: LOC_F1, dateOpened: '2026-07-27' }),
];

function permute(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((item, i) => {
    for (const rest of permute([...arr.slice(0, i), ...arr.slice(i + 1)])) {
      out.push([item, ...rest]);
    }
  });
  return out;
}

function resolve(overrides = {}) {
  return resolveCurrentPlacement({
    groupId: GROUP,
    groupWindows: currentWindows,
    events: [orphanEvent, currentEvent],
    paddockWindows: paddocks,
    locations,
    ...overrides,
  });
}

describe('resolveCurrentPlacement — Cow-Calf stale-first / valid-later', () => {
  it('selects the valid current event and all of its open paddocks, not the stale orphan', () => {
    const placement = resolve();
    expect(placement.placed).toBe(true);
    expect(placement.eventId).toBe(EVENT_CURRENT);
    expect(placement.displayName).toBe('E - 1, E - 2');
    expect(placement.locationIds).toEqual([LOC_E1, LOC_E2]);
    expect(placement.farmId).toBe('farm-a');
    expect(placement.hasConflictingOpenEvents).toBe(false);
  });

  it('is stable across every input-order permutation of the group windows', () => {
    for (const groupWindows of permute(currentWindows)) {
      const placement = resolve({ groupWindows });
      expect(placement.eventId).toBe(EVENT_CURRENT);
      expect(placement.displayName).toBe('E - 1, E - 2');
    }
  });
});

describe('resolveCurrentPlacement — closed / missing parents do not count as placed', () => {
  it('closed-only events are unplaced', () => {
    const placement = resolve({
      groupWindows: [gw('gw-orphan', { eventId: EVENT_ORPHAN, dateJoined: '2026-07-27' })],
      events: [orphanEvent],
    });
    expect(placement.placed).toBe(false);
    expect(placement.displayName).toBe('');
    expect(placement.farmId).toBeNull();
  });

  it('a closed group window is ignored even when its parent is open', () => {
    const placement = resolve({
      groupWindows: [
        gw('gw-closed', { eventId: EVENT_CURRENT, dateJoined: '2026-11-02', dateLeft: '2026-11-08' }),
      ],
    });
    expect(placement.placed).toBe(false);
  });

  it('a missing parent event does not count as placed', () => {
    const placement = resolve({
      groupWindows: [gw('gw-ghost', { eventId: 'missing-event', dateJoined: '2026-11-02' })],
      events: [currentEvent],
    });
    expect(placement.placed).toBe(false);
  });

  it('a closed parent does not count even if a later open window exists on that same closed event', () => {
    const placement = resolve({
      groupWindows: [
        gw('gw-a', { eventId: EVENT_ORPHAN, dateJoined: '2026-07-27' }),
        gw('gw-b', { eventId: EVENT_ORPHAN, dateJoined: '2026-11-09' }),
      ],
      events: [orphanEvent],
    });
    expect(placement.placed).toBe(false);
  });
});

describe('resolveCurrentPlacement — paddocks, state splits and ordering', () => {
  it('returns one paddock in stable order', () => {
    const placement = resolve({
      paddockWindows: [pw('pw-e1', { eventId: EVENT_CURRENT, locationId: LOC_E1, dateOpened: '2026-11-02' })],
    });
    expect(placement.displayName).toBe('E - 1');
  });

  it('excludes closed paddock windows', () => {
    const placement = resolve({
      paddockWindows: [
        pw('pw-e1', { eventId: EVENT_CURRENT, locationId: LOC_E1, dateOpened: '2026-11-02' }),
        pw('pw-e2-closed', {
          eventId: EVENT_CURRENT, locationId: LOC_E2, dateOpened: '2026-11-02', dateClosed: '2026-11-05',
        }),
      ],
    });
    expect(placement.displayName).toBe('E - 1');
    expect(placement.locationIds).toEqual([LOC_E1]);
  });

  it('deduplicates duplicate location windows and does not repeat labels', () => {
    const placement = resolve({
      paddockWindows: [
        pw('pw-e1-b', { eventId: EVENT_CURRENT, locationId: LOC_E1, dateOpened: '2026-11-03', timeOpened: '12:00' }),
        pw('pw-e1-a', { eventId: EVENT_CURRENT, locationId: LOC_E1, dateOpened: '2026-11-02', timeOpened: '09:00' }),
        pw('pw-e2', { eventId: EVENT_CURRENT, locationId: LOC_E2, dateOpened: '2026-11-02', timeOpened: '09:05' }),
      ],
    });
    expect(placement.displayName).toBe('E - 1, E - 2');
    expect(placement.locationIds).toEqual([LOC_E1, LOC_E2]);
  });

  it('state-window splits on one event do not duplicate placement or labels', () => {
    const placement = resolve({
      groupWindows: [
        gw('gw-state-a', { eventId: EVENT_CURRENT, dateJoined: '2026-11-02', timeJoined: '09:00' }),
        gw('gw-state-b', { eventId: EVENT_CURRENT, dateJoined: '2026-11-09', timeJoined: '10:00' }),
      ],
    });
    expect(placement.placed).toBe(true);
    expect(placement.eventId).toBe(EVENT_CURRENT);
    expect(placement.groupWindow.id).toBe('gw-state-b');
    expect(placement.groupWindows.map((w) => w.id).sort()).toEqual(['gw-state-a', 'gw-state-b']);
    expect(placement.displayName).toBe('E - 1, E - 2');
    expect(placement.openEventIds).toEqual([EVENT_CURRENT]);
  });

  it('orders paddocks by earliest open, not input order', () => {
    const names = listOpenPaddocksForEvent(
      EVENT_CURRENT,
      [
        pw('pw-e2', { eventId: EVENT_CURRENT, locationId: LOC_E2, dateOpened: '2026-11-02', timeOpened: '09:05' }),
        pw('pw-e1', { eventId: EVENT_CURRENT, locationId: LOC_E1, dateOpened: '2026-11-02', timeOpened: '09:00' }),
      ],
      locations,
    ).map((p) => p.name);
    expect(names).toEqual(['E - 1', 'E - 2']);
    expect(formatPaddockDisplayName(names.map((name, i) => ({ name, locationId: i })))).toBe('E - 1, E - 2');
  });

  it('uses "?" when open paddocks exist but names are missing', () => {
    expect(formatPaddockDisplayName([{ locationId: LOC_E1, name: null }])).toBe('?');
  });

  it('breaks latest-joined ties with timeJoined then id, never input order', () => {
    const sameDate = [
      gw('gw-z', { eventId: EVENT_CURRENT, dateJoined: '2026-11-02', timeJoined: '08:00' }),
      gw('gw-a', { eventId: EVENT_OTHER, dateJoined: '2026-11-02', timeJoined: '08:00' }),
    ];
    const laterTime = ev(EVENT_OTHER);
    const placement = resolve({
      groupWindows: sameDate,
      events: [currentEvent, laterTime],
    });
    // same date+time: higher id wins (gw-z > gw-a)
    expect(placement.eventId).toBe(EVENT_CURRENT);
    const flipped = resolve({
      groupWindows: sameDate.slice().reverse(),
      events: [currentEvent, laterTime],
    });
    expect(flipped.eventId).toBe(EVENT_CURRENT);

    const byTime = resolve({
      groupWindows: [
        gw('gw-early', { eventId: EVENT_CURRENT, dateJoined: '2026-11-02', timeJoined: '08:00' }),
        gw('gw-late', { eventId: EVENT_OTHER, dateJoined: '2026-11-02', timeJoined: '09:00' }),
      ],
      events: [currentEvent, laterTime],
      paddockWindows: [
        pw('pw-e1', { eventId: EVENT_CURRENT, locationId: LOC_E1, dateOpened: '2026-11-02' }),
        pw('pw-f1', { eventId: EVENT_OTHER, locationId: LOC_F1, dateOpened: '2026-11-02' }),
      ],
    });
    expect(byTime.eventId).toBe(EVENT_OTHER);
    expect(byTime.displayName).toBe('F - 1');
    expect(byTime.hasConflictingOpenEvents).toBe(true);
  });
});

describe('resolveCurrentPlacement — conflicting distinct open events (product question)', () => {
  it('does not silently union events and does not show unplaced when a valid window exists', () => {
    const other = ev(EVENT_OTHER, { farmId: 'farm-b' });
    const placement = resolve({
      groupWindows: [
        gw('gw-current', { eventId: EVENT_CURRENT, dateJoined: '2026-11-02' }),
        gw('gw-other', { eventId: EVENT_OTHER, dateJoined: '2026-10-01' }),
      ],
      events: [currentEvent, other],
      paddockWindows: [
        ...paddocks,
        pw('pw-f1', { eventId: EVENT_OTHER, locationId: LOC_F1, dateOpened: '2026-10-01' }),
      ],
    });
    expect(placement.placed).toBe(true);
    expect(placement.hasConflictingOpenEvents).toBe(true);
    expect(placement.openEventIds).toEqual([EVENT_CURRENT, EVENT_OTHER]);
    expect(placement.eventId).toBe(EVENT_CURRENT);
    expect(placement.displayName).toBe('E - 1, E - 2');
    expect(placement.displayName).not.toContain('F - 1');
    expect(placement.farmId).toBe('farm-a');
  });
});

describe('resolveCurrentPlacement — membership inheritance is group-scoped', () => {
  function placementForAnimal(animalId, { memberships, ...rest }) {
    const mem = (memberships || []).find((m) => m.animalId === animalId && !m.dateLeft);
    if (!mem) {
      return resolveCurrentPlacement({ groupId: null, ...rest });
    }
    return resolveCurrentPlacement({ groupId: mem.groupId, ...rest });
  }

  const records = {
    groupWindows: currentWindows,
    events: [orphanEvent, currentEvent],
    paddockWindows: paddocks,
    locations,
  };

  it('an animal inherits its current group placement', () => {
    const placement = placementForAnimal('cow-1', {
      ...records,
      memberships: [{ animalId: 'cow-1', groupId: GROUP, dateLeft: null }],
    });
    expect(placement.displayName).toBe('E - 1, E - 2');
    expect(placement.placed).toBe(true);
  });

  it('a membership change moves inherited placement', () => {
    const otherGroup = 'group-heifers';
    const after = placementForAnimal('cow-1', {
      groupWindows: [
        ...currentWindows,
        gw('gw-heifers', { groupId: otherGroup, eventId: EVENT_OTHER, dateJoined: '2026-11-01' }),
      ],
      events: [orphanEvent, currentEvent, ev(EVENT_OTHER)],
      paddockWindows: [
        ...paddocks,
        pw('pw-f1', { eventId: EVENT_OTHER, locationId: LOC_F1, dateOpened: '2026-11-01' }),
      ],
      locations,
      memberships: [
        { animalId: 'cow-1', groupId: GROUP, dateLeft: '2026-11-09' },
        { animalId: 'cow-1', groupId: otherGroup, dateLeft: null },
      ],
    });
    expect(after.displayName).toBe('F - 1');
    expect(after.eventId).toBe(EVENT_OTHER);
  });

  it('an ungrouped animal does not receive an invented location', () => {
    const placement = placementForAnimal('cow-lone', {
      ...records,
      memberships: [{ animalId: 'cow-other', groupId: GROUP, dateLeft: null }],
    });
    expect(placement.placed).toBe(false);
    expect(placement.displayName).toBe('');
  });
});

describe('resolveCurrentPlacement does not mutate inputs', () => {
  it('leaves source records untouched', () => {
    const groupWindows = currentWindows.map((w) => ({ ...w }));
    const frozen = JSON.stringify(groupWindows);
    resolve({ groupWindows });
    expect(JSON.stringify(groupWindows)).toBe(frozen);
  });
});

// --- store integration: farm scope + maybeSplitForGroup ---

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM_A = '00000000-0000-0000-0000-0000000000a1';
const FARM_B = '00000000-0000-0000-0000-0000000000a2';
const GROUP_ID = '00000000-0000-0000-0000-0000000000c1';
const EVENT_OPEN = '00000000-0000-0000-0000-0000000000e1';
const EVENT_CLOSED = '00000000-0000-0000-0000-0000000000e2';
const USER_ID = '00000000-0000-0000-0000-0000000000ff';

function seedStore() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('userPreferences', UserPrefEntity.create({ operationId: OP, userId: USER_ID, activeFarmId: null }),
    UserPrefEntity.validate, UserPrefEntity.toSupabaseShape, 'user_preferences');
  add('farms', FarmEntity.create({ id: FARM_A, operationId: OP, name: 'Farm A' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farms', FarmEntity.create({ id: FARM_B, operationId: OP, name: 'Farm B' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('groups', GroupEntity.create({ id: GROUP_ID, operationId: OP, name: 'Cow-Calf' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('events', EventEntity.create({
    id: EVENT_OPEN, operationId: OP, farmId: FARM_A, dateIn: '2026-11-02',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('events', EventEntity.create({
    id: EVENT_CLOSED, operationId: OP, farmId: FARM_B, dateIn: '2026-07-27', dateOut: '2026-08-01',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
}

describe('store farm scope and write-context use the valid current window', () => {
  beforeEach(() => {
    _reset();
    localStorage.clear();
    seedStore();
  });

  it('getGroupCurrentFarm ignores a stale closed-parent window in front of a valid one', () => {
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-orphan', operationId: OP, eventId: EVENT_CLOSED, groupId: GROUP_ID,
      dateJoined: '2026-07-27', headCount: 10, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-current', operationId: OP, eventId: EVENT_OPEN, groupId: GROUP_ID,
      dateJoined: '2026-11-02', headCount: 10, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    expect(getGroupCurrentFarm(GROUP_ID)).toBe(FARM_A);
    setActiveFarm(FARM_A);
    expect(getVisibleGroups().map((g) => g.id)).toContain(GROUP_ID);
    setActiveFarm(FARM_B);
    expect(getVisibleGroups().map((g) => g.id)).not.toContain(GROUP_ID);
  });

  it('getGroupCurrentFarm is null when the only open window belongs to a closed parent', () => {
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-orphan', operationId: OP, eventId: EVENT_CLOSED, groupId: GROUP_ID,
      dateJoined: '2026-07-27', headCount: 10, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    expect(getGroupCurrentFarm(GROUP_ID)).toBeNull();
  });

  it('maybeSplitForGroup splits the valid current window, not a historical orphan inserted first', () => {
    add('animals', AnimalEntity.create({
      id: '00000000-0000-0000-0000-0000000000b1', operationId: OP, sex: 'female', active: true,
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      id: '00000000-0000-0000-0000-0000000000m1', operationId: OP,
      animalId: '00000000-0000-0000-0000-0000000000b1', groupId: GROUP_ID, dateJoined: '2026-11-02',
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-orphan', operationId: OP, eventId: EVENT_CLOSED, groupId: GROUP_ID,
      dateJoined: '2026-07-27', headCount: 10, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-current', operationId: OP, eventId: EVENT_OPEN, groupId: GROUP_ID,
      dateJoined: '2026-11-02', headCount: 10, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    maybeSplitForGroup(GROUP_ID, '2026-11-10');
    const windows = getAll('eventGroupWindows');
    const orphan = windows.find((w) => w.id === 'gw-orphan');
    const previousCurrent = windows.find((w) => w.id === 'gw-current');
    expect(orphan.dateLeft).toBeNull();
    expect(previousCurrent.dateLeft).toBe('2026-11-10');
    expect(windows.some((w) => w.eventId === EVENT_OPEN && !w.dateLeft && w.id !== 'gw-current')).toBe(true);
    expect(windows.filter((w) => w.eventId === EVENT_CLOSED && !w.dateLeft)).toHaveLength(1);
  });

  it('maybeSplitForGroup is a no-op for an orphan-only group (does not write)', () => {
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-orphan', operationId: OP, eventId: EVENT_CLOSED, groupId: GROUP_ID,
      dateJoined: '2026-07-27', headCount: 10, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    const before = JSON.stringify(getAll('eventGroupWindows'));
    maybeSplitForGroup(GROUP_ID, '2026-11-10');
    expect(JSON.stringify(getAll('eventGroupWindows'))).toBe(before);
    expect(resolveGroupCurrentPlacement(GROUP_ID).placed).toBe(false);
  });
});

describe('hasConflictingOpenEvents stays computed and unshown', () => {
  it('is computed on a latest-joined conflict and is not read by the animal or dashboard UI', () => {
    const result = resolveCurrentPlacement({
      groupId: GROUP,
      events: [ev(EVENT_CURRENT), ev(EVENT_OTHER)],
      groupWindows: [
        gw('gw-older', { eventId: EVENT_OTHER, dateJoined: '2026-10-01' }),
        gw('gw-newer', { eventId: EVENT_CURRENT, dateJoined: '2026-11-02' }),
      ],
      paddockWindows: [
        pw('pw-e1', { eventId: EVENT_CURRENT, locationId: LOC_E1, dateOpened: '2026-11-02' }),
        pw('pw-f1', { eventId: EVENT_OTHER, locationId: LOC_F1, dateOpened: '2026-10-01' }),
      ],
      locations: [loc(LOC_E1, 'E-1'), loc(LOC_F1, 'F-1')],
    });
    expect(result.hasConflictingOpenEvents).toBe(true);
    expect(result.eventId).toBe(EVENT_CURRENT);

    for (const rel of ['src/features/animals/index.js', 'src/features/dashboard/index.js']) {
      expect(readFileSync(rel, 'utf8')).not.toMatch(/hasConflictingOpenEvents/);
    }
  });
});
