/** @file Group-window close clamp, reopen classification, and overlap helpers. */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { _reset, add, update, getById, getAll, subscribe, setSyncAdapter } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import {
  classifyGroupWindowsForClose,
  classifyEventGroupWindowsForClose,
  classifyPaddockWindowsForClose,
  applyGroupWindowClosePlan,
  planMoveCloseLater,
  applyMoveCloseLaterPlan,
  isZeroLengthAt,
  leftEqualsClose,
  findLaterGroupWindow,
  overlappingDays,
  findGroupDayOverlaps,
  overlapWarningText,
  arrivalEarlierThanDeparture,
  eventDisplayName,
  formatWindowInstant,
} from '../../src/features/events/window-integrity.js';
import { compareWindowInstants } from '../../src/utils/date-utils.js';
import { classifyGwsForReopen } from '../../src/features/events/reopen-event.js';
import { formatShortDate } from '../../src/utils/date-format.js';

const OP = '00000000-0000-0000-0000-000000022601';
const FARM = '00000000-0000-0000-0000-000000022602';
const LOC = '00000000-0000-0000-0000-0000000226a1';
const LOC_E = '00000000-0000-0000-0000-0000000226a2';
const PW_E = '00000000-0000-0000-0000-0000000226b1';
const PW_J2_A = '00000000-0000-0000-0000-0000000226b2';
const PW_J2_B = '00000000-0000-0000-0000-0000000226b3';
const PW_J2_OPEN = '00000000-0000-0000-0000-0000000226b4';
const EVT_K = '00000000-0000-0000-0000-000000022611';
const EVT_LATER = '00000000-0000-0000-0000-000000022612';
const GROUP = '00000000-0000-0000-0000-0000000226c1';
const GW_OPEN = '00000000-0000-0000-0000-0000000226d1';
const GW_B1 = '00000000-0000-0000-0000-0000000226d2';
const GW_B2 = '00000000-0000-0000-0000-0000000226d3';
const GW_EARLY = '00000000-0000-0000-0000-0000000226d4';
const GW_LATER = '00000000-0000-0000-0000-0000000226d5';
const ANIMAL = '00000000-0000-0000-0000-0000000226e1';

beforeAll(() => setLocale('en', enLocale));

function seedBase() {
  _reset();
  localStorage.clear();
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'K - 1..5', type: 'land',
    landUse: 'pasture', areaHectares: 8,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Cow-Calf Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('events', EventEntity.create({
    id: EVT_K, operationId: OP, farmId: FARM, dateIn: '2026-08-03',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('animals', AnimalEntity.create({
    id: ANIMAL, operationId: OP, tagNum: 'C1', active: true, dateBorn: '2024-01-01', sex: 'F',
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId: ANIMAL, groupId: GROUP, dateJoined: '2026-08-01', dateLeft: null,
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}

function addGw(id, fields) {
  add('eventGroupWindows', GroupWindowEntity.create({
    id, operationId: OP, eventId: EVT_K, groupId: GROUP, headCount: 10, avgWeightKg: 500, ...fields,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
}

describe('compareWindowInstants', () => {
  it('compares dates only when either time is missing', () => {
    expect(compareWindowInstants('2026-08-10', null, '2026-08-10', '09:00')).toBe(0);
    expect(compareWindowInstants('2026-08-10', '09:00', '2026-08-10', null)).toBe(0);
    expect(compareWindowInstants('2026-08-10', null, '2026-08-11', '00:00')).toBe(-1);
  });

  it('compares date and time when both sides have a time', () => {
    expect(compareWindowInstants('2026-08-10', '09:00', '2026-08-10', '08:00')).toBe(1);
    expect(compareWindowInstants('2026-08-10', '09:00:00', '2026-08-10', '09:00')).toBe(0);
  });
});

describe('classifyGroupWindowsForClose', () => {
  it('classifies open, clamp, review, and unchanged windows', () => {
    const windows = [
      { id: 'open', dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: null },
      { id: 'b1', dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: '2026-09-16', timeLeft: null },
      { id: 'b2', dateJoined: '2026-09-16', timeJoined: null, dateLeft: '2026-09-22', timeLeft: null },
      { id: 'early', dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: '2026-08-09', timeLeft: null },
    ];
    const plan = classifyGroupWindowsForClose(windows, '2026-08-10', '09:00');
    expect(plan.toClose.map((w) => w.id)).toEqual(['open']);
    expect(plan.toClamp.map((w) => w.id)).toEqual(['b1']);
    expect(plan.toReview.map((w) => w.id)).toEqual(['b2']);
    expect(plan.unchanged.map((w) => w.id)).toEqual(['early']);
  });

  it('does not treat a window with no time_left on the close date as after the close', () => {
    const windows = [
      { id: 'same-day', dateJoined: '2026-08-03', dateLeft: '2026-08-10', timeLeft: null },
    ];
    const plan = classifyGroupWindowsForClose(windows, '2026-08-10', '09:00');
    expect(plan.toClamp).toHaveLength(0);
    expect(plan.unchanged.map((w) => w.id)).toEqual(['same-day']);
  });
});

describe('applyGroupWindowClosePlan', () => {
  beforeEach(() => seedBase());

  it('closes an open window and clamps a later-left closed window at C in one write', async () => {
    addGw(GW_OPEN, { dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: null });
    addGw(GW_B1, {
      dateJoined: '2026-08-03', timeJoined: '10:00',
      dateLeft: '2026-09-16', timeLeft: null, headCount: 17, avgWeightKg: 620,
    });
    const b1Before = getById('eventGroupWindows', GW_B1);
    const plan = classifyEventGroupWindowsForClose(EVT_K, '2026-08-10', '09:00', { eventClosing: true });

    const pushes = [];
    setSyncAdapter({
      push: (table, record) => { pushes.push({ table, id: record.id }); },
    });
    let notifies = 0;
    const unsub = subscribe('eventGroupWindows', () => { notifies += 1; });

    applyGroupWindowClosePlan(plan, '2026-08-10', '09:00');
    // endBatch drains subscribers synchronously. Without the batch, notify
    // waits for a microtask, so this would still be 0 here. The later
    // microtask flush must not add a second notification.
    expect(notifies).toBe(1);
    expect(pushes).toHaveLength(2);
    expect(pushes.map((p) => p.id).sort()).toEqual([GW_OPEN, GW_B1].sort());
    await Promise.resolve();
    await Promise.resolve();
    unsub();

    expect(getById('eventGroupWindows', GW_OPEN).dateLeft).toBe('2026-08-10');
    expect(getById('eventGroupWindows', GW_OPEN).timeLeft).toBe('09:00');
    const b1 = getById('eventGroupWindows', GW_B1);
    expect(b1.dateLeft).toBe('2026-08-10');
    expect(b1.timeLeft).toBe('09:00');
    expect(b1.headCount).toBe(17);
    expect(b1.avgWeightKg).toBe(620);
    expect(b1Before.headCount).toBe(17);
    expect(notifies).toBe(1);
  });

  it('B1: closed window 08-03 10:00 → 09-16 ends 08-10 09:00 after a backdated close', () => {
    addGw(GW_B1, {
      dateJoined: '2026-08-03', timeJoined: '10:00',
      dateLeft: '2026-09-16', timeLeft: null, headCount: 17, avgWeightKg: 620,
    });
    const plan = classifyEventGroupWindowsForClose(EVT_K, '2026-08-10', '09:00', { eventClosing: true });
    applyGroupWindowClosePlan(plan, '2026-08-10', '09:00');
    const row = getById('eventGroupWindows', GW_B1);
    expect(row.dateLeft).toBe('2026-08-10');
    expect(row.timeLeft).toBe('09:00');
    expect(row.headCount).toBe(17);
    expect(row.avgWeightKg).toBe(620);
  });

  it('leaves windows that already ended before C untouched, including updated_at', () => {
    addGw(GW_EARLY, {
      dateJoined: '2026-08-03', timeJoined: '10:00',
      dateLeft: '2026-08-09', timeLeft: null,
    });
    const before = getById('eventGroupWindows', GW_EARLY);
    const plan = classifyEventGroupWindowsForClose(EVT_K, '2026-08-10', '09:00', { eventClosing: true });
    expect(plan.unchanged.map((w) => w.id)).toEqual([GW_EARLY]);
    applyGroupWindowClosePlan(plan, '2026-08-10', '09:00');
    const after = getById('eventGroupWindows', GW_EARLY);
    expect(after.dateLeft).toBe('2026-08-09');
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it('does not write joined-after windows unless acceptZeroLength is set', () => {
    addGw(GW_B2, {
      dateJoined: '2026-09-16', dateLeft: '2026-09-22', headCount: 8, avgWeightKg: 400,
    });
    const before = getById('eventGroupWindows', GW_B2);
    const plan = classifyEventGroupWindowsForClose(EVT_K, '2026-08-10', '09:00', { eventClosing: true });
    expect(plan.toReview.map((w) => w.id)).toEqual([GW_B2]);
    applyGroupWindowClosePlan(plan, '2026-08-10', '09:00');
    expect(getById('eventGroupWindows', GW_B2).dateJoined).toBe('2026-09-16');
    expect(getById('eventGroupWindows', GW_B2).updatedAt).toBe(before.updatedAt);

    applyGroupWindowClosePlan(plan, '2026-08-10', '09:00', { acceptZeroLength: true });
    const after = getById('eventGroupWindows', GW_B2);
    expect(after.dateJoined).toBe('2026-08-10');
    expect(after.timeJoined).toBe('09:00');
    expect(after.dateLeft).toBe('2026-08-10');
    expect(after.timeLeft).toBe('09:00');
    expect(after.headCount).toBe(8);
    expect(after.avgWeightKg).toBe(400);
    expect(isZeroLengthAt(after, '2026-08-10', '09:00')).toBe(true);
  });
});

describe('reopen and move-close-later', () => {
  beforeEach(() => seedBase());

  it('reopens a window that ended exactly at the old close, not one that ended earlier', () => {
    addGw(GW_OPEN, { dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: '2026-08-10', timeLeft: '09:00' });
    addGw(GW_EARLY, { dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: '2026-08-09', timeLeft: null });
    const { reopen, keepClosed } = classifyGwsForReopen({ id: EVT_K, dateOut: '2026-08-10', timeOut: '09:00' });
    expect(reopen.map((r) => r.gw.id)).toEqual([GW_OPEN]);
    expect(keepClosed).toHaveLength(0);
  });

  it('does not reopen a window left on the old close date at an earlier time', () => {
    addGw(GW_OPEN, {
      dateJoined: '2026-08-03', timeJoined: '10:00',
      dateLeft: '2026-08-10', timeLeft: '08:00',
    });
    const { reopen, keepClosed } = classifyGwsForReopen({ id: EVT_K, dateOut: '2026-08-10', timeOut: '09:00' });
    expect(reopen).toHaveLength(0);
    expect(keepClosed).toHaveLength(0);
  });

  it('does not reopen a zero-length window at the old close', () => {
    addGw(GW_B2, {
      dateJoined: '2026-08-10', timeJoined: '09:00',
      dateLeft: '2026-08-10', timeLeft: '09:00',
    });
    const { reopen, keepClosed } = classifyGwsForReopen({ id: EVT_K, dateOut: '2026-08-10', timeOut: '09:00' });
    expect(reopen).toHaveLength(0);
    expect(keepClosed).toHaveLength(0);
  });

  it('keeps a window closed and lists it when the group has a later window elsewhere', () => {
    addGw(GW_OPEN, { dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: '2026-08-10', timeLeft: '09:00' });
    add('events', EventEntity.create({
      id: EVT_LATER, operationId: OP, farmId: FARM, dateIn: '2026-08-10',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_LATER, operationId: OP, eventId: EVT_LATER, groupId: GROUP,
      dateJoined: '2026-08-10', timeJoined: '09:00', dateLeft: '2026-09-01',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    const { reopen, keepClosed } = classifyGwsForReopen({ id: EVT_K, dateOut: '2026-08-10', timeOut: '09:00' });
    expect(reopen).toHaveLength(0);
    expect(keepClosed).toHaveLength(1);
    expect(keepClosed[0].gw.id).toBe(GW_OPEN);
    expect(keepClosed[0].reason).toBe('moved');
    expect(findLaterGroupWindow(getById('eventGroupWindows', GW_OPEN))).toBeTruthy();
  });

  it('reopens a clamp-shortened window as open, not restored to its earlier date_left', () => {
    addGw(GW_B1, {
      dateJoined: '2026-08-03', timeJoined: '10:00',
      dateLeft: '2026-08-10', timeLeft: '09:00',
    });
    const { reopen } = classifyGwsForReopen({ id: EVT_K, dateOut: '2026-08-10', timeOut: '09:00' });
    expect(reopen.map((r) => r.gw.id)).toEqual([GW_B1]);
  });

  it('moving a close later extends windows that ended exactly at the old close, with the same exceptions', () => {
    addGw(GW_OPEN, { dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: '2026-08-10', timeLeft: '09:00' });
    addGw(GW_B2, {
      dateJoined: '2026-08-10', timeJoined: '09:00',
      dateLeft: '2026-08-10', timeLeft: '09:00',
    });
    addGw(GW_EARLY, { dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: '2026-08-09', timeLeft: null });
    add('events', EventEntity.create({
      id: EVT_LATER, operationId: OP, farmId: FARM, dateIn: '2026-08-10',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    const held = '00000000-0000-0000-0000-0000000226d6';
    const laterGroup = '00000000-0000-0000-0000-0000000226c2';
    add('groups', GroupEntity.create({ id: laterGroup, operationId: OP, farmId: FARM, name: 'Heifers' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    addGw(held, {
      groupId: laterGroup, dateJoined: '2026-08-03', timeJoined: '10:00',
      dateLeft: '2026-08-10', timeLeft: '09:00',
    });
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_LATER, operationId: OP, eventId: EVT_LATER, groupId: laterGroup,
      dateJoined: '2026-08-10', timeJoined: '09:00', dateLeft: null,
      headCount: 4, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    const windows = getAll('eventGroupWindows').filter((w) => w.eventId === EVT_K);
    const plan = planMoveCloseLater(windows, '2026-08-10', '09:00', '2026-08-20', '12:00', getAll('eventGroupWindows'));
    expect(plan.toExtend.map((w) => w.id)).toEqual([GW_OPEN]);
    expect(plan.heldZeroLength.map((w) => w.id)).toEqual([GW_B2]);
    expect(plan.heldLater.map((w) => w.id)).toEqual([held]);
    expect(plan.unchanged.map((w) => w.id)).toEqual([GW_EARLY]);

    applyMoveCloseLaterPlan(plan, '2026-08-20', '12:00');
    expect(getById('eventGroupWindows', GW_OPEN).dateLeft).toBe('2026-08-20');
    expect(getById('eventGroupWindows', GW_OPEN).timeLeft).toBe('12:00');
    expect(getById('eventGroupWindows', GW_B2).dateLeft).toBe('2026-08-10');
    expect(getById('eventGroupWindows', held).dateLeft).toBe('2026-08-10');
    expect(getById('eventGroupWindows', GW_EARLY).dateLeft).toBe('2026-08-09');
  });

  it('treats leftEqualsClose with date-only when a time is missing', () => {
    addGw(GW_OPEN, { dateJoined: '2026-08-03', dateLeft: '2026-08-10', timeLeft: null });
    expect(leftEqualsClose(getById('eventGroupWindows', GW_OPEN), '2026-08-10', '09:00')).toBe(true);
  });
});

describe('overlap helpers', () => {
  it('uses half-open days: a window ending on a day does not cover that day', () => {
    expect(overlappingDays(
      { dateJoined: '2026-07-01', dateLeft: '2026-07-10' },
      { dateJoined: '2026-07-10', dateLeft: '2026-07-20' },
    )).toBeNull();
    expect(overlappingDays(
      { dateJoined: '2026-07-01', dateLeft: '2026-07-11' },
      { dateJoined: '2026-07-10', dateLeft: '2026-07-20' },
    )).toEqual({ start: '2026-07-10', end: '2026-07-11' });
  });

  it('arrival earlier than departure follows the date-only rule', () => {
    expect(arrivalEarlierThanDeparture('2026-08-09', null, '2026-08-10', '09:00')).toBe(true);
    expect(arrivalEarlierThanDeparture('2026-08-10', null, '2026-08-10', '09:00')).toBe(false);
    expect(arrivalEarlierThanDeparture('2026-08-10', '08:00', '2026-08-10', '09:00')).toBe(true);
    expect(arrivalEarlierThanDeparture('2026-08-10', '09:00', '2026-08-10', '09:00')).toBe(false);
  });

  it('warning copy uses short dates and can name the other event', () => {
    expect(overlapWarningText({ start: '2026-08-09', end: '2026-08-10' }))
      .toBe(`This group would be in two places from ${formatShortDate('2026-08-09')} to ${formatShortDate('2026-08-10')}.`);
    expect(overlapWarningText({ start: '2026-08-09', end: '2026-08-10', eventLabel: 'K - 1..5' }))
      .toBe(`This group would be in two places from ${formatShortDate('2026-08-09')} to ${formatShortDate('2026-08-10')} (K - 1..5).`);
  });

  it('finds another window of the same group that covers the same day', () => {
    seedBase();
    addGw(GW_B1, { dateJoined: '2026-08-03', dateLeft: '2026-08-20' });
    const overlaps = findGroupDayOverlaps(
      { groupId: GROUP, dateJoined: '2026-08-09', dateLeft: null },
      { ignoreWindowIds: [], todayStr: '2026-08-15' },
    );
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].start).toBe('2026-08-09');
    expect(overlaps[0].end).toBe('2026-08-20');
    expect(overlaps[0].eventLabel).toBe('another event');
  });
});

describe('classifyPaddockWindowsForClose and paddock clamp', () => {
  beforeEach(() => seedBase());

  it('classifies open, clamp, conflict, and unchanged paddock windows', () => {
    const windows = [
      { id: 'open', dateOpened: '2026-11-01', timeOpened: null, dateClosed: null },
      { id: 'clamp', dateOpened: '2026-11-01', timeOpened: null, dateClosed: '2026-11-17', timeClosed: '12:01' },
      { id: 'after', dateOpened: '2026-11-17', timeOpened: '12:01', dateClosed: '2026-11-18', timeClosed: null },
      { id: 'early', dateOpened: '2026-11-01', timeOpened: null, dateClosed: '2026-11-16', timeClosed: '12:00' },
    ];
    const plan = classifyPaddockWindowsForClose(windows, '2026-11-16', '12:02');
    expect(plan.toClose.map((w) => w.id)).toEqual(['open']);
    expect(plan.toClamp.map((w) => w.id)).toEqual(['clamp']);
    expect(plan.toConflict.map((w) => w.id)).toEqual(['after']);
    expect(plan.unchanged.map((w) => w.id)).toEqual(['early']);
  });

  it('clamps a closed paddock window in the same batch as the group-window plan', () => {
    add('locations', LocationEntity.create({
      id: LOC_E, operationId: OP, farmId: FARM, name: 'E - 3', type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_E, operationId: OP, eventId: EVT_K, locationId: LOC_E,
      dateOpened: '2026-11-01', dateClosed: '2026-11-17', timeClosed: '12:01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    addGw(GW_OPEN, { dateJoined: '2026-11-01', dateLeft: null });
    const groupPlan = classifyEventGroupWindowsForClose(EVT_K, '2026-11-16', '12:02', { eventClosing: true });
    const paddockPlan = classifyPaddockWindowsForClose(
      getAll('eventPaddockWindows').filter((w) => w.eventId === EVT_K),
      '2026-11-16', '12:02',
    );
    expect(paddockPlan.toClamp.map((w) => w.id)).toEqual([PW_E]);

    let midBatchNotifies = 0;
    const unsub = subscribe('eventPaddockWindows', () => { midBatchNotifies += 1; });
    applyGroupWindowClosePlan(groupPlan, '2026-11-16', '12:02', { paddockClamps: paddockPlan.toClamp });
    expect(midBatchNotifies).toBe(1);
    unsub();

    const pw = getById('eventPaddockWindows', PW_E);
    expect(pw.dateClosed).toBe('2026-11-16');
    expect(pw.timeClosed).toBe('12:02');
    expect(getById('eventGroupWindows', GW_OPEN).dateLeft).toBe('2026-11-16');
    expect(getById('eventGroupWindows', GW_OPEN).timeLeft).toBe('12:02');
  });
});

describe('eventDisplayName', () => {
  beforeEach(() => seedBase());

  it('dedupes paddock names and lists live windows first', () => {
    add('locations', LocationEntity.create({
      id: LOC_E, operationId: OP, farmId: FARM, name: 'E - 3', type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_J2_A, operationId: OP, eventId: EVT_K, locationId: LOC,
      dateOpened: '2026-07-01', dateClosed: '2026-07-04', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_J2_B, operationId: OP, eventId: EVT_K, locationId: LOC,
      dateOpened: '2026-07-04', dateClosed: '2026-07-10', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_E, operationId: OP, eventId: EVT_K, locationId: LOC_E,
      dateOpened: '2026-07-01', dateClosed: '2026-07-10', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_J2_OPEN, operationId: OP, eventId: EVT_K, locationId: LOC,
      dateOpened: '2026-07-10', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

    expect(eventDisplayName(EVT_K)).toBe('K - 1..5, E - 3');
  });

  it('falls back when the event has no paddock names', () => {
    expect(eventDisplayName(EVT_K)).toBe('another event');
  });
});

describe('formatWindowInstant', () => {
  it('uses short dates and includes time when present', () => {
    expect(formatWindowInstant('2026-11-16', '12:02')).toBe(`${formatShortDate('2026-11-16')} 12:02`);
    expect(formatWindowInstant('2026-09-16', null)).toBe(formatShortDate('2026-09-16'));
    expect(formatWindowInstant('2026-11-16', '12:02:00')).toBe(`${formatShortDate('2026-11-16')} 12:02`);
  });
});
