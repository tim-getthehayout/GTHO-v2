/**
 * @file OI-0186 — Guided date-conflict correction dialog.
 *
 * Covers (a) dialog rendering from a conflict list, (b) the one-tap "Set open
 * date" fix + resume, (c) the "Edit…" jump to openEditPaddockWindowDialog,
 * (d) the "Fix all" path for multi-conflict, and (e) the end-to-end
 * close-with-conflict → dialog → set open date → resume → successful close
 * happy-path.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add, getById, setSyncAdapter } from '../../src/data/store.js';
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
import { openDateConflictDialog } from '../../src/features/events/date-conflict-dialog.js';
import { openCloseEventSheet } from '../../src/features/events/close.js';

const OP = '00000000-0000-0000-0000-000000018701';
const FARM = '00000000-0000-0000-0000-000000018702';
const LOC_A = '00000000-0000-0000-0000-0000000187a1';
const LOC_B = '00000000-0000-0000-0000-0000000187a2';
const EVT = '00000000-0000-0000-0000-000000018711';
const PW_A = '00000000-0000-0000-0000-0000000187b1';
const PW_B = '00000000-0000-0000-0000-0000000187b2';
const GROUP = '00000000-0000-0000-0000-0000000187c1';
const GW = '00000000-0000-0000-0000-0000000187d1';

beforeAll(() => setLocale('en', enLocale));

function seedScene({ pwOpenDates = ['2026-06-14'] } = {}) {
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
  for (const [id, name] of [[LOC_A, 'E-5'], [LOC_B, 'D']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateIn: '2026-06-01',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');

  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_A, operationId: OP, eventId: EVT, locationId: LOC_A,
    dateOpened: pwOpenDates[0], areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  if (pwOpenDates[1]) {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_B, operationId: OP, eventId: EVT, locationId: LOC_B,
      dateOpened: pwOpenDates[1], areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  }
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-06-01', headCount: 12, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  for (let i = 0; i < 12; i++) {
    const aid = `00000000-0000-0000-0000-00000000a${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `A${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP,
      dateJoined: '2026-06-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
}

beforeEach(() => seedScene());

describe('openDateConflictDialog — rendering', () => {
  it('renders the structured paddock conflict line (no raw validator string)', () => {
    openDateConflictDialog({
      conflicts: [{
        kind: 'paddock', windowId: PW_A, eventId: EVT, locationId: LOC_A,
        openDate: '2026-06-14', outDate: '2026-06-06',
        entityError: 'dateClosed must be on or after dateOpened',
      }],
      operationId: OP,
      onResume: () => {},
      event: { id: EVT },
    });
    const title = document.querySelector('[data-testid="date-conflict-dialog-title"]');
    expect(title).toBeTruthy();
    const list = document.querySelector('[data-testid="date-conflict-dialog-list"]');
    expect(list.textContent).toMatch(/E-5/);
    expect(list.textContent).toMatch(/2026-06-14/);
    expect(list.textContent).toMatch(/2026-06-06/);
    // The raw entity error message is NEVER user-facing.
    expect(document.body.textContent).not.toMatch(/dateClosed must be on or after/);
  });

  it('renders Fix all only when there is more than one conflict', () => {
    openDateConflictDialog({
      conflicts: [{
        kind: 'paddock', windowId: PW_A, eventId: EVT, locationId: LOC_A,
        openDate: '2026-06-14', outDate: '2026-06-06', entityError: '',
      }],
      operationId: OP, onResume: () => {}, event: { id: EVT },
    });
    expect(document.querySelector('[data-testid="date-conflict-fix-all"]')).toBeFalsy();
  });
});

describe('openDateConflictDialog — one-tap fix + resume', () => {
  it('Set-open-date clamps the window\'s dateOpened to the out-date and fires onResume', () => {
    const resume = vi.fn();
    openDateConflictDialog({
      conflicts: [{
        kind: 'paddock', windowId: PW_A, eventId: EVT, locationId: LOC_A,
        openDate: '2026-06-14', outDate: '2026-06-06', entityError: '',
      }],
      operationId: OP,
      event: { id: EVT },
      onResume: resume,
    });

    document.querySelector(`[data-testid="date-conflict-set-${PW_A}"]`).click();
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-06-06');
    expect(resume).toHaveBeenCalledOnce();
  });

  it('Fix all clamps every conflict\'s open date and fires onResume once', () => {
    seedScene({ pwOpenDates: ['2026-06-14', '2026-06-15'] });
    const resume = vi.fn();
    openDateConflictDialog({
      conflicts: [
        { kind: 'paddock', windowId: PW_A, eventId: EVT, locationId: LOC_A, openDate: '2026-06-14', outDate: '2026-06-06', entityError: '' },
        { kind: 'paddock', windowId: PW_B, eventId: EVT, locationId: LOC_B, openDate: '2026-06-15', outDate: '2026-06-06', entityError: '' },
      ],
      operationId: OP, event: { id: EVT }, onResume: resume,
    });

    document.querySelector('[data-testid="date-conflict-fix-all"]').click();
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-06-06');
    expect(getById('eventPaddockWindows', PW_B).dateOpened).toBe('2026-06-06');
    expect(resume).toHaveBeenCalledOnce();
  });

  it('Cancel does not write and does not call onResume', () => {
    const resume = vi.fn();
    openDateConflictDialog({
      conflicts: [{
        kind: 'paddock', windowId: PW_A, eventId: EVT, locationId: LOC_A,
        openDate: '2026-06-14', outDate: '2026-06-06', entityError: '',
      }],
      operationId: OP, event: { id: EVT }, onResume: resume,
    });
    document.querySelector('[data-testid="date-conflict-cancel"]').click();
    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-06-14');
    expect(resume).not.toHaveBeenCalled();
  });
});

describe('openDateConflictDialog — Edit… jumps to edit-paddock-window', () => {
  it('opens openEditPaddockWindowDialog for the paddock-kind conflict', () => {
    openDateConflictDialog({
      conflicts: [{
        kind: 'paddock', windowId: PW_A, eventId: EVT, locationId: LOC_A,
        openDate: '2026-06-14', outDate: '2026-06-06', entityError: '',
      }],
      operationId: OP, event: { id: EVT }, onResume: () => {},
    });
    document.querySelector(`[data-testid="date-conflict-edit-${PW_A}"]`).click();
    // The edit dialog's panel becomes populated.
    const editPanel = document.getElementById('edit-pw-panel');
    expect(editPanel).toBeTruthy();
    expect(editPanel.textContent).toMatch(/Edit paddock window/);
  });
});

describe('end-to-end: close.js → conflict → dialog → set-open-date → resume → successful close', () => {
  it('closes the event cleanly after the user accepts the one-tap fix', () => {
    seedScene();
    openCloseEventSheet({ id: EVT, operationId: OP, dateIn: '2026-06-01', dateOut: null }, OP);
    document.querySelector('[data-testid="close-event-date-out"]').value = '2026-06-06';
    document.querySelector('[data-testid="close-event-save"]').click();

    // Dialog opens; no writes yet.
    expect(document.querySelector('[data-testid="date-conflict-dialog-title"]')).toBeTruthy();
    expect(getById('events', EVT).dateOut).toBeFalsy();

    // User taps Set-open-date — the dialog should call onResume which re-runs
    // executeClose with the same inputs; pre-flight now passes; close lands.
    document.querySelector(`[data-testid="date-conflict-set-${PW_A}"]`).click();

    expect(getById('eventPaddockWindows', PW_A).dateOpened).toBe('2026-06-06');
    expect(getById('eventPaddockWindows', PW_A).dateClosed).toBe('2026-06-06');
    expect(getById('eventGroupWindows', GW).dateLeft).toBe('2026-06-06');
    expect(getById('events', EVT).dateOut).toBe('2026-06-06');
  });
});
