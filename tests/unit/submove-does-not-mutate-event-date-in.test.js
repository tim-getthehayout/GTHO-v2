/**
 * @file OI-0115 regression — sub-move Open (and adjacent paddock-window flows)
 * must not mutate the parent event's date_in.
 *
 * Tim's live field-test repro: event.dateIn=2026-04-16, main paddock G1. Tap
 * Sub-Move on dashboard card, pick G3, leave dateOpened=today (2026-04-18),
 * Save. Result pre-fix: event.dateIn was overwritten to 2026-04-18, every
 * time-based metric downstream went wrong.
 *
 * Root cause: detail.js:323 dateInInput change handler was unguarded. Phantom
 * `change` events fired during teardown re-renders (renderSummary triggered
 * by `notify('eventPaddockWindows')` on sub-move Save) could overwrite
 * event.dateIn with whatever the input's `.value` was at teardown. iOS Safari
 * native date pickers are the most plausible real-browser trigger — jsdom
 * doesn't model that, so jsdom alone didn't reproduce Tim's live bug, but
 * the synthetic-change test below exercises the same guard contract.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
// Calc registrations used by detail.js.
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/capacity.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/survey-bale-ring.js';
import { openEventDetailSheet, closeEventDetailSheet } from '../../src/features/events/detail.js';
import { openSubmoveOpenSheet, openSubmoveCloseSheet } from '../../src/features/events/submove.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const G1 = '00000000-0000-0000-0000-0000000000c1';
const G3 = '00000000-0000-0000-0000-0000000000c3';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const PW_G1 = '00000000-0000-0000-0000-0000000000e1';
const PW_G3 = '00000000-0000-0000-0000-0000000000e3';
const GROUP = '00000000-0000-0000-0000-000000000101';
const GW = '00000000-0000-0000-0000-000000000102';

const ORIG_DATE_IN = '2026-04-16';
const SUBMOVE_DATE = '2026-04-18';

beforeAll(() => setLocale('en', enLocale));

function seed() {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: G1, operationId: OP, farmId: FARM, name: 'G1',
    type: 'land', landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: G3, operationId: OP, farmId: FARM, name: 'G3',
    type: 'land', landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM,
    type: 'graze', dateIn: ORIG_DATE_IN, dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_G1, operationId: OP, eventId: EVT, locationId: G1,
    dateOpened: ORIG_DATE_IN, areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: ORIG_DATE_IN, headCount: 10, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
}

beforeEach(seed);

describe('OI-0115 — sub-move Open must not mutate event.date_in', () => {
  it("baseline repro (Tim's exact flow): dateIn stays unchanged after sub-move Save", () => {
    openSubmoveOpenSheet({ id: EVT }, OP);
    document.querySelector('[data-testid="submove-open-date"]').value = SUBMOVE_DATE;
    document.querySelector(`[data-testid="location-picker-item-${G3}"]`).click();
    document.querySelector('[data-testid="submove-open-save"]').click();

    const after = getById('events', EVT);
    expect(after.dateIn).toBe(ORIG_DATE_IN);
    // And the new paddock window was created correctly.
    const newPw = getAll('eventPaddockWindows').find(pw => pw.eventId === EVT && pw.locationId === G3);
    expect(newPw).toBeTruthy();
    expect(newPw.dateOpened).toBe(SUBMOVE_DATE);
  });

  it('with Event Detail open: sub-move Save still does not mutate dateIn (suspect 1 scenario)', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    openSubmoveOpenSheet({ id: EVT }, OP);
    document.querySelector('[data-testid="submove-open-date"]').value = SUBMOVE_DATE;
    document.querySelector(`[data-testid="location-picker-item-${G3}"]`).click();
    document.querySelector('[data-testid="submove-open-save"]').click();

    const after = getById('events', EVT);
    expect(after.dateIn).toBe(ORIG_DATE_IN);
    closeEventDetailSheet();
  });

  it("phantom change on dateInInput (simulating iOS Safari's teardown native-picker cascade) is a no-op", () => {
    // Open Event Detail so the dateInInput exists.
    openEventDetailSheet({ id: EVT }, OP, FARM);

    // The dateInInput is inside a closure-rendered IIFE so we don't have a
    // testid. Pull it out by querying inputs of type="date" inside the hero
    // block.
    const hero = document.querySelector('[data-testid="detail-summary"]');
    const dateInInput = hero.querySelector('input[type="date"]');
    expect(dateInInput).toBeTruthy();
    expect(dateInInput.value).toBe(ORIG_DATE_IN);

    // Simulate the phantom change: the browser/picker wrote today's date into
    // the input's .value AND the input is about to be torn down by a re-render.
    // The handler must NOT write the phantom value to the store.
    dateInInput.value = SUBMOVE_DATE;
    dateInInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Pre-fix this would have mutated event.dateIn to SUBMOVE_DATE.
    const after = getById('events', EVT);
    expect(after.dateIn).toBe(ORIG_DATE_IN);
    closeEventDetailSheet();
  });

  it('disconnected-input change is a no-op (Guard 1)', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const hero = document.querySelector('[data-testid="detail-summary"]');
    const dateInInput = hero.querySelector('input[type="date"]');

    // Remove the input from the DOM (mimics renderSummary's clear() teardown).
    dateInInput.remove();
    // Now dispatch a late change — it should not write.
    dateInInput.value = SUBMOVE_DATE;
    dateInInput.dispatchEvent(new Event('change', { bubbles: true }));

    const after = getById('events', EVT);
    expect(after.dateIn).toBe(ORIG_DATE_IN);
    closeEventDetailSheet();
  });

  it('genuine user edit still writes to the store (fix does not break the legitimate path)', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    const hero = document.querySelector('[data-testid="detail-summary"]');
    const dateInInput = hero.querySelector('input[type="date"]');
    expect(dateInInput.value).toBe(ORIG_DATE_IN);

    // Real user edit: value differs from render-time snapshot AND input stays
    // connected AND the new value is valid (no earlier child records).
    dateInInput.value = '2026-04-15';
    dateInInput.dispatchEvent(new Event('change', { bubbles: true }));

    const after = getById('events', EVT);
    expect(after.dateIn).toBe('2026-04-15');
    closeEventDetailSheet();
  });
});

describe('OI-0115 — adjacent-flow smoke: Sub-move Close Save', () => {
  it('sub-move Close Save does not mutate event.date_in', () => {
    // Seed a second paddock window so we have something to close.
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_G3, operationId: OP, eventId: EVT, locationId: G3,
      dateOpened: SUBMOVE_DATE, areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

    const pw = getById('eventPaddockWindows', PW_G3);
    openSubmoveCloseSheet(pw, OP);
    document.querySelector('[data-testid="submove-close-date"]').value = '2026-04-19';
    document.querySelector('[data-testid="submove-close-save"]').click();

    const after = getById('events', EVT);
    expect(after.dateIn).toBe(ORIG_DATE_IN);
  });
});
