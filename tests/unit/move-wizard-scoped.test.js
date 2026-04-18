/**
 * @file Per-group scoped move (OI-0066) — invariant tests for the close-out
 * decision logic. The wizard's save path must:
 *
 *   1. Close only the scoped event_group_window, not every open GW on the event
 *   2. Leave the source event open as long as any other GW stays open
 *   3. Close the source event (and its paddock windows) only when the last
 *      group leaves
 *   4. Full "Move all" (no scope) keeps today's all-groups behavior
 *
 * We drive executeMoveWizard via the public openMoveWizard entry point,
 * seed a two-group event, and click the wizard forward.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, update, getAll, getById } from '../../src/data/store.js';
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
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openMoveWizard } from '../../src/features/events/move-wizard.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const SRC_LOC = '00000000-0000-0000-0000-0000000000c1';
const DST_LOC = '00000000-0000-0000-0000-0000000000c2';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const SRC_PW = '00000000-0000-0000-0000-0000000000e1';
const GROUP_A = '00000000-0000-0000-0000-0000000000f1';
const GROUP_B = '00000000-0000-0000-0000-0000000000f2';
const GW_A = '00000000-0000-0000-0000-000000000101';
const GW_B = '00000000-0000-0000-0000-000000000102';

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
  for (const [id, name] of [[SRC_LOC, 'Source'], [DST_LOC, 'Dest']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze',
    dateIn: '2026-04-01', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: SRC_PW, operationId: OP, eventId: EVT, locationId: SRC_LOC,
    dateOpened: '2026-04-01', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  // Two groups on one event — both open.
  add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, farmId: FARM, name: 'Group A' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GROUP_B, operationId: OP, farmId: FARM, name: 'Group B' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_A, operationId: OP, eventId: EVT, groupId: GROUP_A,
    dateJoined: '2026-04-01', headCount: 10, avgWeightKg: 450,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_B, operationId: OP, eventId: EVT, groupId: GROUP_B,
    dateJoined: '2026-04-01', headCount: 12, avgWeightKg: 520,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  // Seed a tiny membership so live head count > 0 — the executeMoveWizard
  // step uses getLiveWindowHeadCount which reads memberships.
  for (let i = 0; i < 10; i++) {
    const aid = `00000000-0000-0000-0000-00000000a${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `A${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP_A,
      dateJoined: '2026-04-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
  for (let i = 0; i < 12; i++) {
    const aid = `00000000-0000-0000-0000-00000000b${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `B${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP_B,
      dateJoined: '2026-04-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
});

function pickDestAndSave({ scopedGroupWindowId }) {
  const event = { id: EVT, dateIn: '2026-04-01', dateOut: null };
  openMoveWizard(event, OP, FARM, scopedGroupWindowId ? { scopedGroupWindowId } : {});
  // Step 1: dest type "new"
  document.querySelector('[data-testid="move-wizard-dest-new"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  // Step 2: pick destination location
  document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
  // Step 3: save
  document.querySelector('[data-testid="move-wizard-save"]').click();
}

describe('Move wizard — per-group scoped move (OI-0066)', () => {
  it('scoped move: only the scoped GW gets dateLeft; other GW stays open', () => {
    pickDestAndSave({ scopedGroupWindowId: GW_A });

    const gwA = getById('eventGroupWindows', GW_A);
    const gwB = getById('eventGroupWindows', GW_B);
    expect(gwA.dateLeft, 'scoped group A should be closed').toBeTruthy();
    expect(gwB.dateLeft, 'unscoped group B stays open').toBeFalsy();
  });

  it('scoped move: source event stays open when another group remains', () => {
    pickDestAndSave({ scopedGroupWindowId: GW_A });
    const src = getById('events', EVT);
    expect(src.dateOut, 'source event open until last group leaves').toBeFalsy();
  });

  it('scoped move: source paddock window stays open when another group remains', () => {
    pickDestAndSave({ scopedGroupWindowId: GW_A });
    const pw = getById('eventPaddockWindows', SRC_PW);
    expect(pw.dateClosed, 'source PW open until last group leaves').toBeFalsy();
  });

  it('scoped move creates a new destination event with just one group window', () => {
    pickDestAndSave({ scopedGroupWindowId: GW_A });
    const newEvents = getAll('events').filter(e => e.id !== EVT);
    expect(newEvents.length).toBe(1);
    const newGWs = getAll('eventGroupWindows').filter(w => w.eventId === newEvents[0].id);
    expect(newGWs.length).toBe(1);
    expect(newGWs[0].groupId).toBe(GROUP_A);
  });

  it('non-scoped "Move all": closes every GW + source event + paddock window', () => {
    pickDestAndSave({ scopedGroupWindowId: null });
    const gwA = getById('eventGroupWindows', GW_A);
    const gwB = getById('eventGroupWindows', GW_B);
    const src = getById('events', EVT);
    const pw = getById('eventPaddockWindows', SRC_PW);
    expect(gwA.dateLeft).toBeTruthy();
    expect(gwB.dateLeft).toBeTruthy();
    expect(src.dateOut).toBeTruthy();
    expect(pw.dateClosed).toBeTruthy();
  });

  it('scoped move on the last open group closes the event + paddock window', () => {
    // Close GW_B first so GW_A is the only open group remaining on the event.
    update('eventGroupWindows', GW_B, { dateLeft: '2026-04-05' },
      GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    pickDestAndSave({ scopedGroupWindowId: GW_A });
    const src = getById('events', EVT);
    const pw = getById('eventPaddockWindows', SRC_PW);
    expect(src.dateOut, 'last group leaving closes event').toBeTruthy();
    expect(pw.dateClosed, 'last group leaving closes paddock window').toBeTruthy();
  });
});
