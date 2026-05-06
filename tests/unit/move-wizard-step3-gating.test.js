/** @file OI-0161 — Move wizard Step 3 copy + observation card gating.
 *
 * Step 3 used to render full-event language and both observation cards
 * regardless of mode (scoped vs. full-event) and source/destination
 * location type (land vs. confinement). After OI-0161, Step 3 reflects:
 *
 *   - mode: 'scoped-remaining' (some groups stay) → "Move {group} out of
 *     {paddock}" title; no post-graze card.
 *   - mode: 'scoped-last' + land source → "Close {paddock}" + post-graze.
 *   - mode: 'scoped-last' + confinement source → "Close {paddock}", no obs.
 *   - mode: 'full-event' + land source → "Close Current Event" + post-graze.
 *   - mode: 'full-event' + confinement source → "Close Current Event", no obs.
 *   - dest type 'new' + land → pre-graze card present.
 *   - dest type 'new' + confinement → no pre-graze card.
 *   - dest type 'join' (existing event) → no pre-graze card (existing
 *     paddock already has an open observation from when its event opened).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, update } from '../../src/data/store.js';
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
const SRC_LOC = '00000000-0000-0000-0000-0000000000c1';   // 'G - 5' land paddock
const SRC_LOC_CONF = '00000000-0000-0000-0000-0000000000c4'; // 'Corral A' confinement
const DST_LOC = '00000000-0000-0000-0000-0000000000c2';   // 'G - 7' land destination
const DST_LOC_CONF = '00000000-0000-0000-0000-0000000000c3'; // 'Corral A' confinement destination
const EVT = '00000000-0000-0000-0000-0000000000d1';
const SRC_PW = '00000000-0000-0000-0000-0000000000e1';
const GROUP_A = '00000000-0000-0000-0000-0000000000f1';   // 'Mixed Calves'
const GROUP_B = '00000000-0000-0000-0000-0000000000f2';   // 'Cow-Calf Herd'
const GW_A = '00000000-0000-0000-0000-000000000101';
const GW_B = '00000000-0000-0000-0000-000000000102';
// Second event (for the 'join existing' test).
const EVT2 = '00000000-0000-0000-0000-0000000000d2';
const EVT2_PW = '00000000-0000-0000-0000-0000000000e2';

beforeAll(() => setLocale('en', enLocale));

function seedBase({ srcType = 'land' } = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  // Source location — caller picks land or confinement.
  add('locations', LocationEntity.create({
    id: srcType === 'land' ? SRC_LOC : SRC_LOC_CONF,
    operationId: OP, farmId: FARM,
    name: srcType === 'land' ? 'G - 5' : 'Corral A',
    type: srcType,
    landUse: srcType === 'land' ? 'pasture' : null,
    areaHectares: srcType === 'land' ? 4 : null,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  // Destinations — both available so any test can choose.
  add('locations', LocationEntity.create({
    id: DST_LOC, operationId: OP, farmId: FARM, name: 'G - 7', type: 'land',
    landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: DST_LOC_CONF, operationId: OP, farmId: FARM, name: 'Corral B',
    type: 'confinement', landUse: null, areaHectares: null,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze',
    dateIn: '2026-05-01', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: SRC_PW, operationId: OP, eventId: EVT,
    locationId: srcType === 'land' ? SRC_LOC : SRC_LOC_CONF,
    dateOpened: '2026-05-01', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, farmId: FARM, name: 'Mixed Calves' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GROUP_B, operationId: OP, farmId: FARM, name: 'Cow-Calf Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_A, operationId: OP, eventId: EVT, groupId: GROUP_A,
    dateJoined: '2026-05-01', headCount: 28, avgWeightKg: 250,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_B, operationId: OP, eventId: EVT, groupId: GROUP_B,
    dateJoined: '2026-05-01', headCount: 40, avgWeightKg: 540,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  // Tiny membership so live recompute is non-zero.
  for (let i = 0; i < 4; i++) {
    const aid = `00000000-0000-0000-0000-0000000m${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `M${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP_A,
      dateJoined: '2026-05-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
}

function seedSecondEventOnDestPaddock() {
  // Second open event on DST_LOC for the "join existing" test.
  add('events', EventEntity.create({
    id: EVT2, operationId: OP, farmId: FARM, type: 'graze',
    dateIn: '2026-05-03', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: EVT2_PW, operationId: OP, eventId: EVT2, locationId: DST_LOC,
    dateOpened: '2026-05-03', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

/** Drive the wizard to Step 3 with a 'new'-destination flow. */
function driveToStep3New({ scopedGroupWindowId, destLocId }) {
  const event = { id: EVT, dateIn: '2026-05-01', dateOut: null };
  openMoveWizard(event, OP, FARM, scopedGroupWindowId ? { scopedGroupWindowId } : {});
  document.querySelector('[data-testid="move-wizard-dest-new"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  document.querySelector(`[data-testid="location-picker-item-${destLocId}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
}

/** Drive to Step 3 via the 'join existing' destination path. */
function driveToStep3Join({ scopedGroupWindowId, existingEventId }) {
  const event = { id: EVT, dateIn: '2026-05-01', dateOut: null };
  openMoveWizard(event, OP, FARM, scopedGroupWindowId ? { scopedGroupWindowId } : {});
  document.querySelector('[data-testid="move-wizard-dest-join"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  document.querySelector(`[data-testid="move-wizard-event-${existingEventId}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
}

function getCloseSectionTitle() {
  const el = document.querySelector('[data-testid="move-wizard-close-section-title"]');
  return el ? el.textContent : null;
}
function getPostGrazeCard() {
  return document.querySelector('[data-testid="move-wizard-post-graze-card"]');
}
function getPreGrazeCard() {
  return document.querySelector('[data-testid="move-wizard-pre-graze-card"]');
}

describe('OI-0161 — Step 3 close-section title + post-graze gating', () => {
  it('1. scoped + remaining + land source → no post-graze card; title "Move {group} out of {paddock}"', () => {
    seedBase({ srcType: 'land' });
    driveToStep3New({ scopedGroupWindowId: GW_A, destLocId: DST_LOC });
    expect(getPostGrazeCard()).toBeFalsy();
    expect(getCloseSectionTitle()).toBe('Move Mixed Calves out of G - 5');
  });

  it('2. scoped + last + land source → post-graze rendered; title "Close {paddock}"', () => {
    seedBase({ srcType: 'land' });
    // Close GW_B first so GW_A is the only open group remaining.
    update('eventGroupWindows', GW_B, { dateLeft: '2026-05-04' },
      GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    driveToStep3New({ scopedGroupWindowId: GW_A, destLocId: DST_LOC });
    expect(getPostGrazeCard()).toBeTruthy();
    expect(getCloseSectionTitle()).toBe('Close G - 5');
  });

  it('3. scoped + last + confinement source → no post-graze card; title "Close {paddock}"', () => {
    seedBase({ srcType: 'confinement' });
    update('eventGroupWindows', GW_B, { dateLeft: '2026-05-04' },
      GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    driveToStep3New({ scopedGroupWindowId: GW_A, destLocId: DST_LOC });
    expect(getPostGrazeCard()).toBeFalsy();
    expect(getCloseSectionTitle()).toBe('Close Corral A');
  });

  it('4. full-event + land source (regression) → post-graze rendered; title "Close Current Event"', () => {
    seedBase({ srcType: 'land' });
    driveToStep3New({ scopedGroupWindowId: null, destLocId: DST_LOC });
    expect(getPostGrazeCard()).toBeTruthy();
    expect(getCloseSectionTitle()).toBe('Close Current Event');
  });

  it('5. full-event + confinement source → no post-graze card', () => {
    seedBase({ srcType: 'confinement' });
    driveToStep3New({ scopedGroupWindowId: null, destLocId: DST_LOC });
    expect(getPostGrazeCard()).toBeFalsy();
    expect(getCloseSectionTitle()).toBe('Close Current Event');
  });
});

describe('OI-0161 — Step 3 pre-graze gating', () => {
  it('6. land destination (regression) → pre-graze card present', () => {
    seedBase({ srcType: 'land' });
    driveToStep3New({ scopedGroupWindowId: null, destLocId: DST_LOC });
    expect(getPreGrazeCard()).toBeTruthy();
  });

  it('7. confinement destination → no pre-graze card', () => {
    seedBase({ srcType: 'land' });
    driveToStep3New({ scopedGroupWindowId: null, destLocId: DST_LOC_CONF });
    expect(getPreGrazeCard()).toBeFalsy();
  });

  it('8. join existing event (regression) → no pre-graze card', () => {
    seedBase({ srcType: 'land' });
    seedSecondEventOnDestPaddock();
    driveToStep3Join({ scopedGroupWindowId: null, existingEventId: EVT2 });
    expect(getPreGrazeCard()).toBeFalsy();
  });
});
