/**
 * @file OI-0187 — window edit dialogs must compare against `floorDate.date`,
 *   not the bare `{ date, time, name }` object returned by
 *   `getEventStartFloorExcluding`.
 *
 * Pre-fix, `"2026-06-11" < {object}` coerced the object to `"[object Object]"`;
 * since `"2"` (50) sorts before `"["` (91), the guard fired UNCONDITIONALLY on
 * every multi-window event — every open/join-date edit was blocked. Live repro
 * 2026-06-23: anchor B-3 opened the 9th, editing B-2 to the 11th rejected.
 *
 * These tests assert the guard now respects the actual floor date — later than
 * the floor saves; earlier than the floor still blocks with the same message.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getById, setSyncAdapter } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import { openEditPaddockWindowDialog } from '../../src/features/events/edit-paddock-window.js';
import { openEditGroupWindowDialog } from '../../src/features/events/edit-group-window.js';

const OP = '00000000-0000-0000-0000-000000018701';
const FARM = '00000000-0000-0000-0000-000000018702';
const LOC_ANCHOR = '00000000-0000-0000-0000-000000018703'; // B-3 — opened earlier (the floor)
const LOC_EDIT = '00000000-0000-0000-0000-000000018704'; // B-2 — being edited
const EVT = '00000000-0000-0000-0000-000000018711';
const PW_ANCHOR = '00000000-0000-0000-0000-0000000187a1';
const PW_EDIT = '00000000-0000-0000-0000-0000000187a2';
const GROUP_ANCHOR = '00000000-0000-0000-0000-0000000187b1';
const GROUP_EDIT = '00000000-0000-0000-0000-0000000187b2';
const GW_ANCHOR = '00000000-0000-0000-0000-0000000187c1';
const GW_EDIT = '00000000-0000-0000-0000-0000000187c2';

beforeAll(() => setLocale('en', enLocale));

function seed() {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  setSyncAdapter({
    push: () => {}, pushBatch: () => {}, pull: () => {}, pullAll: () => {},
    delete: () => {}, isOnline: () => true, getStatus: () => 'idle',
    onStatusChange: () => {},
  });

  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  for (const [id, name] of [[LOC_ANCHOR, 'B-3'], [LOC_EDIT, 'B-2']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 2,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze',
    dateIn: '2026-06-09', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');

  // Anchor (B-3) opens the 9th — this is the event-start floor.
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_ANCHOR, operationId: OP, eventId: EVT, locationId: LOC_ANCHOR,
    dateOpened: '2026-06-09', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  // Sub-move (B-2) — the window being edited. Initial open date is 06-12 so
  // both the "move later to 11" and the "move earlier to 08" inputs are
  // meaningful changes.
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_EDIT, operationId: OP, eventId: EVT, locationId: LOC_EDIT,
    dateOpened: '2026-06-12', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

  // Group window pair — anchor joined the 9th, edited GW joined the 12th.
  for (const [gid, name] of [[GROUP_ANCHOR, 'Anchor Group'], [GROUP_EDIT, 'Edit Group']]) {
    add('groups', GroupEntity.create({ id: gid, operationId: OP, farmId: FARM, name }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  }
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_ANCHOR, operationId: OP, eventId: EVT, groupId: GROUP_ANCHOR,
    dateJoined: '2026-06-09', headCount: 5, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_EDIT, operationId: OP, eventId: EVT, groupId: GROUP_EDIT,
    dateJoined: '2026-06-12', headCount: 4, avgWeightKg: 480,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
}

beforeEach(seed);

function getFirstSaveButton(panelId) {
  // Both panels render their Save button inside a `.btn-row` near the bottom.
  // Pick the first .btn-green descendant — that's the explicit Save action.
  return document.querySelector(`#${panelId} .btn-row .btn-green`);
}

describe('OI-0187 — edit-paddock-window floor comparison', () => {
  it('accepts a later open date than the sibling floor (the 2026-06-23 B-2→11th repro)', () => {
    const pw = getById('eventPaddockWindows', PW_EDIT);
    const evt = getById('events', EVT);
    openEditPaddockWindowDialog(pw, evt, OP);

    const panel = document.getElementById('edit-pw-panel');
    const dateInput = panel.querySelector('input[type="date"]');
    dateInput.value = '2026-06-11'; // later than the 06-09 anchor — must save
    getFirstSaveButton('edit-pw-panel').click();

    // No error rendered.
    expect(panel.querySelector('.auth-error')?.textContent || '').not.toMatch(/can't open before/);
    // The window's dateOpened persisted.
    expect(getById('eventPaddockWindows', PW_EDIT).dateOpened).toBe('2026-06-11');
  });

  it('still blocks an open date strictly before the sibling floor', () => {
    const pw = getById('eventPaddockWindows', PW_EDIT);
    const evt = getById('events', EVT);
    openEditPaddockWindowDialog(pw, evt, OP);

    const panel = document.getElementById('edit-pw-panel');
    const dateInput = panel.querySelector('input[type="date"]');
    dateInput.value = '2026-06-08'; // before the 06-09 anchor — must block
    getFirstSaveButton('edit-pw-panel').click();

    expect(panel.querySelector('.auth-error').textContent).toMatch(/can't open before/);
    // Unchanged in store.
    expect(getById('eventPaddockWindows', PW_EDIT).dateOpened).toBe('2026-06-12');
  });
});

describe('OI-0187 — edit-group-window floor comparison', () => {
  it('accepts a later join date than the sibling floor', () => {
    const gw = getById('eventGroupWindows', GW_EDIT);
    const evt = getById('events', EVT);
    openEditGroupWindowDialog(gw, evt, OP);

    const panel = document.getElementById('edit-gw-panel');
    const dateInput = panel.querySelector('input[type="date"]');
    dateInput.value = '2026-06-11';
    getFirstSaveButton('edit-gw-panel').click();

    expect(panel.querySelector('.auth-error')?.textContent || '').not.toMatch(/can't join before/);
    expect(getById('eventGroupWindows', GW_EDIT).dateJoined).toBe('2026-06-11');
  });

  it('still blocks a join date strictly before the sibling floor', () => {
    const gw = getById('eventGroupWindows', GW_EDIT);
    const evt = getById('events', EVT);
    openEditGroupWindowDialog(gw, evt, OP);

    const panel = document.getElementById('edit-gw-panel');
    const dateInput = panel.querySelector('input[type="date"]');
    dateInput.value = '2026-06-08';
    getFirstSaveButton('edit-gw-panel').click();

    expect(panel.querySelector('.auth-error').textContent).toMatch(/can't join before/);
    expect(getById('eventGroupWindows', GW_EDIT).dateJoined).toBe('2026-06-12');
  });
});
