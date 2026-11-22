/** @file Close-sheet and move-wizard flows for the backdated-close clamp,
 * joined-after review, arrival default, and overlap warning. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, update, getAll, getById, setSyncAdapter } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
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
import * as AnimalWeightEntity from '../../src/entities/animal-weight-record.js';
import { openCloseEventSheet } from '../../src/features/events/close.js';
import { openMoveWizard } from '../../src/features/events/move-wizard.js';
import { openPlaceWizard } from '../../src/features/events/place-wizard.js';
import { openEditGroupWindowDialog } from '../../src/features/events/edit-group-window.js';
import { formatShortDate } from '../../src/utils/date-format.js';
import { formatWindowInstant } from '../../src/features/events/window-integrity.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import { inventoryPoolSnapshot } from '../../src/features/feed/pool-ledger.js';

const OP = '00000000-0000-0000-0000-000000022701';
const FARM = '00000000-0000-0000-0000-000000022702';
const SRC_LOC = '00000000-0000-0000-0000-0000000227a1';
const DST_LOC = '00000000-0000-0000-0000-0000000227a2';
const OTHER_LOC = '00000000-0000-0000-0000-0000000227a3';
const EVT = '00000000-0000-0000-0000-000000022711';
const EVT_OTHER = '00000000-0000-0000-0000-000000022712';
const SRC_PW = '00000000-0000-0000-0000-0000000227b1';
const OTHER_PW = '00000000-0000-0000-0000-0000000227b2';
const GROUP = '00000000-0000-0000-0000-0000000227c1';
const GW_OPEN = '00000000-0000-0000-0000-0000000227d1';
const GW_B1 = '00000000-0000-0000-0000-0000000227d2';
const GW_B2 = '00000000-0000-0000-0000-0000000227d3';
const GW_EARLY = '00000000-0000-0000-0000-0000000227d4';
const GW_OTHER = '00000000-0000-0000-0000-0000000227d5';
const ANIMAL = '00000000-0000-0000-0000-0000000227e1';

beforeAll(() => setLocale('en', enLocale));

function seedScene({ includeB2 = false, includeB1 = true, includeEarly = true } = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  setSyncAdapter({
    push: () => {}, pushBatch: () => {}, pull: () => {}, pullAll: () => {},
    delete: () => {}, isOnline: () => true, getStatus: () => 'idle',
    onStatusChange: () => {},
  });

  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  for (const [id, name] of [[SRC_LOC, 'K - 1..5'], [DST_LOC, 'D + E'], [OTHER_LOC, 'F - 1..5']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-08-03',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: SRC_PW, operationId: OP, eventId: EVT, locationId: SRC_LOC,
    dateOpened: '2026-08-03', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Cow-Calf Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_OPEN, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-08-03', timeJoined: '10:00', dateLeft: null,
    headCount: 12, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  if (includeB1) {
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_B1, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-08-03', timeJoined: '10:00',
      dateLeft: '2026-09-16', timeLeft: null,
      headCount: 17, avgWeightKg: 620,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
  if (includeB2) {
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_B2, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-09-16', dateLeft: '2026-09-22',
      headCount: 8, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
  if (includeEarly) {
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_EARLY, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-08-03', timeJoined: '10:00',
      dateLeft: '2026-08-09', timeLeft: null,
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
  add('animals', AnimalEntity.create({
    id: ANIMAL, operationId: OP, tagNum: 'C1', active: true, dateBorn: '2024-01-01', sex: 'F',
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId: ANIMAL, groupId: GROUP, dateJoined: '2026-08-01', dateLeft: null,
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}

function closeEventTo(date, time = '') {
  openCloseEventSheet({ id: EVT, operationId: OP, farmId: FARM, dateOut: null }, OP);
  document.querySelector('[data-testid="close-event-date-out"]').value = date;
  document.querySelector('[data-testid="close-event-time-out"]').value = time;
  document.querySelector('[data-testid="close-event-save"]').click();
}

function openMoveStep3() {
  openMoveWizard({ id: EVT, dateIn: '2026-08-03', dateOut: null, farmId: FARM }, OP, FARM);
  document.querySelector('[data-testid="move-wizard-dest-new"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
}

function closeEventViaMoveWizard(date, time = '') {
  openMoveStep3();
  const dateOut = document.querySelector('[data-testid="move-wizard-date-out"]');
  const timeOut = document.querySelector('[data-testid="move-wizard-time-out"]');
  dateOut.value = date;
  dateOut.dispatchEvent(new Event('input', { bubbles: true }));
  timeOut.value = time;
  timeOut.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-testid="move-wizard-save"]').click();
}

function openPaddockLaterSameDay() {
  update(
    'eventPaddockWindows', SRC_PW,
    { dateOpened: '2026-11-16', timeOpened: '13:00', dateClosed: null, timeClosed: null },
    PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
  );
}

function expectSameDayOpenConflictUnchanged() {
  expect(document.querySelector('[data-testid="date-conflict-dialog-title"]')).toBeTruthy();
  expect(getById('events', EVT).dateOut).toBeFalsy();
  const pw = getById('eventPaddockWindows', SRC_PW);
  expect(pw.dateOpened).toBe('2026-11-16');
  expect(pw.timeOpened).toBe('13:00');
  expect(pw.dateClosed).toBeFalsy();
  expect(getById('eventGroupWindows', GW_OPEN).dateLeft).toBeFalsy();
}

describe('close sheet clamp and review', () => {
  it('closes an open window and a later-left closed window at C in one write', () => {
    seedScene({ includeB2: false });
    const earlyBefore = getById('eventGroupWindows', GW_EARLY);

    closeEventTo('2026-08-10', '09:00');
    const queue = JSON.parse(localStorage.getItem('_sync_queue') || '[]');

    expect(getById('events', EVT).dateOut).toBe('2026-08-10');
    expect(getById('events', EVT).timeOut).toBe('09:00');
    expect(getById('eventGroupWindows', GW_OPEN).dateLeft).toBe('2026-08-10');
    expect(getById('eventGroupWindows', GW_OPEN).timeLeft).toBe('09:00');
    expect(getById('eventGroupWindows', GW_B1).dateLeft).toBe('2026-08-10');
    expect(getById('eventGroupWindows', GW_B1).timeLeft).toBe('09:00');
    expect(getById('eventGroupWindows', GW_B1).headCount).toBe(17);
    expect(getById('eventGroupWindows', GW_EARLY).dateLeft).toBe('2026-08-09');
    expect(getById('eventGroupWindows', GW_EARLY).updatedAt).toBe(earlyBefore.updatedAt);
    // One durable write: every window and event mutation is in the same queued batch.
    const queuedIds = queue.map((row) => row.id || row.record?.id);
    expect(queuedIds).toContain(GW_OPEN);
    expect(queuedIds).toContain(GW_B1);
    expect(queuedIds).toContain(EVT);
    expect(queuedIds).not.toContain(GW_EARLY);
    const durableKeys = [...new Set(queue.map((row) => {
      try { return JSON.parse(row.durable_key)[0]; } catch { return row.durable_key; }
    }))];
    expect(durableKeys).toHaveLength(1);
  });

  it('B2/B3: lists a window that joined after C; default makes it zero-length; cancel writes nothing', () => {
    seedScene({ includeB2: true });
    const snapshot = JSON.stringify({
      event: getById('events', EVT),
      windows: getAll('eventGroupWindows'),
    });

    closeEventTo('2026-08-10', '09:00');
    expect(document.querySelector('[data-testid="joined-after-close-title"]')).toBeTruthy();
    const list = document.querySelector('[data-testid="joined-after-close-list"]');
    expect(list.textContent).toContain('Cow-Calf Herd');
    expect(list.textContent).toContain(formatWindowInstant('2026-09-16'));
    expect(list.textContent).toContain(formatWindowInstant('2026-09-22'));
    expect(list.textContent).toContain(formatWindowInstant('2026-08-10', '09:00'));
    expect(list.textContent).not.toContain('2026-09-16');
    expect(getById('events', EVT).dateOut).toBeFalsy();

    document.querySelector('[data-testid="joined-after-close-cancel"]').click();
    expect(JSON.stringify({
      event: getById('events', EVT),
      windows: getAll('eventGroupWindows'),
    })).toBe(snapshot);

    closeEventTo('2026-08-10', '09:00');
    document.querySelector('[data-testid="joined-after-close-zero-length"]').click();
    const b2 = getById('eventGroupWindows', GW_B2);
    expect(b2.dateJoined).toBe('2026-08-10');
    expect(b2.timeJoined).toBe('09:00');
    expect(b2.dateLeft).toBe('2026-08-10');
    expect(b2.timeLeft).toBe('09:00');
    expect(getById('eventGroupWindows', GW_OPEN).dateLeft).toBe('2026-08-10');
    expect(getById('eventGroupWindows', GW_B1).dateLeft).toBe('2026-08-10');
    expect(getById('events', EVT).dateOut).toBe('2026-08-10');
  });
});

describe('close sheet and move wizard give the same clamp', () => {
  function sourceState() {
    return {
      eventOut: getById('events', EVT).dateOut,
      eventTime: getById('events', EVT).timeOut,
      open: (({ dateLeft, timeLeft, headCount, avgWeightKg }) => ({ dateLeft, timeLeft, headCount, avgWeightKg }))(getById('eventGroupWindows', GW_OPEN)),
      b1: (({ dateLeft, timeLeft, headCount, avgWeightKg }) => ({ dateLeft, timeLeft, headCount, avgWeightKg }))(getById('eventGroupWindows', GW_B1)),
      early: (({ dateLeft, timeLeft }) => ({ dateLeft, timeLeft }))(getById('eventGroupWindows', GW_EARLY)),
    };
  }

  it('matches for the same source data', () => {
    seedScene({ includeB2: false });
    const earlyAt = getById('eventGroupWindows', GW_EARLY).updatedAt;
    closeEventTo('2026-08-10', '09:00');
    const afterClose = sourceState();
    expect(getById('eventGroupWindows', GW_EARLY).updatedAt).toBe(earlyAt);

    seedScene({ includeB2: false });
    openMoveStep3();
    const dateOut = document.querySelector('[data-testid="move-wizard-date-out"]');
    const timeOut = document.querySelector('[data-testid="move-wizard-time-out"]');
    dateOut.value = '2026-08-10';
    dateOut.dispatchEvent(new Event('input', { bubbles: true }));
    timeOut.value = '09:00';
    timeOut.dispatchEvent(new Event('input', { bubbles: true }));
    const earlyAtMove = getById('eventGroupWindows', GW_EARLY).updatedAt;
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const afterMove = sourceState();
    expect(getById('eventGroupWindows', GW_EARLY).updatedAt).toBe(earlyAtMove);
    expect(afterMove).toEqual(afterClose);
  });
});

describe('move wizard arrival default and overlap warning', () => {
  it('defaults arrival to departure on open, date and time', () => {
    seedScene({ includeB1: false, includeEarly: false });
    openMoveStep3();
    expect(document.querySelector('[data-testid="move-wizard-date-in"]').value)
      .toBe(document.querySelector('[data-testid="move-wizard-date-out"]').value);
    expect(document.querySelector('[data-testid="move-wizard-time-in"]').value)
      .toBe(document.querySelector('[data-testid="move-wizard-time-out"]').value);
    const warning = document.querySelector('[data-testid="move-wizard-overlap-warning"]');
    expect(warning.hidden).toBe(true);
    expect(warning.textContent).toBe('');
  });

  it('warns when arrival is one day before departure; Save still succeeds; no warning when equal', () => {
    seedScene({ includeB1: false, includeEarly: false });
    openMoveStep3();
    const dateOut = document.querySelector('[data-testid="move-wizard-date-out"]');
    const dateIn = document.querySelector('[data-testid="move-wizard-date-in"]');
    dateOut.value = '2026-08-10';
    dateOut.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dateIn.value).toBe('2026-08-10');
    const warning = document.querySelector('[data-testid="move-wizard-overlap-warning"]');
    expect(warning.hidden).toBe(true);

    dateIn.value = '2026-08-09';
    dateIn.dispatchEvent(new Event('input', { bubbles: true }));
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain(`from ${formatShortDate('2026-08-09')} to ${formatShortDate('2026-08-10')}`);

    document.querySelector('[data-testid="move-wizard-save"]').click();
    expect(getById('events', EVT).dateOut).toBe('2026-08-10');
    const destWindows = getAll('eventGroupWindows').filter((w) => w.eventId !== EVT);
    expect(destWindows.some((w) => w.dateJoined === '2026-08-09' && w.groupId === GROUP)).toBe(true);
  });
});

describe('edit-group-window and place-wizard overlap warning', () => {
  it('edit that overlaps another window of the same group shows the warning; Save still succeeds', () => {
    seedScene({ includeB1: false, includeEarly: false, includeB2: false });
    add('events', EventEntity.create({
      id: EVT_OTHER, operationId: OP, farmId: FARM, dateIn: '2026-07-01', dateOut: '2026-08-20',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: OTHER_PW, operationId: OP, eventId: EVT_OTHER, locationId: OTHER_LOC,
      dateOpened: '2026-07-01', dateClosed: '2026-08-20', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_OTHER, operationId: OP, eventId: EVT_OTHER, groupId: GROUP,
      dateJoined: '2026-07-01', dateLeft: '2026-08-05',
      headCount: 12, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    const event = getById('events', EVT);
    const gw = getById('eventGroupWindows', GW_OPEN);
    openEditGroupWindowDialog(gw, event, OP);
    const warning = document.querySelector('[data-testid="edit-gw-overlap-warning"]');
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain(`from ${formatShortDate('2026-08-03')} to ${formatShortDate('2026-08-05')}`);
    expect(warning.textContent).toContain('F - 1..5');

    const dateJoined = document.querySelector('#edit-gw-panel input[type="date"]');
    expect(dateJoined.value).toBe('2026-08-03');
    [...document.querySelectorAll('#edit-gw-panel button')].find((b) => b.textContent === 'Save').click();
    expect(getById('eventGroupWindows', GW_OPEN).dateJoined).toBe('2026-08-03');
  });

  it('place-wizard warns when the new window would overlap; Save still succeeds', () => {
    seedScene({ includeB1: false, includeEarly: false, includeB2: false });
    // Place a second group? Place wizard places an unplaced group. Make a new unplaced group
    // that already has a historical window overlapping the default date.
    const unplaced = '00000000-0000-0000-0000-0000000227c2';
    const histGw = '00000000-0000-0000-0000-0000000227d6';
    add('groups', GroupEntity.create({ id: unplaced, operationId: OP, farmId: FARM, name: 'Replacements' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('events', EventEntity.create({
      id: EVT_OTHER, operationId: OP, farmId: FARM, dateIn: '2026-07-01', dateOut: '2026-12-01',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: OTHER_PW, operationId: OP, eventId: EVT_OTHER, locationId: OTHER_LOC,
      dateOpened: '2026-07-01', dateClosed: '2026-12-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: histGw, operationId: OP, eventId: EVT_OTHER, groupId: unplaced,
      dateJoined: '2026-07-01', dateLeft: '2026-12-01',
      headCount: 4, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    const animal2 = '00000000-0000-0000-0000-0000000227e2';
    add('animals', AnimalEntity.create({
      id: animal2, operationId: OP, tagNum: 'R1', active: true, dateBorn: '2024-06-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: animal2, groupId: unplaced, dateJoined: '2026-07-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    add('animalWeightRecords', AnimalWeightEntity.create({
      operationId: OP, animalId: animal2, weightKg: 400, recordedAt: '2026-07-01T00:00:00Z', source: 'manual',
    }), AnimalWeightEntity.validate, AnimalWeightEntity.toSupabaseShape, 'animal_weight_records');

    openPlaceWizard(unplaced, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();

    const warning = document.querySelector('[data-testid="place-wizard-overlap-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain('F - 1..5');
    document.querySelector('[data-testid="place-wizard-save"]').click();
    const placed = getAll('eventGroupWindows').filter((w) => w.groupId === unplaced && w.eventId !== EVT_OTHER);
    expect(placed.length).toBe(1);
  });
});

describe('paddock-window clamp on a backdated close', () => {
  it('replays the E-3 sequence: paddock closed Nov 17 12:01, event closed back to Nov 16 12:02', () => {
    seedScene({ includeB1: false, includeEarly: false, includeB2: false });
    update(
      'eventPaddockWindows', SRC_PW,
      { dateClosed: '2026-11-17', timeClosed: '12:01' },
      PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
    );
    expect(getById('eventPaddockWindows', SRC_PW).dateClosed).toBe('2026-11-17');
    expect(getById('eventPaddockWindows', SRC_PW).timeClosed).toBe('12:01');

    closeEventTo('2026-11-16', '12:02');

    const pw = getById('eventPaddockWindows', SRC_PW);
    expect(pw.dateClosed).toBe('2026-11-16');
    expect(pw.timeClosed).toBe('12:02');
    expect(getById('events', EVT).dateOut).toBe('2026-11-16');
    expect(getById('events', EVT).timeOut).toBe('12:02');
    expect(getById('eventGroupWindows', GW_OPEN).dateLeft).toBe('2026-11-16');
    expect(getById('eventGroupWindows', GW_OPEN).timeLeft).toBe('12:02');
    const queue = JSON.parse(localStorage.getItem('_sync_queue') || '[]');
    const queuedIds = queue.map((row) => row.id || row.record?.id);
    expect(queuedIds).toContain(SRC_PW);
    expect(queuedIds).toContain(GW_OPEN);
    expect(queuedIds).toContain(EVT);
    const durableKeys = [...new Set(queue.map((row) => {
      try { return JSON.parse(row.durable_key)[0]; } catch { return row.durable_key; }
    }))];
    expect(durableKeys).toHaveLength(1);
  });

  it('keeps the date-conflict dialog for a closed paddock window that opened after the close', () => {
    seedScene({ includeB1: false, includeEarly: false, includeB2: false });
    update(
      'eventPaddockWindows', SRC_PW,
      { dateOpened: '2026-11-17', timeOpened: '12:01', dateClosed: '2026-11-18', timeClosed: '09:00' },
      PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
    );
    const before = getById('eventPaddockWindows', SRC_PW);
    closeEventTo('2026-11-16', '12:02');
    expect(document.querySelector('[data-testid="date-conflict-dialog-title"]')).toBeTruthy();
    expect(getById('events', EVT).dateOut).toBeFalsy();
    const pw = getById('eventPaddockWindows', SRC_PW);
    expect(pw.dateOpened).toBe('2026-11-17');
    expect(pw.dateClosed).toBe('2026-11-18');
    expect(pw.timeClosed).toBe('09:00');
    expect(pw.updatedAt).toBe(before.updatedAt);
  });

  it('replays the E-3 sequence through the move wizard', () => {
    seedScene({ includeB1: false, includeEarly: false, includeB2: false });
    update(
      'eventPaddockWindows', SRC_PW,
      { dateClosed: '2026-11-17', timeClosed: '12:01' },
      PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
    );
    expect(getById('eventPaddockWindows', SRC_PW).dateClosed).toBe('2026-11-17');
    expect(getById('eventPaddockWindows', SRC_PW).timeClosed).toBe('12:01');

    closeEventViaMoveWizard('2026-11-16', '12:02');

    const pw = getById('eventPaddockWindows', SRC_PW);
    expect(pw.dateClosed).toBe('2026-11-16');
    expect(pw.timeClosed).toBe('12:02');
    expect(getById('events', EVT).dateOut).toBe('2026-11-16');
    expect(getById('events', EVT).timeOut).toBe('12:02');
    expect(getById('eventGroupWindows', GW_OPEN).dateLeft).toBe('2026-11-16');
    expect(getById('eventGroupWindows', GW_OPEN).timeLeft).toBe('12:02');
  });

  it('same-day open paddock: close sheet shows the date-conflict dialog and writes nothing', () => {
    seedScene({ includeB1: false, includeEarly: false, includeB2: false });
    openPaddockLaterSameDay();
    closeEventTo('2026-11-16', '12:02');
    expectSameDayOpenConflictUnchanged();
  });

  it('same-day open paddock: move wizard shows the date-conflict dialog and writes nothing', () => {
    seedScene({ includeB1: false, includeEarly: false, includeB2: false });
    openPaddockLaterSameDay();
    closeEventViaMoveWizard('2026-11-16', '12:02');
    expectSameDayOpenConflictUnchanged();
    expect(getAll('events').filter((e) => e.id !== EVT)).toHaveLength(0);
  });
});

describe('pool-write earlier-arrival refusal', () => {
  const FEED_TYPE = '00000000-0000-0000-0000-0000000227f1';
  const BATCH = '00000000-0000-0000-0000-0000000227f2';
  const FEED_ENTRY = '00000000-0000-0000-0000-0000000227f3';

  it('refuses a pool-write transfer when arrival is earlier than departure', () => {
    seedScene({ includeB1: false, includeEarly: false, includeB2: false });
    add('feedTypes', FeedTypeEntity.create({
      id: FEED_TYPE, operationId: OP, name: 'Grass Hay', category: 'hay', unit: 'bale',
    }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    const batch = BatchEntity.create({
      id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'Hay Batch',
      unit: 'bale', quantity: 10, remaining: 8, weightPerUnitKg: 500, dmPct: 85,
    });
    add('batches', batch, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    add('eventFeedEntries', FeedEntryEntity.create({
      id: FEED_ENTRY, operationId: OP, eventId: EVT, batchId: BATCH,
      locationId: SRC_LOC, date: '2026-08-04', time: '09:00', quantity: 4,
      ...inventoryPoolSnapshot(batch),
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    openMoveStep3();
    const dateOut = document.querySelector('[data-testid="move-wizard-date-out"]');
    const dateIn = document.querySelector('[data-testid="move-wizard-date-in"]');
    dateOut.value = '2026-08-10';
    dateOut.dispatchEvent(new Event('input', { bubbles: true }));
    dateIn.value = '2026-08-09';
    dateIn.dispatchEvent(new Event('input', { bubbles: true }));

    const snapshot = JSON.stringify({
      event: getById('events', EVT),
      windows: getAll('eventGroupWindows'),
      paddocks: getAll('eventPaddockWindows'),
      entries: getAll('eventFeedEntries'),
    });
    const remainingInput = document.querySelector('[data-testid^="move-wizard-residual-input-"]');
    remainingInput.value = '4';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const status = document.querySelector('[data-testid="move-wizard-status"]');
    expect(status.textContent).toBe('Feed cannot arrive before the source observation.');
    expect(JSON.stringify({
      event: getById('events', EVT),
      windows: getAll('eventGroupWindows'),
      paddocks: getAll('eventPaddockWindows'),
      entries: getAll('eventFeedEntries'),
    })).toBe(snapshot);
    expect(getAll('events').filter((e) => e.id !== EVT)).toHaveLength(0);
  });
});
