/**
 * @file OI-0185 — atomic close + move with pre-flight window-close validation.
 *
 * Two integration paths:
 *   - close.js `executeClose` — a conflicting paddock window aborts with zero
 *     writes (no half-closed windows, event date_out unchanged).
 *   - move-wizard.js `executeMoveWizard` — a conflicting source paddock window
 *     aborts with zero source-departure writes (no GW left-stamps, no orphan
 *     destination event). This is the 2026-06-14 E-series→D regression.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../src/data/store.js';
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
import { openCloseEventSheet } from '../../src/features/events/close.js';
import { openMoveWizard } from '../../src/features/events/move-wizard.js';

const OP = '00000000-0000-0000-0000-000000018601';
const FARM = '00000000-0000-0000-0000-000000018602';
const SRC_LOC = '00000000-0000-0000-0000-0000000186a1'; // E-5
const DST_LOC = '00000000-0000-0000-0000-0000000186a2'; // D
const EVT = '00000000-0000-0000-0000-000000018611';
const SRC_PW = '00000000-0000-0000-0000-0000000186b1';
const GROUP = '00000000-0000-0000-0000-0000000186c1';
const GW = '00000000-0000-0000-0000-0000000186d1';

beforeAll(() => setLocale('en', enLocale));

function seedScene({ pwOpenDate }) {
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
  for (const [id, name] of [[SRC_LOC, 'E-5'], [DST_LOC, 'D']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateIn: '2026-06-01',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: SRC_PW, operationId: OP, eventId: EVT, locationId: SRC_LOC,
    dateOpened: pwOpenDate, areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-06-01', headCount: 12, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  // Memberships so the live-weight recompute path doesn't bail.
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

describe('OI-0185 — close.js pre-flight + atomic apply', () => {
  it('a conflicting paddock window aborts the close with zero writes', () => {
    seedScene({ pwOpenDate: '2026-06-14' });

    openCloseEventSheet({ id: EVT, operationId: OP, dateIn: '2026-06-01', dateOut: null }, OP);
    const dateOutInput = document.querySelector('[data-testid="close-event-date-out"]');
    dateOutInput.value = '2026-06-06';
    document.querySelector('[data-testid="close-event-save"]').click();

    // The OI-0186 guided dialog opened — not a raw error toast / statusEl text.
    const dialog = document.querySelector('[data-testid="date-conflict-dialog-title"]');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/dateClosed must be on or after/);
    expect(document.body.textContent).not.toMatch(/dateClosed must be on or after/);

    // ZERO WRITES: the paddock window stays open, the group window stays open,
    // the event date_out is still null.
    expect(getById('eventPaddockWindows', SRC_PW).dateClosed).toBeFalsy();
    expect(getById('eventGroupWindows', GW).dateLeft).toBeFalsy();
    expect(getById('events', EVT).dateOut).toBeFalsy();
  });

  it('a clean close (no conflict) goes through normally — no regression', () => {
    seedScene({ pwOpenDate: '2026-06-01' });

    openCloseEventSheet({ id: EVT, operationId: OP, dateIn: '2026-06-01', dateOut: null }, OP);
    const dateOutInput = document.querySelector('[data-testid="close-event-date-out"]');
    dateOutInput.value = '2026-06-30';
    document.querySelector('[data-testid="close-event-save"]').click();

    // Clean close writes land.
    expect(getById('eventPaddockWindows', SRC_PW).dateClosed).toBe('2026-06-30');
    expect(getById('eventGroupWindows', GW).dateLeft).toBe('2026-06-30');
    expect(getById('events', EVT).dateOut).toBe('2026-06-30');
  });
});

describe('OI-0185 — move-wizard.js pre-flight + atomic apply (2026-06-14 regression)', () => {
  it('a conflicting source paddock window aborts the move with zero source-departure writes (no orphan dest event)', () => {
    seedScene({ pwOpenDate: '2026-06-14' });

    const evt = { id: EVT, dateIn: '2026-06-01', dateOut: null };
    openMoveWizard(evt, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();

    // Force the move-out to a date BEFORE the source PW opened.
    document.querySelector('[data-testid="move-wizard-date-out"]').value = '2026-06-06';
    document.querySelector('[data-testid="move-wizard-save"]').click();

    // OI-0186 guided dialog opens — no raw validator string anywhere.
    const dialog = document.querySelector('[data-testid="date-conflict-dialog-title"]');
    expect(dialog).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/dateClosed must be on or after/);

    // Source GW NOT stamped left — this is the orphan-prevention assertion.
    expect(getById('eventGroupWindows', GW).dateLeft).toBeFalsy();
    // Source PW unchanged.
    expect(getById('eventPaddockWindows', SRC_PW).dateClosed).toBeFalsy();
    // Source event date_out unchanged.
    expect(getById('events', EVT).dateOut).toBeFalsy();
    // No destination event was created.
    const others = getAll('events').filter(e => e.id !== EVT);
    expect(others.length).toBe(0);
    // No destination paddock window, no destination group window.
    expect(getAll('eventPaddockWindows').filter(w => w.id !== SRC_PW)).toHaveLength(0);
    expect(getAll('eventGroupWindows').filter(w => w.id !== GW)).toHaveLength(0);
  });
});
