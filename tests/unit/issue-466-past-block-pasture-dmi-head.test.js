/**
 * @file #466 — Calendar past blocks. LOCKED Dl1 (Tim t1601s6288, Design comment
 * 1644): line 2 says "pasture DMI"; the hover adds the event's stored feed eaten
 * and hay over need (not netted). LOCKED Hd1 (Tim t1602s6295, comment 1649):
 * head shows a range when it changed in the block, with one hover line per group.
 * Display only — calcs (headCountAtWindowEnd, DMI) unchanged. Both unit systems.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetSheetScrollLock } from '../../src/ui/sheet.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PwEntity from '../../src/entities/event-paddock-window.js';
import * as GwEntity from '../../src/entities/event-group-window.js';
import {
  headRangeInWindow, formatHeadRange, formatDayRange, headCountAtWindowEnd,
} from '../../src/features/events/rotation-calendar/past-window.js';
import {
  formatPastureFeedDmiLine, renderPastBlock, pastBlockHoverLines,
} from '../../src/features/events/rotation-calendar/past-block.js';
import { computeLocationMetrics } from '../../src/features/events/rotation-calendar/location-metrics.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';
import {
  buildPastEventDetailModel, openPastEventDetailSheet, resetPastEventDetailSheet,
} from '../../src/features/events/rotation-calendar/past-event-detail-sheet.js';

beforeAll(() => setLocale('en', enLocale));

// E-1 (event ff115ee9) shape from the #466 comment 1643 table; synthetic ids.
const E1_SPAN = { start: '2026-11-19', end: '2026-11-23', isActive: false };
const E1_GROUPS = [
  { id: 'cc', name: 'Cow-Calf Herd' },
  { id: 'sy', name: 'Shenk Yearling Heifers' },
  { id: 'rh', name: 'Replacement Heifers' },
  { id: 'sc', name: 'Shenk Cows' },
  { id: 'bg', name: 'Bull Group' },
  { id: 'go', name: 'Goats' },
  { id: 'sh', name: 'Sheep' },
];
const gw = (id, groupId, dateJoined, dateLeft, headCount) => ({ id, eventId: 'E', groupId, dateJoined, dateLeft, headCount });
const E1_GWS = [
  gw('w1', 'cc', '2026-11-19', '2026-11-23', 32),
  gw('w2', 'sy', '2026-11-19', '2026-11-23', 6),
  gw('w3', 'rh', '2026-11-19', '2026-11-23', 5),
  gw('w4', 'sc', '2026-11-19', '2026-11-23', 4),
  gw('w5', 'bg', '2026-11-19', '2026-11-23', 1),
  gw('w6', 'go', '2026-11-19', '2026-11-20', 57),
  gw('w7', 'go', '2026-11-20', '2026-11-23', 57),
  gw('w8', 'sh', '2026-11-19', '2026-11-20', 54),
];

describe('#466 Hd1 — head range over the block', () => {
  it('E-1: 105–159 hd with the Design hover lines (Goats merged, Sheep Nov 19–20)', () => {
    const hr = headRangeInWindow(E1_SPAN, { eventGroupWindows: E1_GWS, groups: E1_GROUPS });
    expect(hr).toMatchObject({ min: 105, max: 159, unknown: false });
    expect(formatHeadRange(hr)).toBe('105–159 hd');
    expect(hr.lines.map(l => l.text)).toEqual([
      'Cow-Calf Herd: 32 hd · Nov 19–23',
      'Shenk Yearling Heifers: 6 hd · Nov 19–23',
      'Replacement Heifers: 5 hd · Nov 19–23',
      'Shenk Cows: 4 hd · Nov 19–23',
      'Bull Group: 1 hd · Nov 19–23',
      'Goats: 57 hd · Nov 19–23',
      'Sheep: 54 hd · Nov 19–20',
    ]);
    // Calc input unchanged: head at the window end is still 105.
    const atEnd = headCountAtWindowEnd({ dateClosed: '2026-11-23' }, { eventGroupWindows: E1_GWS, groups: E1_GROUPS });
    expect(atEnd.headCount).toBe(105);
  });

  it('constant head count → single number as today ("48 hd")', () => {
    const gws = E1_GWS.slice(0, 5);
    const hr = headRangeInWindow(E1_SPAN, { eventGroupWindows: gws, groups: E1_GROUPS });
    expect(hr).toMatchObject({ min: 48, max: 48 });
    expect(formatHeadRange(hr)).toBe('48 hd');
  });

  it('mid-block departure → range; arrival mid-block → range too', () => {
    const dep = [gw('a', 'cc', '2026-11-19', '2026-11-23', 32), gw('b', 'sh', '2026-11-19', '2026-11-21', 54)];
    expect(formatHeadRange(headRangeInWindow(E1_SPAN, { eventGroupWindows: dep, groups: E1_GROUPS }))).toBe('32–86 hd');
    const arr = [gw('a', 'cc', '2026-11-19', '2026-11-23', 32), gw('b', 'sh', '2026-11-21', '2026-11-23', 54)];
    expect(formatHeadRange(headRangeInWindow(E1_SPAN, { eventGroupWindows: arr, groups: E1_GROUPS }))).toBe('32–86 hd');
  });

  it('contiguous windows with the same head merge; a head change keeps two lines', () => {
    const same = [gw('a', 'go', '2026-11-19', '2026-11-20', 57), gw('b', 'go', '2026-11-20', '2026-11-23', 57)];
    const hr = headRangeInWindow(E1_SPAN, { eventGroupWindows: same, groups: E1_GROUPS });
    expect(hr.lines.map(l => l.text)).toEqual(['Goats: 57 hd · Nov 19–23']);
    expect(formatHeadRange(hr)).toBe('57 hd'); // the re-split day is counted once
    const diff = [gw('a', 'go', '2026-11-19', '2026-11-20', 57), gw('b', 'go', '2026-11-20', '2026-11-23', 50)];
    const hr2 = headRangeInWindow(E1_SPAN, { eventGroupWindows: diff, groups: E1_GROUPS });
    expect(hr2.lines.map(l => l.text)).toEqual(['Goats: 50 hd · Nov 20–23', 'Goats: 57 hd · Nov 19–20']);
    expect(formatHeadRange(hr2)).toBe('50–57 hd');
  });

  it('group windows are clipped to the block dates', () => {
    const span = { start: '2026-11-21', end: '2026-11-22', isActive: false };
    const hr = headRangeInWindow(span, { eventGroupWindows: E1_GWS.slice(0, 1), groups: E1_GROUPS });
    expect(hr.lines.map(l => l.text)).toEqual(['Cow-Calf Herd: 32 hd · Nov 21–22']);
  });

  it('unknown head count → no range invented (caller keeps the existing count); line shows —', () => {
    const gws = [gw('a', 'cc', '2026-11-19', '2026-11-23', 32), gw('b', 'sh', '2026-11-19', '2026-11-20', null)];
    const hr = headRangeInWindow(E1_SPAN, { eventGroupWindows: gws, groups: E1_GROUPS });
    expect(hr.unknown).toBe(true);
    expect(hr.min).toBeNull();
    expect(formatHeadRange(hr)).toBeNull();
    expect(hr.lines.map(l => l.text)).toContain('Sheep: — hd · Nov 19–20');
    // No overlapping windows at all → no range either.
    expect(formatHeadRange(headRangeInWindow(E1_SPAN, { eventGroupWindows: [], groups: E1_GROUPS }))).toBeNull();
  });

  it('open block counts its last day (group joined today); date ranges format across months', () => {
    const span = { start: '2026-11-20', end: '2026-11-24', isActive: true };
    const gws = [gw('a', 'cc', '2026-11-20', null, 32), gw('b', 'sh', '2026-11-24', null, 54)];
    expect(formatHeadRange(headRangeInWindow(span, { eventGroupWindows: gws, groups: E1_GROUPS }))).toBe('32–86 hd');
    expect(formatDayRange('2026-10-30', '2026-11-02')).toBe('Oct 30–Nov 2');
    expect(formatDayRange('2026-11-19', '2026-11-19')).toBe('Nov 19');
  });
});

describe('#466 Dl1 — line 2 says "pasture DMI"; hover lines', () => {
  it('line 2 wording in both unit systems, ~ and — kept, head label wins', () => {
    expect(formatPastureFeedDmiLine({ pasturePct: 0, feedPct: 100, dmi: 0, headCount: 105, headLabel: '105–159 hd', unitSystem: 'imperial' }))
      .toBe('Pasture 0% · Feed 100% · 0 lb pasture DMI · 105–159 hd');
    expect(formatPastureFeedDmiLine({ pasturePct: 100, feedPct: 0, dmi: 144.2, headCount: 111, unitSystem: 'imperial' }))
      .toBe('Pasture 100% · Feed 0% · 318 lb pasture DMI · 111 hd');
    expect(formatPastureFeedDmiLine({ pasturePct: 100, feedPct: 0, dmi: 144.2, headCount: 111, unitSystem: 'metric' }))
      .toBe('Pasture 100% · Feed 0% · 144 kg pasture DMI · 111 hd');
    expect(formatPastureFeedDmiLine({ pasturePct: 90, feedPct: 10, dmi: 100, headCount: 5, unitSystem: 'metric', estimate: true }))
      .toBe('Pasture 90% · Feed 10% · ~100 kg pasture DMI · 5 hd');
    expect(formatPastureFeedDmiLine({ pasturePct: null, feedPct: null, dmi: null, headCount: 5, unitSystem: 'imperial' }))
      .toBe('Pasture —% · Feed —% · — pasture DMI · 5 hd');
  });

  it('hover: stored feed eaten (event) and hay over need in the farm unit; over-need omitted at 0', () => {
    const kg = 2939.3; // 12 bales × 272.16 kg × 90% DM
    expect(pastBlockHoverLines({ storedFeedEventKg: kg, hayOverNeedKg: 839.3, unitSystem: 'imperial' })).toEqual([
      'Stored feed eaten (event): 6,480 lb DM',
      'Hay over need: 1,850 lb (not netted)',
    ]);
    expect(pastBlockHoverLines({ storedFeedEventKg: kg, hayOverNeedKg: 839.3, unitSystem: 'metric' })).toEqual([
      'Stored feed eaten (event): 2,939 kg DM',
      'Hay over need: 839 kg (not netted)',
    ]);
    expect(pastBlockHoverLines({ storedFeedEventKg: 0, hayOverNeedKg: 0, unitSystem: 'metric' }))
      .toEqual(['Stored feed eaten (event): 0 kg DM']);
    expect(pastBlockHoverLines({ storedFeedEventKg: 0, storedFeedUnknown: true, unitSystem: 'imperial' }))
      .toEqual(['Stored feed eaten (event): — DM']);
    expect(pastBlockHoverLines({ storedFeedEventKg: 10, groupLines: [{ text: 'Goats: 57 hd · Nov 19–23' }], unitSystem: 'imperial' }))
      .toEqual(['Stored feed eaten (event): 22 lb DM', 'Goats: 57 hd · Nov 19–23']);
  });

  it('renderPastBlock: storedFeedOnly path uses the same wording; hover goes on the block title', () => {
    const node = renderPastBlock({
      leftPx: 0, widthPx: 200, groups: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], auds: 1, days: 5,
      dmi: 0, headCount: 105, headLabel: '105–159 hd', isActive: false, isStripGraze: false, strips: [],
      storedFeedOnly: true, eventId: 'E', onClickBlock: () => {},
      hoverLines: ['Stored feed eaten (event): 6,480 lb DM', 'Goats: 57 hd · Nov 19–23'],
    });
    expect(node.querySelector('.past-block__line2').textContent).toMatch(/^Pasture 0% · Feed 100% · 0 (lb|kg) pasture DMI · 105–159 hd$/);
    expect(node.title).toBe('Stored feed eaten (event): 6,480 lb DM\nGoats: 57 hd · Nov 19–23');
  });
});

describe('#466 Dl1 — hay over need from the existing allocation (display-only extras)', () => {
  const loc = { id: 'loc1', name: 'E-1', type: 'land', landUse: 'pasture', areaHectares: 4.047 };
  const cls = { id: 'ac1', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
  const animals = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, classId: 'ac1', archived: false, status: 'active' }));
  const ev = { id: 'ev1', dateOut: '2026-10-10' };
  const pw = { id: 'pw1', eventId: 'ev1', locationId: 'loc1', dateOpened: '2026-10-01', dateClosed: '2026-10-10', areaPct: 100 };
  const gwin = { id: 'gw1', eventId: 'ev1', groupId: 'g1', animalClassId: 'ac1', dateJoined: '2026-10-01', dateLeft: '2026-10-10', headCount: 10, avgWeightKg: 453.6 };
  const hayType = { id: 'hay', unit: 'bale', nPct: 1.5, pPct: 0.2, kPct: 1.0, dmPct: 85 };
  const ctx = (bales) => ({
    windowStart: '2026-10-01', windowEnd: '2026-10-10', today: '2026-11-24',
    events: [ev], paddockWindows: [pw], groupWindows: [gwin],
    memberships: animals.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null })),
    animals, animalClasses: [cls],
    animalWeightRecords: animals.map(a => ({ animalId: a.id, weightKg: 453.6, recordedAt: '2026-09-01' })),
    locations: [loc], observations: [],
    feedEntries: [{ id: 'fe1', eventId: 'ev1', locationId: 'loc1', date: '2026-10-01', time: '08:00', quantity: bales, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85, kind: 'inventory_feeding', feedTypeId: 'hay' }],
    feedChecks: [{ id: 'fc1', eventId: 'ev1', date: '2026-10-10', time: '16:00', isCloseReading: true }],
    feedCheckItems: [{ id: 'i1', feedCheckId: 'fc1', locationId: 'loc1', feedTypeId: 'hay', remainingQuantity: 0, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85 }],
    batches: [], feedTypes: [hayType], batchNutritionalProfiles: [],
  });

  it('hay ≥ need: pasture DMI 0, stored feed eaten = all hay, over need = hay − need', () => {
    const need = computeLocationMetrics(loc, { ...ctx(10), feedEntries: [], feedChecks: [], feedCheckItems: [], onlyPaddockWindowId: 'pw1' }).dmiKg;
    expect(need).toBeGreaterThan(0);
    const m = computeLocationMetrics(loc, { ...ctx(10), onlyPaddockWindowId: 'pw1' });
    expect(m.dmiKg).toBeCloseTo(0, 6); // pasture DMI floored at 0 (11-18 rule)
    expect(m.eventStoredFeedDmiKg).toBeCloseTo(10 * 500 * 0.85, 6);
    expect(m.eventHayOverNeedKg).toBeCloseTo(10 * 500 * 0.85 - need, 6);
  });

  it('hay < need: no over-need line; existing DMI and stored-feed numbers unchanged', () => {
    const m = computeLocationMetrics(loc, { ...ctx(1), onlyPaddockWindowId: 'pw1' });
    expect(m.eventStoredFeedDmiKg).toBeCloseTo(500 * 0.85, 6);
    expect(m.eventHayOverNeedKg).toBe(0);
    expect(m.storedFeedDmiKg).toBeCloseTo(500 * 0.85, 6); // one window → window share = event
    expect(pastBlockHoverLines({ storedFeedEventKg: m.eventStoredFeedDmiKg, hayOverNeedKg: m.eventHayOverNeedKg, unitSystem: 'imperial' }))
      .toEqual(['Stored feed eaten (event): 937 lb DM']);
  });
});

// Grid + detail-sheet wiring on an E-1-shaped event 6..2 days ago (relative dates).
const OP = '00000000-0000-4000-8000-0000000004aa';
const FARM = '00000000-0000-4000-8000-0000000004bb';
const LOC = '00000000-0000-4000-8000-0000000004c1';
const EID = '00000000-0000-4000-8000-0000000004e1';
const PWID = '00000000-0000-4000-8000-0000000004f1';
const GIDS = { cattle: '00000000-0000-4000-8000-000000000401', goats: '00000000-0000-4000-8000-000000000402', sheep: '00000000-0000-4000-8000-000000000403' };
const iso = (offset) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function seed(unitSystem) {
  _reset();
  localStorage.clear();
  resetCalendarState();
  window.history.replaceState(null, '', '#/events');
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'E-1', type: 'land', landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  for (const [k, name] of [['cattle', 'Cattle'], ['goats', 'Goats'], ['sheep', 'Sheep']]) {
    add('groups', GroupEntity.create({ id: GIDS[k], operationId: OP, name }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  }
  add('events', EventEntity.create({ id: EID, operationId: OP, farmId: FARM, dateOut: iso(-2) }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PwEntity.create({
    id: PWID, operationId: OP, eventId: EID, locationId: LOC, dateOpened: iso(-6), dateClosed: iso(-2), areaPct: 100,
  }), PwEntity.validate, PwEntity.toSupabaseShape, 'event_paddock_windows');
  const gws = [
    ['cattle', -6, -2, 48], ['goats', -6, -5, 57], ['goats', -5, -2, 57], ['sheep', -6, -5, 54],
  ];
  for (const [k, j, l, hd] of gws) {
    add('eventGroupWindows', GwEntity.create({
      operationId: OP, eventId: EID, groupId: GIDS[k], dateJoined: iso(j), dateLeft: iso(l), headCount: hd, avgWeightKg: 300,
    }), GwEntity.validate, GwEntity.toSupabaseShape, 'event_group_windows');
  }
}

describe('#466 grid + past-event detail sheet wiring (imperial and metric)', () => {
  afterEach(() => {
    resetPastEventDetailSheet();
    resetSheetScrollLock();
    document.body.innerHTML = '';
  });

  for (const us of ['imperial', 'metric']) {
    const unit = us === 'imperial' ? 'lb' : 'kg';
    it(`${us}: block line 2 reads "… ${unit} pasture DMI · 105–159 hd"; hover has stored feed + group lines`, () => {
      seed(us);
      const c = document.createElement('div');
      document.body.appendChild(c);
      renderCalendarGrid(c);
      const block = c.querySelector(`[data-testid="past-block"][data-paddock-window-id="${PWID}"]`);
      expect(block).toBeTruthy();
      const line2 = block.querySelector('.past-block__line2').textContent;
      expect(line2).toMatch(new RegExp(` ${unit} pasture DMI · 105–159 hd$`));
      expect(line2).not.toMatch(/\d DMI/);
      const lines = block.title.split('\n');
      expect(lines[0]).toBe(`Stored feed eaten (event): 0 ${unit} DM`);
      expect(lines.some(l => l.startsWith('Hay over need'))).toBe(false); // no hay → no over-need
      expect(lines).toContain(`Cattle: 48 hd · ${formatDayRange(iso(-6), iso(-2))}`);
      expect(lines).toContain(`Goats: 57 hd · ${formatDayRange(iso(-6), iso(-2))}`);
      expect(lines).toContain(`Sheep: 54 hd · ${formatDayRange(iso(-6), iso(-5))}`);
    });

    it(`${us}: past-event detail sheet shows the same head wording and per-group lines`, () => {
      seed(us);
      const m = buildPastEventDetailModel({ eventId: EID, paddockWindowId: PWID });
      expect(m.head.label).toBe('105–159 hd');
      expect(m.head.lines).toHaveLength(3);
      openPastEventDetailSheet({ eventId: EID, paddockWindowId: PWID });
      expect(document.querySelector('[data-testid="past-event-detail-head-value"]').textContent).toBe('105–159 hd');
      expect(document.querySelector('[data-testid="past-event-detail-head-group-0"]').textContent).toMatch(/hd · /);
      expect(document.querySelector('[data-testid="past-event-detail-dmi-pasture"]').textContent).toContain('Pasture DMI');
    });
  }
  // Unknown head (head_count null from the server row) is covered by the pure
  // headRangeInWindow test above; the grid then passes no headLabel (existing count).
});
