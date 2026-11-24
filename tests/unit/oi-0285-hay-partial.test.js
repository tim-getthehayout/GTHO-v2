/**
 * @file OI-0285 (Tim t1448u, option A) — F1 hay unknowns use the OI-0249 Zp
 * partial rule: a hay-unknown location-day adds nothing to DMI / stored feed /
 * DMI days; the season is the known sum marked partial; "—" only when nothing
 * known remains. Calendar rows + List (computeLocationMetrics), per-window
 * metrics (OI-0283 sheet) and sort all read the same values.
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
  it('1. known closed event + open event with unchecked hay: known sum, partial, per-ha non-null', () => {
    const known = computeLocationMetrics(loc, ctx());
    const m = computeLocationMetrics(loc, withOpenHay());
    expect(m.dmiKg).not.toBeNull();
    expect(m.dmiKg).toBeCloseTo(known.dmiKg, 6); // open-event hay days add nothing
    expect(m.dmiPartial).toBe(true);
    expect(m.dmiKnown).toBe(true);
    expect(m.dmiHayUnknown).toBe(true);
    expect(m.dmiWeightUnknown).toBe(false);
    expect(m.dmiPerHa).toBeCloseTo(known.dmiKg / 4.047, 6);
    expect(m.storedFeedDmiKg).toBe(known.storedFeedDmiKg); // unknown hay adds no stored feed
    expect(formatMetricValue(m.dmiKg)).not.toBe('—');
  });

  it('2. only DMI days are hay-unknown: dmiKg null (—), dmiPerHa null', () => {
    const m = computeLocationMetrics(loc, ctx({
      events: [evOpen], paddockWindows: [pwOpen], groupWindows: [gwOpen], feedEntries: [openBale],
    }));
    expect(m.dmiKg).toBeNull();
    expect(formatMetricValue(m.dmiKg)).toBe('—');
    expect(m.dmiPartial).toBe(false);
    expect(m.dmiKnown).toBe(false);
    expect(m.dmiHayUnknown).toBe(true);
    expect(m.dmiPerHa).toBeNull();
    // Sz strip unchanged: still uses stored 0 on unknown hay days.
    expect(m.stripPastureDmiKg).toBeGreaterThan(0);
    expect(m.storedFeedDmiKg).toBe(0);
  });

  it('3. weight-unknown + hay-unknown with known days: partial known sum', () => {
    const gwBad = { id: 'gw3', eventId: 'ev1', groupId: 'g2', animalClassId: 'acBad', dateJoined: '2026-10-01', dateLeft: '2026-10-10', headCount: 3, avgWeightKg: null };
    const weightOnly = computeLocationMetrics(loc, ctx({ groupWindows: [gwClosed, gwBad], withBad: true }));
    expect(weightOnly.dmiPartial).toBe(true);
    const m = computeLocationMetrics(loc, withOpenHay({ groupWindows: [gwClosed, gwBad, gwOpen], withBad: true }));
    expect(m.dmiKg).toBeCloseTo(weightOnly.dmiKg, 6);
    expect(m.dmiPartial).toBe(true);
    expect(m.dmiHayUnknown).toBe(true);
    expect(m.dmiWeightUnknown).toBe(true);
    expect(m.dmiPerHa).toBeCloseTo(weightOnly.dmiKg / 4.047, 6);
  });

  it('3b. weight-unknown days + hay-unknown days with nothing known left: —', () => {
    const gwBadOnly = { id: 'gw3', eventId: 'ev1', groupId: 'g2', animalClassId: 'acBad', dateJoined: '2026-10-01', dateLeft: '2026-10-10', headCount: 3, avgWeightKg: null };
    const m = computeLocationMetrics(loc, withOpenHay({ groupWindows: [gwBadOnly, gwOpen], withBad: true }));
    expect(m.dmiKg).toBeNull();
    expect(m.dmiPartial).toBe(false);
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

  it('sort: a partial row sorts by its known number (not as —)', () => {
    const a = { ...computeLocationMetrics(loc, withOpenHay()), locationName: 'A' };
    const b = { ...computeLocationMetrics({ ...loc, id: 'loc1', name: 'B' }, ctx()), locationName: 'B', dmiKg: a.dmiKg - 1 };
    const dash = { ...a, locationName: 'C', dmiKg: null, dmiPartial: false };
    const order = sortMetricRows([dash, b, a], { key: 'dmiKg', dir: 'desc' }).map(r => r.locationName);
    expect(order.slice(0, 2)).toEqual(['A', 'B']);
  });

  it('calendar row hover: DMI cells add the hay note; weight reason only when weights caused it', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).toMatch(/metrics\?\.dmiHayUnknown \? t\('event\.dmiHayNotCounted'\)/);
    expect(src).toMatch(/dmiWeightUnknown !== false/);
    expect(enLocale.event.dmiHayNotCounted).toBe(HAY_NOTE);
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
  it('open window with unchecked hay: unknown (—) per Zp; mixed window: partial', () => {
    const span = { start: '2026-11-20', end: '2026-11-24', days: 5 };
    const wm = computePaddockWindowMetrics(pwOpen, loc, evOpen, span, withOpenHay());
    expect(wm.dmi).toBeNull();
    expect(wm.raw.dmiHayUnknown).toBe(true);
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

  it('open window, hay delivered part-way with no check: "~" partial values + hay note, no weight note', () => {
    seedStore({ daysAgo: 6, deliveredDaysAgo: 2 });
    const s = buildPwDmiStats(getById('eventPaddockWindows', PW), getById('locations', LOC), getById('events', EVT));
    expect(s.dmiPartial).toBe(true);
    expect(s.dmiHayUnknown).toBe(true);
    expect(s.pastureKg).toBeGreaterThan(0);
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(val('past-event-detail-dmi-total')).toMatch(/^~[\d,]+ lb DM$/);
    expect(val('past-event-detail-dmi-pasture')).toMatch(/^~/);
    expect(q('past-event-detail-dmi-hay').textContent).toBe(HAY_NOTE);
    expect(q('past-event-detail-dmi-partial')).toBeNull(); // weights are all known
  });

  it('open window, hay from day one with no check: — and the hay note', () => {
    seedStore({ daysAgo: 3, deliveredDaysAgo: 3 });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(val('past-event-detail-dmi-total')).toBe('—');
    expect(q('past-event-detail-dmi-hay').textContent).toBe(HAY_NOTE);
  });

  it('no hay: no hay note', () => {
    seedStore({ daysAgo: 3 });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-dmi-hay')).toBeNull();
  });
});
