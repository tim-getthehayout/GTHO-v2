/**
 * @file OI-0285 (Tim t1448u, option A) — F1 hay unknowns use the OI-0249 Zp
 * partial rule: a hay-unknown location-day adds nothing to DMI / stored feed /
 * DMI days; the season is the known sum marked partial; "—" only when nothing
 * known remains. Calendar rows + List (computeLocationMetrics), per-window
 * metrics (OI-0283 sheet) and sort all read the same values.
 * B amendment (Tim t1475u, #440): on an OPEN event with feed out and no check
 * since, hay eaten = 0 and pasture = full need — KNOWN days flagged
 * dmiFeedCheckNeeded (~ + "Feed check needed"); a check or close replaces it.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { readFileSync } from 'node:fs';
import { _reset, add, getById } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetSheetScrollLock } from '../../src/ui/sheet.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as AnimalClassEntity from '../../src/entities/animal-class.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PwEntity from '../../src/entities/event-paddock-window.js';
import * as GwEntity from '../../src/entities/event-group-window.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import {
  computeLocationMetrics,
  formatMetricValue,
} from '../../src/features/events/rotation-calendar/location-metrics.js';
import { computePaddockWindowMetrics } from '../../src/features/events/rotation-calendar/past-window.js';
import { sortMetricRows } from '../../src/features/events/rotation-calendar/sort-rows.js';
import {
  buildPwDmiStats, openPastEventDetailSheet, resetPastEventDetailSheet,
} from '../../src/features/events/rotation-calendar/past-event-detail-sheet.js';

const HAY_NOTE = "Hay not counted yet: do a feed check.";
const CHECK_NOTE = 'Feed check needed';
const DAY_KG = 10 * 453.6 * 0.025; // 113.4 kg DM / day for the 10-head herd

const loc = { id: 'loc1', name: 'J2', type: 'land', landUse: 'pasture', areaHectares: 4.047 };
const cls = { id: 'ac1', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
const clsBad = { id: 'acBad', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
const animals = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, classId: 'ac1', archived: false, status: 'active' }));
const badAnimals = Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, classId: 'acBad', archived: false, status: 'active' }));

// Closed, fully known event: Oct 1 – Oct 10, no hay.
const evClosed = { id: 'ev1', dateOut: '2026-10-10' };
const pwClosed = { id: 'pw1', eventId: 'ev1', locationId: 'loc1', dateOpened: '2026-10-01', dateClosed: '2026-10-10', areaPct: 100 };
const gwClosed = { id: 'gw1', eventId: 'ev1', groupId: 'g1', animalClassId: 'ac1', dateJoined: '2026-10-01', dateLeft: '2026-10-10', headCount: 10, avgWeightKg: 453.6 };
// Open event (d4a043d8 shape): opened Nov 20, one bale delivered, no feed check.
const evOpen = { id: 'ev2', dateOut: null };
const pwOpen = { id: 'pw2', eventId: 'ev2', locationId: 'loc1', dateOpened: '2026-11-20', dateClosed: null, areaPct: 100 };
const gwOpen = { id: 'gw2', eventId: 'ev2', groupId: 'g1', animalClassId: 'ac1', dateJoined: '2026-11-20', dateLeft: null, headCount: 10, avgWeightKg: 453.6 };
const openBale = {
  id: 'fe-open', eventId: 'ev2', locationId: 'loc1', date: '2026-11-20', time: '15:46',
  quantity: 1, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85, kind: 'inventory_feeding', feedTypeId: 'hay',
};
const hayType = { id: 'hay', unit: 'bale', nPct: 1.5, pPct: 0.2, kPct: 1.0, dmPct: 85 };

function ctx({ events = [evClosed], paddockWindows = [pwClosed], groupWindows = [gwClosed], feedEntries = [], feedChecks = [], feedCheckItems = [], withBad = false } = {}) {
  const all = withBad ? [...animals, ...badAnimals] : animals;
  return {
    windowStart: '2026-10-01',
    windowEnd: '2027-09-30',
    today: '2026-11-24',
    events,
    paddockWindows,
    groupWindows,
    memberships: all.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: a.classId === 'acBad' ? 'g2' : 'g1', dateJoined: '2026-01-01', dateLeft: null })),
    animals: all,
    animalClasses: [cls, clsBad],
    animalWeightRecords: animals.map(a => ({ animalId: a.id, weightKg: 453.6, recordedAt: '2026-09-01' })),
    locations: [loc],
    observations: [],
    feedEntries,
    feedChecks,
    feedCheckItems,
    batches: [],
    feedTypes: feedEntries.length ? [hayType] : [],
    batchNutritionalProfiles: [],
  };
}

const withOpenHay = (extra = {}) => ctx({
  events: [evClosed, evOpen],
  paddockWindows: [pwClosed, pwOpen],
  groupWindows: [gwClosed, gwOpen],
  feedEntries: [openBale],
  ...extra,
});

describe('OI-0285 — hay unknowns use the Zp partial rule', () => {
  it('1. B: open event, bale delivered, no check since → hay 0, pasture = full need, KNOWN + flagged', () => {
    const known = computeLocationMetrics(loc, ctx());
    const noHay = computeLocationMetrics(loc, withOpenHay({ feedEntries: [] }));
    const m = computeLocationMetrics(loc, withOpenHay());
    expect(noHay.dmiKg).toBeGreaterThan(known.dmiKg); // the open days carry demand
    expect(m.dmiKg).toBeCloseTo(noHay.dmiKg, 6); // hay eaten 0 → pasture = need
    expect(m.dmiFeedCheckNeeded).toBe(true);
    expect(m.dmiPartial).toBe(false);
    expect(m.dmiKnown).toBe(true);
    expect(m.dmiHayUnknown).toBe(false); // not "Hay not counted yet" for this case
    expect(m.storedFeedDmiKg).toBe(known.storedFeedDmiKg); // no stored feed until a check
    expect(m.dmiPerHa).toBeCloseTo(m.dmiKg / 4.047, 6);
    // No stored-feed NPK deposit until a check: N/P/K match the no-hay run.
    expect(m.nKg).toBeCloseTo(noHay.nKg, 6);
    expect(m.kKg).toBeCloseTo(noHay.kKg, 6);
  });

  it('2. B: only the open event in the window: DMI and DMI/area both numbers (not —), flagged', () => {
    const m = computeLocationMetrics(loc, ctx({
      events: [evOpen], paddockWindows: [pwOpen], groupWindows: [gwOpen], feedEntries: [openBale],
    }));
    expect(m.dmiKg).toBeGreaterThan(0);
    expect(m.dmiPerHa).toBeCloseTo(m.dmiKg / 4.047, 6);
    expect(m.dmiFeedCheckNeeded).toBe(true);
    expect(m.dmiPartial).toBe(false);
    expect(m.stripPastureDmiKg).toBeCloseTo(m.dmiKg, 6); // same as the Sz strip
  });

  it('2b. B: a feed check replaces the estimate (compute-on-read)', () => {
    const noHay = computeLocationMetrics(loc, withOpenHay({ feedEntries: [] }));
    const check = (remaining) => ({
      feedChecks: [{ id: 'fcO', eventId: 'ev2', date: '2026-11-22', time: '12:00', isCloseReading: false }],
      feedCheckItems: [{ id: 'iO', feedCheckId: 'fcO', locationId: 'loc1', feedTypeId: 'hay', remainingQuantity: remaining, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85 }],
    });
    const eaten = computeLocationMetrics(loc, withOpenHay(check(0)));
    expect(eaten.dmiFeedCheckNeeded).toBe(false); // pool empty after the check
    expect(eaten.storedFeedDmiKg).toBeGreaterThan(0); // measured hay now counted
    expect(eaten.dmiKg).toBeLessThan(noHay.dmiKg);
    expect(eaten.dmiPartial).toBe(false);
    const left = computeLocationMetrics(loc, withOpenHay(check(0.5)));
    expect(left.storedFeedDmiKg).toBeGreaterThan(0);
    expect(left.dmiFeedCheckNeeded).toBe(true); // hay still out after the check
  });

  it('2c. B: a check missing its unit stays unknown (Zp partial), not an estimate', () => {
    const m = computeLocationMetrics(loc, withOpenHay({
      feedChecks: [{ id: 'fcU', eventId: 'ev2', date: '2026-11-22', time: '12:00', isCloseReading: false }],
      feedCheckItems: [{ id: 'iU', feedCheckId: 'fcU', locationId: 'loc1', feedTypeId: 'hay', remainingQuantity: 0.5, weightPerUnitKgSnapshot: null, dmPctSnapshot: null }],
      feedTypes: [{ id: 'hay', unit: 'bale' }],
    }));
    expect(m.dmiHayUnknown).toBe(true);
    expect(m.dmiPartial).toBe(true);
  });

  it('2d. J2-style row over Mar 1 – Nov 24: DMI and DMI per acre both fill in', () => {
    const base = withOpenHay({ events: [evClosed, evOpen] });
    const today = computeLocationMetrics(loc, { ...base, windowStart: '2026-03-01', windowEnd: '2026-11-24' });
    const nov22 = computeLocationMetrics(loc, { ...base, windowStart: '2026-03-01', windowEnd: '2026-11-22' });
    expect(today.dmiKg).not.toBeNull();
    expect(today.dmiPerHa).not.toBeNull();
    expect(today.dmiPerHa).toBeCloseTo(today.dmiKg / 4.047, 6);
    expect(today.dmiFeedCheckNeeded).toBe(true);
    expect(today.dmiKg).toBeGreaterThan(nov22.dmiKg); // Nov 23–24 count at full need
    expect(nov22.dmiFeedCheckNeeded).toBe(true); // Nov 20–22 are also after the bale
  });

  it('3. weight-unknown + closed unmeasured hay with known days: partial known sum', () => {
    const gwBad = { id: 'gw3', eventId: 'ev1', groupId: 'g2', animalClassId: 'acBad', dateJoined: '2026-10-01', dateLeft: '2026-10-10', headCount: 3, avgWeightKg: null };
    const unmeasured = [{ ...openBale, id: 'fe1', eventId: 'ev1', date: '2026-10-05', time: null }];
    const weightOnly = computeLocationMetrics(loc, ctx({ groupWindows: [gwClosed, gwBad], withBad: true }));
    const m = computeLocationMetrics(loc, ctx({ groupWindows: [gwClosed, gwBad], withBad: true, feedEntries: unmeasured }));
    expect(m.dmiKg).toBeLessThan(weightOnly.dmiKg);
    expect(m.dmiKg).toBeGreaterThan(0);
    expect(m.dmiPartial).toBe(true);
    expect(m.dmiHayUnknown).toBe(true);
    expect(m.dmiWeightUnknown).toBe(true);
    expect(m.dmiFeedCheckNeeded).toBe(false); // closed event: no estimate
  });

  it('3b. closed event, hay from day one never measured, nothing known left: —', () => {
    const m = computeLocationMetrics(loc, ctx({
      feedEntries: [{ ...openBale, id: 'fe1', eventId: 'ev1', date: '2026-10-01', time: '00:00' }],
    }));
    expect(m.dmiKg).toBeNull();
    expect(m.dmiPerHa).toBeNull();
    expect(m.dmiPartial).toBe(false);
    expect(m.dmiHayUnknown).toBe(true);
    expect(m.dmiFeedCheckNeeded).toBe(false);
  });


  it('4. closed event with an unmeasured hay span: known days count, partial (not season-blank)', () => {
    // Delivery Oct 5, no feed check / close reading → Oct 5..10 hay unknown, Oct 1..4 known.
    const m = computeLocationMetrics(loc, ctx({
      feedEntries: [{ ...openBale, id: 'fe1', eventId: 'ev1', date: '2026-10-05', time: null }],
    }));
    expect(m.dmiKg).toBeCloseTo(4 * DAY_KG, 6);
    expect(m.dmiPartial).toBe(true);
    expect(m.dmiHayUnknown).toBe(true);
    expect(m.storedFeedDmiKg).toBe(0);
    expect(m.dmiPerHa).toBeCloseTo((4 * DAY_KG) / 4.047, 6);
  });

  it('4b. closed event: measured span then an unmeasured span → measured span keeps its stored feed, partial', () => {
    const m = computeLocationMetrics(loc, ctx({
      feedEntries: [
        { ...openBale, id: 'fe1', eventId: 'ev1', date: '2026-10-01', time: '08:00', quantity: 4 },
        { ...openBale, id: 'fe2', eventId: 'ev1', date: '2026-10-06', time: '08:00', quantity: 2 },
      ],
      feedChecks: [
        { id: 'fc1', eventId: 'ev1', date: '2026-10-01', time: '08:00', isCloseReading: false },
        { id: 'fc2', eventId: 'ev1', date: '2026-10-05', time: '08:00', isCloseReading: false },
      ],
      feedCheckItems: [
        { id: 'i1', feedCheckId: 'fc1', locationId: 'loc1', feedTypeId: 'hay', remainingQuantity: 4, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85 },
        { id: 'i2', feedCheckId: 'fc2', locationId: 'loc1', feedTypeId: 'hay', remainingQuantity: 2, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85 },
      ],
    }));
    expect(m.dmiKg).not.toBeNull();
    expect(m.dmiKg).toBeGreaterThanOrEqual(0);
    expect(m.storedFeedDmiKg).toBeGreaterThan(0);
    expect(m.dmiPartial).toBe(true);
    expect(m.dmiHayUnknown).toBe(true);
  });

  it('5. regression: fully known season is numerically unchanged (golden values from main 364e21d)', () => {
    const m = computeLocationMetrics(loc, ctx());
    expect(m.dmiKg).toBeCloseTo(GOLDEN.noHay.dmiKg, 6);
    expect(m.dmiPartial).toBe(false);
    expect(m.dmiHayUnknown).toBe(false);
    const measured = computeLocationMetrics(loc, ctx(MEASURED));
    expect(measured.dmiKg).toBeCloseTo(GOLDEN.measured.dmiKg, 6);
    expect(measured.storedFeedDmiKg).toBeCloseTo(GOLDEN.measured.storedFeedDmiKg, 6);
    expect(measured.dmiPartial).toBe(false);
    expect(measured.dmiHayUnknown).toBe(false);
  });

  it('sort: a partial row and a feed-check estimate sort by their numbers (not as —)', () => {
    const a = { ...computeLocationMetrics(loc, ctx({
      feedEntries: [{ ...openBale, id: 'fe1', eventId: 'ev1', date: '2026-10-05', time: null }],
    })), locationName: 'A' };
    expect(a.dmiPartial).toBe(true);
    const est = { ...computeLocationMetrics(loc, withOpenHay()), locationName: 'E' };
    expect(est.dmiFeedCheckNeeded).toBe(true);
    const b = { ...computeLocationMetrics({ ...loc, id: 'loc1', name: 'B' }, ctx()), locationName: 'B', dmiKg: a.dmiKg - 1 };
    const dash = { ...a, locationName: 'C', dmiKg: null, dmiPartial: false };
    const order = sortMetricRows([dash, b, a, est], { key: 'dmiKg', dir: 'desc' }).map(r => r.locationName);
    expect(order).toEqual(['E', 'A', 'B', 'C']);
  });

  it('calendar row hover: DMI cells add the hay note; weight reason only when weights caused it', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).toMatch(/metrics\?\.dmiHayUnknown \? t\('event\.dmiHayNotCounted'\)/);
    expect(src).toMatch(/dmiWeightUnknown !== false/);
    expect(enLocale.event.dmiHayNotCounted).toBe(HAY_NOTE);
    expect(enLocale.event.dmiFeedCheckNeeded).toBe(CHECK_NOTE);
  });

  it('retires the season-sticky lock comment in location-metrics.js', () => {
    const src = readFileSync('src/features/events/rotation-calendar/location-metrics.js', 'utf8');
    expect(src).not.toContain('F1 hay unknown stays season-sticky (OI-0246 lock)');
    expect(src).toContain('OI-0285');
  });
});

// A fully measured closed event: delivery 4 bales Oct 1, check Oct 1 (4 left), close reading Oct 10 (0 left).
const MEASURED = {
  feedEntries: [{ ...openBale, id: 'fe1', eventId: 'ev1', date: '2026-10-01', time: '08:00', quantity: 4 }],
  feedChecks: [
    { id: 'fc1', eventId: 'ev1', date: '2026-10-01', time: '08:00', isCloseReading: false },
    { id: 'fc2', eventId: 'ev1', date: '2026-10-10', time: '08:00', isCloseReading: true },
  ],
  feedCheckItems: [
    { id: 'i1', feedCheckId: 'fc1', locationId: 'loc1', feedTypeId: 'hay', remainingQuantity: 4, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85 },
    { id: 'i2', feedCheckId: 'fc2', locationId: 'loc1', feedTypeId: 'hay', remainingQuantity: 0, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85 },
  ],
};
const GOLDEN = {
  noHay: { dmiKg: 1020.6 }, // 9 grazing days × 113.4 (left Oct 10)
  measured: { dmiKg: 37.8, storedFeedDmiKg: 1700 }, // 4 bales × 500 kg × 85 % DM
};

describe('OI-0285 — 6. per-window metrics + OI-0283 sheet', () => {
  it('open window with unchecked hay: hay-0 estimate (flagged); closed unmeasured window: partial', () => {
    const span = { start: '2026-11-20', end: '2026-11-24', days: 5 };
    const wm = computePaddockWindowMetrics(pwOpen, loc, evOpen, span, withOpenHay());
    expect(wm.dmi).toBeGreaterThan(0);
    expect(wm.pasturePct).toBe(100);
    expect(wm.feedPct).toBe(0);
    expect(wm.raw.dmiFeedCheckNeeded).toBe(true);
    expect(wm.raw.dmiHayUnknown).toBe(false);
    const closedSpan = { start: '2026-10-01', end: '2026-10-10', days: 10 };
    const wm2 = computePaddockWindowMetrics(pwClosed, loc, evClosed, closedSpan, ctx({
      feedEntries: [{ ...openBale, id: 'fe1', eventId: 'ev1', date: '2026-10-05', time: null }],
    }));
    expect(wm2.dmi).toBeCloseTo(4 * DAY_KG, 6);
    expect(wm2.raw.dmiPartial).toBe(true);
  });
});

const OP = '00000000-0000-0000-0000-0000000005aa';
const FARM = '00000000-0000-0000-0000-0000000005bb';
const CLASS = '00000000-0000-0000-0000-0000000005cd';
const LOC = '00000000-0000-0000-0000-0000000005d1';
const GROUP = '00000000-0000-0000-0000-000000000601';
const EVT = '00000000-0000-0000-0000-0000000005e1';
const PW = '00000000-0000-0000-0000-0000000005f1';
const GW = '00000000-0000-0000-0000-000000000611';
const FTID = '00000000-0000-0000-0000-000000000701';
const BATCH = '00000000-0000-0000-0000-000000000702';

function shift(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function put(store, entity, sbTable, row) {
  add(store, entity.create(row), entity.validate, entity.toSupabaseShape, sbTable);
}

/** Active event opened `daysAgo` days ago; optional bale delivered `deliveredDaysAgo` days ago, no check. */
function seedStore({ daysAgo = 6, deliveredDaysAgo = null } = {}) {
  _reset();
  localStorage.clear();
  const today = getLocalTodayStr();
  const open = shift(today, -daysAgo);
  put('operations', OperationEntity, 'operations', { id: OP, name: 'Op', unitSystem: 'imperial' });
  put('farms', FarmEntity, 'farms', { id: FARM, operationId: OP, name: 'Farm' });
  put('farmSettings', FarmSettingEntity, 'farm_settings', { farmId: FARM, operationId: OP });
  put('animalClasses', AnimalClassEntity, 'animal_classes', {
    id: CLASS, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow', dmiPct: 2.5, defaultWeightKg: 500,
  });
  put('locations', LocationEntity, 'locations', {
    id: LOC, operationId: OP, farmId: FARM, name: 'J2', type: 'land', landUse: 'pasture', areaHectares: 4,
  });
  put('groups', GroupEntity, 'groups', { id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' });
  for (let i = 0; i < 10; i++) {
    const aid = `00000000-0000-0000-0000-0000000c${i.toString().padStart(4, '0')}`;
    put('animals', AnimalEntity, 'animals', {
      id: aid, operationId: OP, tagNum: `c${i}`, active: true, animalClassId: CLASS, dateBorn: '2024-01-01', sex: 'F',
    });
    put('animalGroupMemberships', MembershipEntity, 'animal_group_memberships', {
      operationId: OP, animalId: aid, groupId: GROUP, dateJoined: open, dateLeft: null,
    });
  }
  put('events', EventEntity, 'events', { id: EVT, operationId: OP, farmId: FARM, dateOut: null });
  put('eventPaddockWindows', PwEntity, 'event_paddock_windows', {
    id: PW, operationId: OP, eventId: EVT, locationId: LOC, dateOpened: open, dateClosed: null, areaPct: 100,
  });
  put('eventGroupWindows', GwEntity, 'event_group_windows', {
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP, dateJoined: open, dateLeft: null, headCount: 10, avgWeightKg: 500,
  });
  if (deliveredDaysAgo != null) {
    put('feedTypes', FeedTypeEntity, 'feed_types', { id: FTID, operationId: OP, name: 'Hay', category: 'hay', unit: 'bale' });
    put('batches', BatchEntity, 'batches', {
      id: BATCH, operationId: OP, feedTypeId: FTID, name: 'H', source: 'purchase', quantity: 10, remaining: 9,
      unit: 'bale', weightPerUnitKg: 500, dmPct: 85,
    });
    put('eventFeedEntries', FeedEntryEntity, 'event_feed_entries', {
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC, date: shift(today, -deliveredDaysAgo), quantity: 1,
    });
  }
}

const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const val = (id) => q(`${id}-value`)?.textContent;

describe('OI-0285 — 6b. OI-0283 sheet shows the partial cue + hay note', () => {
  beforeAll(() => setLocale('en', enLocale));
  afterEach(() => {
    resetPastEventDetailSheet();
    resetSheetScrollLock();
    document.body.innerHTML = '';
  });

  it('open window, hay delivered part-way with no check: "~" estimate + Feed check needed, no hay / weight note', () => {
    seedStore({ daysAgo: 6, deliveredDaysAgo: 2 });
    const s = buildPwDmiStats(getById('eventPaddockWindows', PW), getById('locations', LOC), getById('events', EVT));
    expect(s.dmiPartial).toBe(false);
    expect(s.dmiFeedCheckNeeded).toBe(true);
    expect(s.dmiHayUnknown).toBe(false);
    expect(s.pastureKg).toBeGreaterThan(0);
    expect(s.pastureKgPerHa).not.toBeNull();
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(val('past-event-detail-dmi-total')).toMatch(/^~[\d,]+ lb DM$/);
    expect(val('past-event-detail-dmi-pasture')).toMatch(/^~/);
    expect(val('past-event-detail-dmi-pasture-per-area')).toMatch(/^~/);
    expect(q('past-event-detail-dmi-feed-check').textContent).toBe(CHECK_NOTE);
    expect(q('past-event-detail-dmi-hay')).toBeNull();
    expect(q('past-event-detail-dmi-partial')).toBeNull(); // weights are all known
  });

  it('open window, hay from day one with no check: "~" numbers (not —) + Feed check needed', () => {
    seedStore({ daysAgo: 3, deliveredDaysAgo: 3 });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(val('past-event-detail-dmi-total')).toMatch(/^~[\d,]+ lb DM$/);
    expect(q('past-event-detail-dmi-feed-check').textContent).toBe(CHECK_NOTE);
    expect(q('past-event-detail-dmi-hay')).toBeNull();
  });

  it('calendar row + past block: "~" on DMI and DMI/ac, "Feed check needed" on hover', () => {
    seedStore({ daysAgo: 3, deliveredDaysAgo: 3 });
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderCalendarGrid(container);
    const cell = container.querySelector(`[data-testid="loc-mgmt-metrics"][data-location-id="${LOC}"]`);
    for (const key of ['dmiKg', 'dmiPerAcre']) {
      const m = cell.querySelector(`.loc-mgmt__metric[data-key="${key}"]`);
      expect(m.querySelector('.loc-mgmt__metric-value').textContent).toMatch(/^~[\d,.]+/);
      expect(m.getAttribute('title')).toContain(CHECK_NOTE);
      expect(m.getAttribute('title')).not.toContain(HAY_NOTE);
      expect(m.dataset.feedCheckNeeded).toBe('true');
    }
    expect(cell.querySelector('.loc-mgmt__metric[data-key="dmiKg"]').dataset.partial).not.toBe('true');
    const strip = container.querySelector(`[data-testid="timeline-strip"][data-location-id="${LOC}"]`);
    expect(strip.textContent).toMatch(/Pasture 100% · Feed 0% · ~[\d,]+ lb DMI/);
  });

  it('no hay: no hay note', () => {
    seedStore({ daysAgo: 3 });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-dmi-hay')).toBeNull();
  });
});
