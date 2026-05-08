/** @file OI-0163 — Place wizard for unplaced groups.
 *
 * Covers the full openPlaceWizard → Step 1 → Step 2 → Step 3 → Save flow
 * for both 'new' and 'join' destination paths, plus the empty-group
 * pre-open guard, strip-graze setup, cross-farm placement, and the
 * try/catch error path. The save sequence is steps 6/7/9 of
 * V2_UX_FLOWS.md §1.6 only — no source close, no feed transfer, no
 * `events.date_out` writes.
 *
 * Sync verification (CLAUDE.md "E2E Testing — Verify Supabase, Not Just
 * UI") is covered by a separate e2e spec. Unit tests assert against the
 * in-memory store; the equivalent Supabase queries land in
 * tests/e2e/place-wizard.spec.js when the e2e harness is wired.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add, getAll, getById } from '../../../src/data/store.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as AnimalWeightEntity from '../../../src/entities/animal-weight-record.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { logger } from '../../../src/utils/logger.js';
import { openPlaceWizard } from '../../../src/features/events/place-wizard.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const FARM_2 = '00000000-0000-0000-0000-0000000000bc';
const LAND = '00000000-0000-0000-0000-0000000000c1';
const LAND_2 = '00000000-0000-0000-0000-0000000000c4';
const CONFINEMENT = '00000000-0000-0000-0000-0000000000c2';
const JOIN_LAND = '00000000-0000-0000-0000-0000000000c3';
const JOIN_EVT = '00000000-0000-0000-0000-0000000000d1';
const JOIN_PW = '00000000-0000-0000-0000-0000000000e1';
const GROUP = '00000000-0000-0000-0000-0000000000f1';
const EMPTY_GROUP = '00000000-0000-0000-0000-0000000000f2';
const ANIMAL = '00000000-0000-0000-0000-0000000000a1';

beforeAll(() => setLocale('en', enLocale));

function seedBase({ withMembership = true, withJoinTarget = false, withSecondFarm = false } = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';

  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Home Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');

  if (withSecondFarm) {
    add('farms', FarmEntity.create({ id: FARM_2, operationId: OP, name: 'North Farm' }),
      FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
    add('locations', LocationEntity.create({
      id: LAND_2, operationId: OP, farmId: FARM_2, name: 'North-Pasture-1',
      type: 'land', landUse: 'pasture', areaHectares: 6,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }

  add('locations', LocationEntity.create({
    id: LAND, operationId: OP, farmId: FARM, name: 'Pasture-A', type: 'land',
    landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: CONFINEMENT, operationId: OP, farmId: FARM, name: 'Dry-Lot-1',
    type: 'confinement',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');

  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Calf Group' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: EMPTY_GROUP, operationId: OP, name: 'Empty Group' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');

  if (withMembership) {
    add('animals', AnimalEntity.create({
      id: ANIMAL, operationId: OP, tagNum: 'A1', active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: ANIMAL, groupId: GROUP,
      dateJoined: '2026-01-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    // Weight record so the live avg-weight recompute returns a positive
    // number (GroupWindowEntity validator rejects avgWeightKg <= 0).
    add('animalWeightRecords', AnimalWeightEntity.create({
      operationId: OP, animalId: ANIMAL, weightKg: 250,
      recordedAt: '2026-01-15T00:00:00Z', source: 'manual',
    }), AnimalWeightEntity.validate, AnimalWeightEntity.toSupabaseShape, 'animal_weight_records');
  }

  if (withJoinTarget) {
    add('locations', LocationEntity.create({
      id: JOIN_LAND, operationId: OP, farmId: FARM, name: 'Pasture-Join',
      type: 'land', landUse: 'pasture', areaHectares: 5,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('events', EventEntity.create({
      id: JOIN_EVT, operationId: OP, farmId: FARM, type: 'graze',
      dateIn: '2026-04-01', dateOut: null,
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: JOIN_PW, operationId: OP, eventId: JOIN_EVT, locationId: JOIN_LAND,
      dateOpened: '2026-04-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  }
}

function driveToStep3({ destLocId, joinEventId, stripGraze = false, farmId } = {}) {
  openPlaceWizard(GROUP, OP, farmId || FARM);
  if (joinEventId) {
    document.querySelector('[data-testid="move-wizard-dest-join"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="move-wizard-event-${joinEventId}"]`).click();
  } else {
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${destLocId}"]`).click();
    if (stripGraze) {
      const cb = document.querySelector('[data-testid="move-wizard-strip-graze"]');
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
      const sizeInput = document.querySelector('[data-testid="move-wizard-strip-size"]');
      if (sizeInput) {
        sizeInput.value = '25';
        sizeInput.dispatchEvent(new Event('input'));
      }
    }
  }
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
}

describe('OI-0163 — place wizard pre-open guard', () => {
  it('opens with non-empty group → sheet renders Step 1', () => {
    seedBase({ withMembership: true });
    openPlaceWizard(GROUP, OP, FARM);
    const title = document.querySelector('#place-wizard-sheet-panel h2.wizard-step-title');
    expect(title).toBeTruthy();
    expect(title.textContent).toMatch(/Place/);
    // The destType-picker cards must be present (Step 1 rendered).
    expect(document.querySelector('[data-testid="move-wizard-dest-new"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="move-wizard-dest-join"]')).toBeTruthy();
  });

  it('opens with empty group (0 active memberships) → toast shown, sheet does not open', () => {
    seedBase({ withMembership: false });
    openPlaceWizard(EMPTY_GROUP, OP, FARM);
    const toast = document.querySelector('[data-testid="toast"]');
    expect(toast).toBeTruthy();
    expect(toast.textContent).toMatch(/no animals/i);
    expect(document.querySelector('[data-testid="place-wizard-step-1-title"]')).toBeFalsy();
  });
});

describe('OI-0163 — place wizard navigation', () => {
  beforeEach(() => seedBase({ withMembership: true, withJoinTarget: true }));

  it('Step 1 Next is disabled until a destType is selected', () => {
    openPlaceWizard(GROUP, OP, FARM);
    const next = document.querySelector('[data-testid="move-wizard-step-1-next"]');
    expect(next.hasAttribute('disabled')).toBe(true);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    const nextAfter = document.querySelector('[data-testid="move-wizard-step-1-next"]');
    expect(nextAfter.hasAttribute('disabled')).toBe(false);
  });

  it('Step 2 (new + land) → Step 3 shows date in + time in + pre-graze card', () => {
    driveToStep3({ destLocId: LAND });
    expect(document.querySelector('[data-testid="place-wizard-date-in"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="place-wizard-time-in"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="place-wizard-pre-graze-card"]')).toBeTruthy();
  });

  it('Step 2 (new + confinement) → Step 3 shows date in + time in only, no pre-graze card', () => {
    driveToStep3({ destLocId: CONFINEMENT });
    expect(document.querySelector('[data-testid="place-wizard-date-in"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="place-wizard-time-in"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="place-wizard-pre-graze-card"]')).toBeFalsy();
  });

  it('Step 2 (join) → Step 3 shows date in + time in only, no pre-graze card', () => {
    driveToStep3({ joinEventId: JOIN_EVT });
    expect(document.querySelector('[data-testid="place-wizard-date-in"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="place-wizard-time-in"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="place-wizard-pre-graze-card"]')).toBeFalsy();
  });
});

describe('OI-0163 — place wizard Save (new destination)', () => {
  it('Save (new + land) → 1 event with source_event_id null + 1 PW + 1 GW + 1 obs + 0 feed entries + 0 close writes', () => {
    seedBase({ withMembership: true });
    driveToStep3({ destLocId: LAND });
    document.querySelector('[data-testid="place-wizard-save"]').click();

    const events = getAll('events');
    expect(events).toHaveLength(1);
    expect(events[0].sourceEventId == null).toBe(true);
    expect(events[0].farmId).toBe(FARM);

    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === events[0].id);
    expect(pws).toHaveLength(1);
    expect(pws[0].locationId).toBe(LAND);
    expect(pws[0].dateClosed == null).toBe(true);

    const gws = getAll('eventGroupWindows').filter(w => w.eventId === events[0].id);
    expect(gws).toHaveLength(1);
    expect(gws[0].groupId).toBe(GROUP);
    expect(gws[0].dateLeft == null).toBe(true);

    const obs = getAll('paddockObservations').filter(o => o.sourceId === pws[0].id);
    expect(obs).toHaveLength(1);
    expect(obs[0].type).toBe('open');

    expect(getAll('eventFeedEntries')).toHaveLength(0);
    expect(getAll('eventFeedChecks')).toHaveLength(0);
  });

  it('Save (new + confinement) → 1 event + 1 PW + 1 GW + 0 paddock observations', () => {
    seedBase({ withMembership: true });
    driveToStep3({ destLocId: CONFINEMENT });
    document.querySelector('[data-testid="place-wizard-save"]').click();

    const events = getAll('events');
    expect(events).toHaveLength(1);
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === events[0].id);
    expect(pws).toHaveLength(1);
    expect(pws[0].locationId).toBe(CONFINEMENT);
    const gws = getAll('eventGroupWindows').filter(w => w.eventId === events[0].id);
    expect(gws).toHaveLength(1);
    expect(getAll('paddockObservations')).toHaveLength(0);
  });

  it('Save (strip-graze toggled on) → new PW has is_strip_graze=true, strip_group_id set, area_pct reflects strip', () => {
    seedBase({ withMembership: true });
    driveToStep3({ destLocId: LAND, stripGraze: true });
    document.querySelector('[data-testid="place-wizard-save"]').click();

    const events = getAll('events');
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === events[0].id);
    expect(pws).toHaveLength(1);
    expect(pws[0].isStripGraze).toBe(true);
    expect(typeof pws[0].stripGroupId).toBe('string');
    expect(pws[0].stripGroupId.length).toBeGreaterThan(0);
    expect(pws[0].areaPct).toBe(25);
  });

  it('Cross-farm placement (Farm chip differs from active farm) → new event farmId matches chip selection', () => {
    seedBase({ withMembership: true, withSecondFarm: true });
    openPlaceWizard(GROUP, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    // Switch the farm chip to FARM_2.
    const farmSelect = document.querySelector('[data-testid="move-wizard-farm-select"]');
    expect(farmSelect).toBeTruthy();
    farmSelect.value = FARM_2;
    farmSelect.dispatchEvent(new Event('change'));
    // Pick the FARM_2 location, which only appears after the farm switch
    // re-renders the location picker.
    document.querySelector(`[data-testid="location-picker-item-${LAND_2}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    document.querySelector('[data-testid="place-wizard-save"]').click();

    const events = getAll('events');
    expect(events).toHaveLength(1);
    expect(events[0].farmId).toBe(FARM_2);
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === events[0].id);
    expect(pws[0].locationId).toBe(LAND_2);
  });
});

describe('OI-0163 — place wizard Save (join existing event)', () => {
  it('Save (join) → 0 new events, 0 new paddock windows, 1 new GW on the existing event, 0 paddock observations', () => {
    seedBase({ withMembership: true, withJoinTarget: true });
    const eventsBefore = getAll('events').length;
    const pwsBefore = getAll('eventPaddockWindows').length;
    const obsBefore = getAll('paddockObservations').length;

    driveToStep3({ joinEventId: JOIN_EVT });
    document.querySelector('[data-testid="place-wizard-save"]').click();

    expect(getAll('events').length).toBe(eventsBefore);
    expect(getAll('eventPaddockWindows').length).toBe(pwsBefore);
    expect(getAll('paddockObservations').length).toBe(obsBefore);

    const newGWs = getAll('eventGroupWindows').filter(w => w.eventId === JOIN_EVT);
    expect(newGWs).toHaveLength(1);
    expect(newGWs[0].groupId).toBe(GROUP);
    expect(newGWs[0].dateLeft == null).toBe(true);
  });
});

describe('OI-0163 — place wizard error handling', () => {
  it('Save throws → wizard catches, surfaces error in statusEl, sheet stays open, logger.error called with category place-wizard + groupId', () => {
    seedBase({ withMembership: true });

    const errSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const origValidate = EventEntity.validate;
    const validateSpy = vi.spyOn(EventEntity, 'validate').mockImplementation((rec) => {
      // Reject the destination event write so executePlaceWizard's
      // try/catch surfaces the error in statusEl instead of closing.
      if (rec.farmId === FARM) throw new Error('synthetic place-throw');
      return origValidate(rec);
    });

    try {
      driveToStep3({ destLocId: LAND });
      document.querySelector('[data-testid="place-wizard-save"]').click();
    } finally {
      validateSpy.mockRestore();
    }

    const status = document.querySelector('[data-testid="place-wizard-status"]');
    expect(status).toBeTruthy();
    expect(status.textContent).toMatch(/Save failed/i);

    // Sheet still open — Step 3 elements present.
    expect(document.querySelector('[data-testid="place-wizard-save"]')).toBeTruthy();

    // Logger called with the place-wizard category and groupId.
    expect(errSpy).toHaveBeenCalled();
    const [category, _msg, ctx] = errSpy.mock.calls[0];
    expect(category).toBe('place-wizard');
    expect(ctx.groupId).toBe(GROUP);

    errSpy.mockRestore();
  });
});

// Silence the deliberate logger.error in the throw simulation.
vi.stubGlobal('console', {
  ...console,
  // eslint-disable-next-line no-empty-function
  error: () => {},
});
