/**
 * @file OI-0280 (#435) — Home event card DMI target vs actual, shipped without
 * the OI-0281 plan term. Locked: Ac1, Wn3 (+ Ec1 one-check), Dp3 (one line,
 * amber on stored-only events only when > 10 % off), Nc2 hide. Day kind from
 * the gap-context rule (confinement / no_pasture → stored-only). Source: Al1.
 * Spec §8 acceptance list.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { _reset, add } from '../../src/data/store.js';
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
import * as FeedCheckEntity from '../../src/entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../src/entities/event-feed-check-item.js';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';
import { formatMeasure } from '../../src/utils/units.js';
import { groupWindowsDailyDmiKg } from '../../src/calcs/window-helpers.js';
import { al1EventDayAllocation } from '../../src/calcs/f1-close-allocation.js';
import { computeEventDmiActual, DMI_ACTUAL_AMBER_RATIO } from '../../src/calcs/event-dmi-actual.js';
import { renderDmiActualLine, buildLocationCard } from '../../src/features/dashboard/index.js';
import { buildDmi8ChartContext } from '../../src/features/events/dmi-chart-context.js';

beforeAll(() => setLocale('en', enLocale));

const BALE_DM = 500 * 0.85; // 425 kg DM per bale
const HEAD = 10;
const WT = 453.6;
const need = (pct = 2.5) => HEAD * WT * (pct / 100); // 113.4 kg DM / day at 2.5 %

const land = { id: 'L', type: 'land', landUse: 'pasture', areaHa: 4 };
const barn = { id: 'C', type: 'confinement', areaHa: 0.1 };

/**
 * Event `ev` opens Nov 1 00:00 with 4 bales delivered; checks (00:00 each) on
 * the given dates with the given remaining bales.
 */
function ctx({
  loc = land, checks = [], pct = 2.5, pws = null, deliveries = 4, noUnitCheck = null,
} = {}) {
  const cls = { id: 'ac1', species: 'beef_cattle', dmiPct: pct, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
  const animals = Array.from({ length: HEAD }, (_, i) => ({ id: `a${i}`, classId: 'ac1', archived: false, status: 'active' }));
  const paddockWindows = pws || [{ id: 'pw', eventId: 'ev', locationId: loc.id, dateOpened: '2026-11-01', timeOpened: '00:00', dateClosed: null, areaPct: 100 }];
  const locations = { L: land, C: barn };
  const feedChecks = checks.map((c, i) => ({ id: `fc${i}`, eventId: 'ev', date: c.date, time: '00:00', isCloseReading: false }));
  const feedCheckItems = checks.map((c, i) => ({
    id: `fci${i}`, feedCheckId: `fc${i}`, locationId: paddockWindows[paddockWindows.length - 1].locationId,
    feedTypeId: 'hay', remainingQuantity: c.remaining,
    weightPerUnitKgSnapshot: noUnitCheck === i ? null : 500, dmPctSnapshot: noUnitCheck === i ? null : 85,
  }));
  const feedEntries = deliveries ? [{
    id: 'fe', eventId: 'ev', locationId: paddockWindows[paddockWindows.length - 1].locationId,
    date: '2026-11-01', time: '00:00', quantity: deliveries,
    weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85, kind: 'inventory_feeding', feedTypeId: 'hay',
  }] : [];
  return {
    event: { id: 'ev', dateIn: '2026-11-01', dateOut: null },
    groupWindows: [{ id: 'gw', eventId: 'ev', groupId: 'g1', dateJoined: '2026-11-01', timeJoined: '00:00', dateLeft: null, headCount: HEAD, avgWeightKg: WT }],
    memberships: animals.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null })),
    animals,
    animalClasses: { ac1: cls },
    animalWeightRecords: animals.map(a => ({ animalId: a.id, weightKg: WT, recordedAt: '2026-09-01' })),
    feedEntries, feedChecks, feedCheckItems,
    batches: {},
    feedTypes: [{ id: 'hay', unit: 'bale', dmPct: 85 }],
    paddockWindows,
    locations,
  };
}
const TODAY = { today: '2026-11-24' };
const dates = (from, toExcl) => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (s >= toExcl) return out;
    out.push(s);
  }
};

describe('OI-0280 computeEventDmiActual (§8)', () => {
  it('1. opening delivery + two checks: hay/day = Σ Al1 hay ÷ measured days (last two checks, Wn3)', () => {
    const c = ctx({ checks: [{ date: '2026-11-05', remaining: 3.5 }, { date: '2026-11-09', remaining: 3 }] });
    const a = computeEventDmiActual(c, TODAY);
    expect(a.show).toBe(true);
    expect(a.windowStart).toBe('2026-11-05');
    expect(a.windowEnd).toBe('2026-11-09');
    expect(a.days).toBeCloseTo(4, 6);
    // Same Al1 call DMI-8 "Actual" bars make (feed-forage.js).
    const all = dates('2026-11-01', '2026-11-10');
    const hayArgs = {
      eventId: 'ev', openDate: '2026-11-01', openTime: '00:00',
      feedEntries: c.feedEntries, feedChecks: c.feedChecks, feedCheckItems: c.feedCheckItems,
      batches: {}, feedTypes: c.feedTypes,
    };
    const demandByDate = new Map(all.map(d => [d, groupWindowsDailyDmiKg(d, c)]));
    const locationsById = new Map(Object.entries(c.locations).map(([k, v]) => [k, { ...v, areaHectares: v.areaHa }]));
    let hay = 0; let pasture = 0;
    for (const d of dates('2026-11-05', '2026-11-09')) {
      const r = al1EventDayAllocation({ date: d, dates: all, hayArgs, demandByDate, paddockWindows: c.paddockWindows, locationsById });
      hay += r?.storedDmiKg || 0;
      pasture += r?.pastureDmiKg || 0;
    }
    expect(hay).toBeCloseTo(0.5 * BALE_DM, 4);
    expect(a.hayKgPerDay).toBeCloseTo(hay / 4, 6);
    expect(a.pastureKgPerDay).toBeCloseTo(pasture / 4, 6);
    expect(a.targetKgPerDay).toBeCloseTo(need(), 6);
    expect(a.kind).toBe('grazing');
    expect(a.amber).toBe(false);
  });

  it('2. per-day floor: hay over need → pasture 0 and "hay over need" reported, never amber', () => {
    const a = computeEventDmiActual(ctx({ checks: [{ date: '2026-11-05', remaining: 2 }] }), TODAY);
    // 2 bales (850 kg) over 4 days = 212.5 / day vs 113.4 need.
    expect(a.pastureKgPerDay).toBeCloseTo(0, 6);
    expect(a.hayOverKgPerDay).toBeCloseTo(2 * BALE_DM / 4 - need(), 4);
    expect(a.amber).toBe(false);
  });

  it('3. confinement: variance = hay − need (DMI-6 sign), stored-only kind', () => {
    const a = computeEventDmiActual(ctx({ loc: barn, checks: [{ date: '2026-11-05', remaining: 3 }] }), TODAY);
    expect(a.kind).toBe('stored');
    expect(a.storedGapKgPerDay).toBeCloseTo(BALE_DM / 4 - need(), 4);
    expect(a.pastureKgPerDay).toBe(0);
  });

  it('4. one check (Ec1): window = opening anchor → that check', () => {
    const a = computeEventDmiActual(ctx({ checks: [{ date: '2026-11-05', remaining: 3 }] }), TODAY);
    expect(a.windowStart).toBe('2026-11-01');
    expect(a.windowEnd).toBe('2026-11-05');
    expect(a.checks).toBe(1);
    expect(a.hayKgPerDay).toBeCloseTo(BALE_DM / 4, 4);
  });

  it('5. three checks: only the last two count (Wn3)', () => {
    const a = computeEventDmiActual(ctx({ checks: [
      { date: '2026-11-03', remaining: 1 }, { date: '2026-11-05', remaining: 0.9 }, { date: '2026-11-09', remaining: 0.5 },
    ] }), TODAY);
    expect(a.windowStart).toBe('2026-11-05');
    expect(a.hayKgPerDay).toBeCloseTo(0.4 * BALE_DM / 4, 4);
  });

  it('6. Nc2 hide: no check, no stored feed, check missing unit', () => {
    expect(computeEventDmiActual(ctx(), TODAY)).toMatchObject({ show: false, reason: 'no_check' });
    expect(computeEventDmiActual(ctx({ deliveries: 0, checks: [{ date: '2026-11-05', remaining: 0 }] }), TODAY))
      .toMatchObject({ show: false, reason: 'no_stored_feed' });
    expect(computeEventDmiActual(ctx({ checks: [{ date: '2026-11-05', remaining: 3 }], noUnitCheck: 0 }), TODAY))
      .toMatchObject({ show: false, reason: 'no_measured_days' });
  });

  it('7. unknown days excluded: last span unknown (missing unit) → no measured days, hidden; check after today ignored', () => {
    const a = computeEventDmiActual(ctx({ checks: [{ date: '2026-11-05', remaining: 3 }, { date: '2026-11-09', remaining: 2 }], noUnitCheck: 1 }), TODAY);
    expect(a.show).toBe(false);
    const future = computeEventDmiActual(ctx({ checks: [{ date: '2026-11-05', remaining: 3 }, { date: '2026-12-09', remaining: 2 }] }), TODAY);
    expect(future.windowEnd).toBe('2026-11-05');
  });

  it('7b. unknown days excluded: a second pool holding feed with no reading → its days are left out (hidden)', () => {
    const c = ctx({ checks: [{ date: '2026-11-05', remaining: 3 }] });
    c.feedEntries.push({ ...c.feedEntries[0], id: 'fe2', feedTypeId: 'straw', date: '2026-11-02' });
    c.feedTypes.push({ id: 'straw', unit: 'bale', dmPct: 85 });
    const a = computeEventDmiActual(c, TODAY);
    // Nov 2 → Nov 5 the straw pool holds feed with no reading: unknown, excluded.
    if (a.show) expect(a.days).toBeLessThanOrEqual(1 + 1e-9);
    else expect(a.reason).toBe('no_measured_days');
  });

  it('8. amber: stored-only 10.1 % off is amber, exactly 10 % is not, grazing never', () => {
    const at = (ratio, loc = barn) => {
      const eatenKg = need() * 4 * (1 + ratio);
      return computeEventDmiActual(ctx({ loc, checks: [{ date: '2026-11-05', remaining: 4 - eatenKg / BALE_DM }] }), TODAY);
    };
    expect(DMI_ACTUAL_AMBER_RATIO).toBe(0.10);
    expect(at(0.101).amber).toBe(true);
    expect(at(-0.101).amber).toBe(true);
    expect(at(0.10).amber).toBe(false);
    expect(at(-0.10).amber).toBe(false);
    expect(at(0.5, land).amber).toBe(false);
    expect(at(-0.5, land).amber).toBe(false);
  });

  it('9. mixed window (grazing + stored-only days): kind mixed, both phrases, no amber', () => {
    const pws = [
      { id: 'pwA', eventId: 'ev', locationId: 'L', dateOpened: '2026-11-01', timeOpened: '00:00', dateClosed: '2026-11-03', timeClosed: '00:00', areaPct: 100 },
      { id: 'pwB', eventId: 'ev', locationId: 'C', dateOpened: '2026-11-03', timeOpened: '00:00', dateClosed: null, areaPct: 100 },
    ];
    const a = computeEventDmiActual(ctx({ pws, checks: [{ date: '2026-11-05', remaining: 3.5 }] }), TODAY);
    expect(a.kind).toBe('mixed');
    expect(a.grazingDays).toBeGreaterThan(0);
    expect(a.storedDays).toBeGreaterThan(0);
    expect(a.amber).toBe(false);
    const line = renderDmiActualLine(a, 'ev', 'imperial');
    expect(line.textContent).toMatch(/pasture ≈ /);
    expect(line.textContent).toMatch(/eating [\d,]+ (under|over) target on stored-only days/);
    expect(line.dataset.amber).toBeUndefined();
  });

  it('10. per-class need (OI-0279): class DMI% drives the target', () => {
    const a = computeEventDmiActual(ctx({ pct: 3.0, checks: [{ date: '2026-11-05', remaining: 3 }] }), TODAY);
    expect(a.targetKgPerDay).toBeCloseTo(need(3.0), 6);
  });
});

describe('OI-0280 renderDmiActualLine (Dp3 wording, units)', () => {
  const grazing = computeEventDmiActual(ctx({ checks: [{ date: '2026-11-05', remaining: 3.5 }] }), TODAY);
  const confUnder = computeEventDmiActual(ctx({ loc: barn, checks: [{ date: '2026-11-05', remaining: 3 }] }), TODAY);

  it('imperial grazing: Target · hay eaten lb DM/day (%) · pasture ≈ (green)', () => {
    const line = renderDmiActualLine(grazing, 'ev', 'imperial');
    const num = (kg) => formatMeasure(kg, 'weight', { unitSystem: 'imperial', decimals: 0, unitInHeader: true });
    expect(line.textContent).toContain(`Target ${num(grazing.targetKgPerDay)}`);
    expect(line.textContent).toContain(`hay eaten ${formatMeasure(grazing.hayKgPerDay, 'weight', { unitSystem: 'imperial', decimals: 0 })} DM/day (${Math.round(grazing.hayPct)}%)`);
    expect(line.textContent).toMatch(/ lb DM\/day/);
    const pasture = line.querySelector('[data-testid="dashboard-loc-dmi-actual-pasture-ev"]');
    expect(pasture.textContent).toBe(`pasture ≈ ${num(grazing.pastureKgPerDay)}`);
    expect(pasture.style.color).toMatch(/green/);
    expect(line.textContent).not.toMatch(/target \(DMI/);
    expect(line.textContent).not.toMatch(/hay over need/);
  });

  it('metric stored-only under target: "eating X under target", hint "DMI estimate may be high", amber when > 10 %', () => {
    const line = renderDmiActualLine(confUnder, 'ev', 'metric');
    expect(line.textContent).toMatch(/ kg DM\/day/);
    const gap = formatMeasure(Math.abs(confUnder.storedGapKgPerDay), 'weight', { unitSystem: 'metric', decimals: 0, unitInHeader: true });
    expect(line.textContent).toContain(`eating ${gap} under target`);
    expect(line.textContent).not.toMatch(/pasture/);
    expect(line.title).toContain('DMI estimate may be high');
    expect(confUnder.amber).toBe(false); // 106.25 vs 113.4 = 6.3 % off → not amber
    expect(line.dataset.amber).toBeUndefined();
  });
});

describe('OI-0280 amber render', () => {
  it('stored-only 20 % over target → data-amber + amber colour + "DMI estimate may be low"', () => {
    const eaten = need() * 4 * 1.2;
    const a = computeEventDmiActual(ctx({ loc: barn, checks: [{ date: '2026-11-05', remaining: 4 - eaten / BALE_DM }] }), TODAY);
    const line = renderDmiActualLine(a, 'ev', 'imperial');
    expect(line.dataset.amber).toBe('true');
    expect(line.style.color).toMatch(/amber/);
    expect(line.textContent).toMatch(/eating [\d,]+ over target/);
    expect(line.title).toContain('DMI estimate may be low');
  });
});

describe('OI-0280 Home card wiring (store → buildLocationCard)', () => {
  const OP = '00000000-0000-0000-0000-000000000a01';
  const FARM = '00000000-0000-0000-0000-000000000a02';
  const CLASS = '00000000-0000-0000-0000-000000000a03';
  const GROUP = '00000000-0000-0000-0000-000000000a04';
  const LOC = '00000000-0000-0000-0000-000000000a05';
  const EVT = '00000000-0000-0000-0000-000000000a06';
  const FT = '00000000-0000-0000-0000-000000000a07';
  const shift = (ymd, n) => {
    const d = new Date(`${ymd}T00:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function seed({ withCheck, locType = 'confinement' }) {
    _reset();
    localStorage.clear();
    document.body.innerHTML = '';
    const today = getLocalTodayStr();
    const open = shift(today, -8);
    add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }), OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
    add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }), FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
    add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }), FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
    add('animalClasses', AnimalClassEntity.create({
      id: CLASS, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow', dmiPct: 2.5, defaultWeightKg: 500,
      excretionNRate: 0.34, excretionPRate: 0.092, excretionKRate: 0.24,
    }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
    add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }), GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    for (let i = 0; i < 10; i++) {
      const aid = `00000000-0000-0000-0000-00000000c${i.toString().padStart(3, '0')}`;
      add('animals', AnimalEntity.create({ id: aid, operationId: OP, tagNum: `C${i}`, active: true, animalClassId: CLASS, dateBorn: '2024-01-01', sex: 'F' }),
        AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
      add('animalGroupMemberships', MembershipEntity.create({ operationId: OP, animalId: aid, groupId: GROUP, dateJoined: open, dateLeft: null }),
        MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    }
    add('locations', LocationEntity.create({ id: LOC, operationId: OP, farmId: FARM, name: 'Barn', type: locType, landUse: locType === 'land' ? 'pasture' : null, areaHectares: 0.2 }),
      LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateIn: open, dateOut: null }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PwEntity.create({ operationId: OP, eventId: EVT, locationId: LOC, dateOpened: open, timeOpened: '00:00', areaPct: 100 }),
      PwEntity.validate, PwEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GwEntity.create({ operationId: OP, eventId: EVT, groupId: GROUP, dateJoined: open, timeJoined: '00:00', headCount: 10, avgWeightKg: 500 }),
      GwEntity.validate, GwEntity.toSupabaseShape, 'event_group_windows');
    add('feedTypes', FeedTypeEntity.create({ id: FT, operationId: OP, name: 'Hay', category: 'hay', unit: 'bale', dmPct: 85 }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    const BATCH = '00000000-0000-0000-0000-000000000a09';
    add('batches', BatchEntity.create({ id: BATCH, operationId: OP, feedTypeId: FT, name: 'B1', quantity: 20, remaining: 16, unit: 'bale', weightPerUnitKg: 500, dmPct: 85 }),
      BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, locationId: LOC, feedTypeId: FT, batchId: BATCH, date: open, time: '00:00', quantity: 4,
      unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    if (withCheck) {
      const fcId = '00000000-0000-0000-0000-000000000a08';
      add('eventFeedChecks', FeedCheckEntity.create({ id: fcId, operationId: OP, eventId: EVT, date: shift(today, -4), time: '00:00' }),
        FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
      add('eventFeedCheckItems', FeedCheckItemEntity.create({
        operationId: OP, feedCheckId: fcId, locationId: LOC, feedTypeId: FT, remainingQuantity: 3,
        unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85,
      }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
    }
    return { id: EVT, dateIn: open, dateOut: null };
  }

  it('no check yet (Nc2): today\'s "DMI target (forecast)" line stays', () => {
    const ev = seed({ withCheck: false });
    const card = buildLocationCard(ev, OP, FARM, 'imperial');
    const line = card.querySelector(`[data-testid="dashboard-loc-dmi-${EVT}"]`);
    expect(line.textContent).toContain('DMI target (forecast)');
    expect(line.dataset.dmiActual).toBeUndefined();
  });

  it('one check (Ec1): the Dp3 line replaces it, numbers match computeEventDmiActual', () => {
    const ev = seed({ withCheck: true });
    const card = buildLocationCard(ev, OP, FARM, 'imperial');
    const line = card.querySelector(`[data-testid="dashboard-loc-dmi-${EVT}"]`);
    expect(line.dataset.dmiActual).toBe('stored');
    const a = computeEventDmiActual(buildDmi8ChartContext(EVT), { today: getLocalTodayStr() });
    expect(a.hayKgPerDay).toBeCloseTo(BALE_DM / 4, 4);
    expect(line.textContent).toContain(`hay eaten ${formatMeasure(a.hayKgPerDay, 'weight', { unitSystem: 'imperial', decimals: 0 })} DM/day`);
    expect(line.textContent).toMatch(/eating [\d,]+ under target/);
    expect(card.textContent).not.toContain('DMI target (forecast)');
  });
});
