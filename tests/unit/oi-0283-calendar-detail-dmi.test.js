/**
 * @file OI-0283 (Scope A) — calendar event detail sheet: Current-event header,
 * no Post-Graze on open windows, strict sourceId observation matching (sheet +
 * Edit Paddock Window), and the DMI & Grazing section for this paddock window
 * (computePaddockWindowMetrics, farm units via the OI-0278 helper).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { _reset, add, getAll, getById, mergeRemote } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetSheetScrollLock } from '../../src/ui/sheet.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as ForageTypeEntity from '../../src/entities/forage-type.js';
import * as AnimalClassEntity from '../../src/entities/animal-class.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PwEntity from '../../src/entities/event-paddock-window.js';
import * as GwEntity from '../../src/entities/event-group-window.js';
import * as ObsEntity from '../../src/entities/paddock-observation.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/capacity.js';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';
import { formatMeasure, formatPerArea } from '../../src/utils/units.js';
import {
  buildPastEventDetailModel, buildPwDmiStats, openPastEventDetailSheet,
  resetPastEventDetailSheet, findPwObservation,
} from '../../src/features/events/rotation-calendar/past-event-detail-sheet.js';
import { findEventObservation } from '../../src/features/events/edit-paddock-window.js';
import { pastWindowSpan, computePaddockWindowMetrics } from '../../src/features/events/rotation-calendar/past-window.js';

const OP = '00000000-0000-0000-0000-0000000003aa';
const FARM = '00000000-0000-0000-0000-0000000003bb';
const FT = '00000000-0000-0000-0000-0000000003cc';
const CLASS = '00000000-0000-0000-0000-0000000003cd';
const CLASS_NOW = '00000000-0000-0000-0000-0000000003ce';
const LOC = '00000000-0000-0000-0000-0000000003d1';
const LOC_2 = '00000000-0000-0000-0000-0000000003d2';
const LOC_NOAREA = '00000000-0000-0000-0000-0000000003d3';
const GROUP = '00000000-0000-0000-0000-000000000401';
const GROUP_2 = '00000000-0000-0000-0000-000000000402';
const PRIOR_EVT = '00000000-0000-0000-0000-0000000003e0';
const PRIOR_PW = '00000000-0000-0000-0000-0000000003f0';
const EVT = '00000000-0000-0000-0000-0000000003e1';
const PW = '00000000-0000-0000-0000-0000000003f1';
const PW_2 = '00000000-0000-0000-0000-0000000003f2';
const GW = '00000000-0000-0000-0000-000000000411';
const GW_2 = '00000000-0000-0000-0000-000000000412';

beforeAll(() => setLocale('en', enLocale));
afterEach(() => {
  resetPastEventDetailSheet();
  resetSheetScrollLock();
  document.body.innerHTML = '';
});

function shift(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}


function put(store, entity, sbTable, row) {
  add(store, entity.create(row), entity.validate, entity.toSupabaseShape, sbTable);
}

function addHerd(groupId, classId, prefix, head, joined) {
  for (let i = 0; i < head; i++) {
    const aid = `00000000-0000-0000-0000-0000000${prefix}${i.toString().padStart(4, '0')}`;
    put('animals', AnimalEntity, 'animals', {
      id: aid, operationId: OP, tagNum: `${prefix}${i}`, active: true, animalClassId: classId, dateBorn: '2024-01-01', sex: 'F',
    });
    put('animalGroupMemberships', MembershipEntity, 'animal_group_memberships', {
      operationId: OP, animalId: aid, groupId, dateJoined: joined, dateLeft: null,
    });
  }
}

/**
 * One event on LOC: opened `open`, closed `close` (null = active). Optional second
 * paddock window, a stored-feed-only window, or an unweighted second group.
 */
function seed({
  unitSystem = 'imperial', open = '2026-06-01', close = '2026-06-11', secondPw = false,
  noPasture = false, unweightedGroup = false, onlyUnweighted = false, loc = LOC,
} = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  put('operations', OperationEntity, 'operations', { id: OP, name: 'Op', unitSystem });
  put('farms', FarmEntity, 'farms', { id: FARM, operationId: OP, name: 'Farm' });
  put('farmSettings', FarmSettingEntity, 'farm_settings', { farmId: FARM, operationId: OP });
  put('forageTypes', ForageTypeEntity, 'forage_types', {
    id: FT, operationId: OP, name: 'Mixed', dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 65, dmPct: 22,
  });
  put('animalClasses', AnimalClassEntity, 'animal_classes', {
    id: CLASS, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow', dmiPct: 2.5, defaultWeightKg: 500,
  });
  put('animalClasses', AnimalClassEntity, 'animal_classes', {
    id: CLASS_NOW, operationId: OP, name: 'Unknown', species: 'beef_cattle', role: 'cow', dmiPct: 2.5, defaultWeightKg: null,
  });
  put('locations', LocationEntity, 'locations', {
    id: LOC, operationId: OP, farmId: FARM, name: 'F-1', type: 'land', landUse: 'pasture', areaHectares: 4, forageTypeId: FT,
  });
  put('locations', LocationEntity, 'locations', {
    id: LOC_2, operationId: OP, farmId: FARM, name: 'F-2', type: 'land', landUse: 'pasture', areaHectares: 4, forageTypeId: FT,
  });
  put('locations', LocationEntity, 'locations', {
    id: LOC_NOAREA, operationId: OP, farmId: FARM, name: 'Lot', type: 'land', landUse: 'pasture', forageTypeId: FT,
  });
  put('groups', GroupEntity, 'groups', { id: GROUP, operationId: OP, farmId: FARM, name: 'Sheep/Goats' });
  put('groups', GroupEntity, 'groups', { id: GROUP_2, operationId: OP, farmId: FARM, name: 'Light' });
  if (!onlyUnweighted) addHerd(GROUP, CLASS, 'a', 10, open);
  if (unweightedGroup || onlyUnweighted) addHerd(GROUP_2, CLASS_NOW, 'b', 5, open);

  put('events', EventEntity, 'events', { id: EVT, operationId: OP, farmId: FARM, dateOut: close });
  put('eventPaddockWindows', PwEntity, 'event_paddock_windows', {
    id: PW, operationId: OP, eventId: EVT, locationId: loc, dateOpened: open, dateClosed: close, areaPct: 100, noPasture,
  });
  if (secondPw) {
    put('eventPaddockWindows', PwEntity, 'event_paddock_windows', {
      id: PW_2, operationId: OP, eventId: EVT, locationId: LOC_2, dateOpened: open, dateClosed: close, areaPct: 100,
    });
  }
  if (!onlyUnweighted) {
    put('eventGroupWindows', GwEntity, 'event_group_windows', {
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP, dateJoined: open, dateLeft: close, headCount: 10, avgWeightKg: 500,
    });
  }
  if (unweightedGroup || onlyUnweighted) {
    // Legacy synced row with no stored weight (create() requires one, so load it
    // the way a pull does).
    mergeRemote('eventGroupWindows', [{
      ...GwEntity.create({
        id: GW_2, operationId: OP, eventId: EVT, groupId: GROUP_2, dateJoined: open, dateLeft: close, headCount: 5, avgWeightKg: 1,
      }),
      avgWeightKg: null,
    }]);
  }
}

/** A prior (closed) event on the same paddock with its own open + close obs. */
function seedPriorEventObs() {
  put('events', EventEntity, 'events', { id: PRIOR_EVT, operationId: OP, farmId: FARM, dateOut: '2026-05-10' });
  put('eventPaddockWindows', PwEntity, 'event_paddock_windows', {
    id: PRIOR_PW, operationId: OP, eventId: PRIOR_EVT, locationId: LOC, dateOpened: '2026-05-01', dateClosed: '2026-05-10', areaPct: 100,
  });
  put('paddockObservations', ObsEntity, 'paddock_observations', {
    operationId: OP, locationId: LOC, observedAt: '2026-05-01T08:00:00.000Z', type: 'open', source: 'event',
    sourceId: PRIOR_PW, forageHeightCm: 30, createdAt: '2026-05-01T08:00:00.000Z',
  });
  put('paddockObservations', ObsEntity, 'paddock_observations', {
    operationId: OP, locationId: LOC, observedAt: '2026-05-10T16:00:00.000Z', type: 'close', source: 'event',
    sourceId: PRIOR_PW, residualHeightCm: 6, recoveryMinDays: 30, recoveryMaxDays: 45, notes: 'Cow-Calf residual',
    createdAt: '2026-05-10T16:00:00.000Z',
  });
}

const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const val = (id) => q(`${id}-value`)?.textContent;

describe('OI-0283 A — header + post-graze on active vs past', () => {
  it('active window: "Current event", "Active", no Post-Graze section, DMI "through today"', () => {
    const today = getLocalTodayStr();
    seed({ open: shift(today, -3), close: null });
    seedPriorEventObs();
    const m = buildPastEventDetailModel({ eventId: EVT, paddockWindowId: PW });
    expect(m.isOpen).toBe(true);
    expect(m.closing).toBeNull();
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-title').textContent).toBe('Current event');
    expect(val('past-event-detail-closed')).toBe('Active');
    expect(q('past-event-detail-closing-heading')).toBeNull();
    expect(q('past-event-detail-closing-empty')).toBeNull();
    expect(q('past-event-detail-closing-residual')).toBeNull();
    expect(document.body.textContent).not.toContain('Cow-Calf residual');
    // Opening: the prior event's pre-graze does not bleed in either.
    expect(q('past-event-detail-opening-empty')).toBeTruthy();
    expect(q('past-event-detail-dmi-heading').textContent).toContain('DMI & Grazing');
    expect(q('past-event-detail-dmi-through-today').textContent).toContain('through today');
    // Days run through today: open day .. today inclusive.
    expect(val('past-event-detail-dmi-days')).toBe('4');
  });

  it('past window: "Past event", own closing obs, no "through today"', () => {
    seed();
    seedPriorEventObs();
    put('paddockObservations', ObsEntity, 'paddock_observations', {
      operationId: OP, locationId: LOC, observedAt: '2026-06-11T16:00:00.000Z', type: 'close', source: 'event',
      sourceId: PW, residualHeightCm: 8, recoveryMinDays: 21, recoveryMaxDays: 35, notes: 'Own close',
    });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-title').textContent).toBe('Past event');
    expect(q('past-event-detail-closing-heading')).toBeTruthy();
    expect(val('past-event-detail-closing-recovery-min')).toBe('21');
    expect(val('past-event-detail-closing-notes')).toBe('Own close');
    expect(q('past-event-detail-dmi-through-today')).toBeNull();
    expect(val('past-event-detail-dmi-days')).toBe('11');
  });

  it('past window without its own close obs shows the empty state (no prior-event bleed)', () => {
    seed();
    seedPriorEventObs();
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-closing-empty')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Cow-Calf residual');
  });
});

describe('OI-0283 A3 — strict sourceId matching', () => {
  it('sheet findPwObservation: only this window\'s obs; another event\'s → null', () => {
    seed();
    seedPriorEventObs();
    expect(findPwObservation(LOC, PW, 'close')).toBeNull();
    expect(findPwObservation(LOC, PW, 'open')).toBeNull();
    expect(findPwObservation(LOC, PRIOR_PW, 'close')?.notes).toBe('Cow-Calf residual');
    expect(findPwObservation(LOC, null, 'close')).toBeNull();
  });

  it('edit-paddock-window findEventObservation: same strict rule', () => {
    seed();
    seedPriorEventObs();
    expect(findEventObservation(LOC, PW, 'close')).toBeNull();
    expect(findEventObservation(LOC, PW, 'open')).toBeNull();
    expect(findEventObservation(LOC, PRIOR_PW, 'open')?.forageHeightCm).toBe(30);
    put('paddockObservations', ObsEntity, 'paddock_observations', {
      operationId: OP, locationId: LOC, observedAt: '2026-06-01T08:00:00.000Z', type: 'open', source: 'event',
      sourceId: PW, forageHeightCm: 22,
    });
    expect(findEventObservation(LOC, PW, 'open')?.forageHeightCm).toBe(22);
    // Type and source still filter.
    expect(findEventObservation(LOC, PW, 'close')).toBeNull();
  });

  it('no source fallback remains in either file', async () => {
    const fs = await import('node:fs');
    for (const f of ['src/features/events/rotation-calendar/past-event-detail-sheet.js', 'src/features/events/edit-paddock-window.js']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toContain('allObs.sort');
    }
  });
});

describe('OI-0283 B — DMI & Grazing (this paddock window only)', () => {
  function expectedWm(today = '2026-07-01') {
    const pw = getById('eventPaddockWindows', PW);
    const event = getById('events', EVT);
    const loc = getById('locations', pw.locationId);
    const span = pastWindowSpan(pw, event, { today });
    return computePaddockWindowMetrics(pw, loc, event, span, {
      today,
      events: getAll('events'), paddockWindows: getAll('eventPaddockWindows'), groupWindows: getAll('eventGroupWindows'),
      memberships: getAll('animalGroupMemberships'), animals: getAll('animals'), animalClasses: getAll('animalClasses'),
      animalWeightRecords: getAll('animalWeightRecords'), locations: getAll('locations'), observations: getAll('paddockObservations'),
      feedEntries: getAll('eventFeedEntries'), feedChecks: getAll('eventFeedChecks'), feedCheckItems: getAll('eventFeedCheckItems'),
      batches: getAll('batches'), feedTypes: getAll('feedTypes'), batchNutritionalProfiles: getAll('batchNutritionalProfiles'),
    });
  }

  it('reuses computePaddockWindowMetrics (same numbers as the calendar bar)', () => {
    seed();
    const s = buildPwDmiStats(getById('eventPaddockWindows', PW), getById('locations', LOC), getById('events', EVT), { today: '2026-07-01' });
    const wm = expectedWm();
    expect(s.pastureKg).toBeCloseTo(wm.dmi, 6);
    expect(s.auds).toBeCloseTo(wm.auds, 6);
    expect(s.pasturePct).toBeCloseTo(wm.pasturePct, 6);
    expect(s.storedKg).toBe(wm.raw.storedFeedDmiKg);
    expect(s.totalKg).toBeCloseTo(wm.dmi + wm.raw.storedFeedDmiKg, 6);
    expect(s.pastureKgPerHa).toBeCloseTo(wm.raw.dmiPerHa, 6);
    expect(s.audsPerHa).toBeCloseTo(wm.raw.audsPerHa, 6);
    expect(s.days).toBe(11);
    // 10 head × 500 kg × 2.5 % = 125 kg/day over the window's grazing days (> 0).
    expect(s.pastureKg).toBeGreaterThan(0);
  });

  it('imperial: lb DM, lb/ac, /ac and percentages', () => {
    seed({ unitSystem: 'imperial' });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    const wm = expectedWm(getLocalTodayStr());
    expect(val('past-event-detail-dmi-total')).toBe(`${formatMeasure(wm.dmi, 'weight', { unitSystem: 'imperial' })} DM`);
    expect(val('past-event-detail-dmi-total')).toMatch(/ lb DM$/);
    expect(val('past-event-detail-dmi-pasture')).toMatch(/ lb DM · 100%$/);
    expect(val('past-event-detail-dmi-pasture-per-area')).toBe(formatPerArea(wm.raw.dmiPerHa, 'weight', { unitSystem: 'imperial' }));
    expect(val('past-event-detail-dmi-pasture-per-area')).toMatch(/ lb\/ac$/);
    expect(val('past-event-detail-dmi-stored')).toBe('0 lb DM · 0%');
    expect(val('past-event-detail-dmi-auds')).toBe(formatMeasure(wm.auds, 'count', { decimals: 0 }));
    expect(val('past-event-detail-dmi-auds-per-area')).toMatch(/^[\d.,]+\/ac$/);
    expect(document.body.textContent).not.toMatch(/lbs|kg/);
  });

  it('metric: kg DM, kg/ha, /ha', () => {
    seed({ unitSystem: 'metric' });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(val('past-event-detail-dmi-total')).toMatch(/ kg DM$/);
    expect(val('past-event-detail-dmi-pasture-per-area')).toMatch(/ kg\/ha$/);
    expect(val('past-event-detail-dmi-auds-per-area')).toMatch(/^[\d.,]+\/ha$/);
    expect(document.body.textContent).not.toMatch(/\blbs?\b|\/ac\b/);
  });

  it('multi-paddock event shows the scope note; single-paddock omits it', () => {
    seed({ secondPw: true });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-dmi-scope-note').textContent).toBe('This paddock only (1 of 2 paddocks)');
    resetPastEventDetailSheet();
    seed();
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-dmi-scope-note')).toBeNull();
  });

  it('counts distinct paddocks: two windows on the same paddock → no note; distinct paddocks → "1 of 2"', () => {
    // Same paddock reopened within the event (two windows, one locationId).
    seed({ close: '2026-06-11' });
    put('eventPaddockWindows', PwEntity, 'event_paddock_windows', {
      id: PW_2, operationId: OP, eventId: EVT, locationId: LOC, dateOpened: '2026-06-12', dateClosed: '2026-06-14', areaPct: 100,
    });
    expect(getAll('eventPaddockWindows').filter(w => w.eventId === EVT)).toHaveLength(2);
    expect(buildPastEventDetailModel({ eventId: EVT, paddockWindowId: PW }).eventPaddockCount).toBe(1);
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-dmi-scope-note')).toBeNull();
    resetPastEventDetailSheet();

    // Two distinct paddocks + a reopened one: N counts paddocks, not windows.
    seed({ secondPw: true });
    put('eventPaddockWindows', PwEntity, 'event_paddock_windows', {
      id: '00000000-0000-0000-0000-0000000003f3', operationId: OP, eventId: EVT, locationId: LOC,
      dateOpened: '2026-06-12', dateClosed: '2026-06-14', areaPct: 100,
    });
    expect(buildPastEventDetailModel({ eventId: EVT, paddockWindowId: PW }).eventPaddockCount).toBe(2);
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-dmi-scope-note').textContent).toBe('This paddock only (1 of 2 paddocks)');
  });

  it('multi-paddock: this window gets its acre share only (not the whole event)', () => {
    seed({ secondPw: true });
    const both = buildPwDmiStats(getById('eventPaddockWindows', PW), getById('locations', LOC), getById('events', EVT), { today: '2026-07-01' });
    seed();
    const solo = buildPwDmiStats(getById('eventPaddockWindows', PW), getById('locations', LOC), getById('events', EVT), { today: '2026-07-01' });
    expect(both.pastureKg).toBeCloseTo(solo.pastureKg / 2, 6);
  });

  it('stored-feed-only window: 0 % pasture / 100 % feed, pasture DMI 0', () => {
    seed({ noPasture: true });
    put('feedTypes', FeedTypeEntity, 'feed_types', { id: '00000000-0000-0000-0000-000000000501', operationId: OP, name: 'Hay', category: 'hay', unit: 'kg' });
    put('batches', BatchEntity, 'batches', {
      id: '00000000-0000-0000-0000-000000000502', operationId: OP, feedTypeId: '00000000-0000-0000-0000-000000000501', name: 'H',
      source: 'purchase', quantity: 500, remaining: 0, unit: 'kg', weightPerUnitKg: 1, dmPct: 90,
    });
    put('eventFeedEntries', FeedEntryEntity, 'event_feed_entries', {
      operationId: OP, eventId: EVT, batchId: '00000000-0000-0000-0000-000000000502', locationId: LOC, date: '2026-06-01', quantity: 500,
    });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(val('past-event-detail-dmi-pasture')).toBe('0 lb DM · 0%');
    expect(val('past-event-detail-dmi-stored')).toMatch(/ lb DM · 100%$/);
    expect(val('past-event-detail-dmi-pasture-per-area')).toBe('0.0 lb/ac');
  });

  it('unknown DMI (no weights at all) shows "—", not a fake 0', () => {
    seed({ onlyUnweighted: true });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(val('past-event-detail-dmi-total')).toBe('—');
    expect(val('past-event-detail-dmi-pasture')).toBe('— · —%');
    expect(val('past-event-detail-dmi-pasture-per-area')).toBe('—');
  });

  it('partial unknown: "~" cue + partial note', () => {
    seed({ unweightedGroup: true });
    const s = buildPwDmiStats(getById('eventPaddockWindows', PW), getById('locations', LOC), getById('events', EVT));
    expect(s.dmiPartial).toBe(true);
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(val('past-event-detail-dmi-total')).toMatch(/^~[\d,]+ lb DM$/);
    expect(val('past-event-detail-dmi-pasture')).toMatch(/^~/);
    expect(q('past-event-detail-dmi-partial').textContent).toMatch(/Partial/);
  });

  it('OI-0279 basis note renders when present (and only then)', () => {
    seed();
    const s = buildPwDmiStats(getById('eventPaddockWindows', PW), getById('locations', LOC), getById('events', EVT));
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    if (s.dmiBasisNote) {
      expect(q('past-event-detail-dmi-basis').textContent).toBe(s.dmiBasisNote);
    } else {
      expect(q('past-event-detail-dmi-basis')).toBeNull();
    }
    expect(s.dmiBasisNote).toMatch(/weighted by head \(no weights\)/);
    expect(q('past-event-detail-dmi-partial')).toBeNull();
  });

  it('paddock without area: no per-area rows', () => {
    seed({ loc: LOC_NOAREA });
    openPastEventDetailSheet({ eventId: EVT, paddockWindowId: PW });
    expect(q('past-event-detail-dmi-total')).toBeTruthy();
    expect(q('past-event-detail-dmi-pasture-per-area')).toBeNull();
    expect(q('past-event-detail-dmi-auds-per-area')).toBeNull();
  });
});
