/** Feed-check plausibility helper — invented ids, corral vectors from the 2026-11-17 brief. */
import { describe, it, expect, beforeEach } from 'vitest';
import { feedCheckPlausibility } from '../../src/calcs/feed-check-plausibility.js';
import { poolReading } from '../../src/calcs/feed-pools.js';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import { _reset, add, getAll, setSyncAdapter } from '../../src/data/store.js';
import { previewPoolCheck, writePoolCheck } from '../../src/features/feed/pool-ledger.js';
import { convert } from '../../src/utils/units.js';
import * as Operation from '../../src/entities/operation.js';
import * as EventEntity from '../../src/entities/event.js';
import * as Location from '../../src/entities/location.js';
import * as FeedType from '../../src/entities/feed-type.js';
import * as Batch from '../../src/entities/batch.js';
import * as Entry from '../../src/entities/event-feed-entry.js';
import * as Check from '../../src/entities/event-feed-check.js';
import * as Item from '../../src/entities/event-feed-check-item.js';
import * as PW from '../../src/entities/event-paddock-window.js';
import * as GW from '../../src/entities/event-group-window.js';
import * as AnimalClass from '../../src/entities/animal-class.js';
import * as Animal from '../../src/entities/animal.js';
import * as Membership from '../../src/entities/animal-group-membership.js';
import { inventoryPoolSnapshot } from '../../src/features/feed/pool-ledger.js';

const BALE_KG = 272.16;
const DM_PCT = 90;
const EVENT = 'evt-corral';
const LOC = 'loc-corral';
const HAY = 'ft-hay';
const STRAW = 'ft-straw';
const key = (type = HAY, loc = LOC) => `${EVENT}|${loc}|${type}`;

const event = { id: EVENT, dateIn: '2026-11-09' };
const confinement = { id: LOC, type: 'confinement', name: 'Corral' };
const pastureLoc = { id: LOC, type: 'land', name: 'Pasture' };
const paddockWindows = [{ id: 'pw-corral', eventId: EVENT, locationId: LOC, dateOpened: '2026-11-09' }];
const groupWindows = [
  { id: 'gw-a', eventId: EVENT, groupId: 'grp-a', dateJoined: '2026-11-09', headCount: 10, avgWeightKg: 120 },
  { id: 'gw-b', eventId: EVENT, groupId: 'grp-b', dateJoined: '2026-11-09', headCount: 8, avgWeightKg: 120 },
  { id: 'gw-c', eventId: EVENT, groupId: 'grp-c', dateJoined: '2026-11-09', headCount: 4, avgWeightKg: 120 },
];
const feedTypes = [{ id: HAY, unit: 'bale' }, { id: STRAW, unit: 'bale' }];

function delivery(id, date, time, quantity, type = HAY) {
  return {
    id, eventId: EVENT, locationId: LOC, feedTypeId: type, kind: 'inventory_feeding',
    date, time, quantity, unitSnapshot: 'bale', weightPerUnitKgSnapshot: BALE_KG, dmPctSnapshot: DM_PCT,
  };
}
function check(id, date, time) {
  return { id, eventId: EVENT, date, time };
}
function item(checkId, remaining, type = HAY) {
  return {
    id: `item-${checkId}-${type}`, feedCheckId: checkId, locationId: LOC, feedTypeId: type, batchId: null,
    remainingQuantity: remaining, unitSnapshot: 'bale', weightPerUnitKgSnapshot: BALE_KG, dmPctSnapshot: DM_PCT,
  };
}

/** One 4-bale delivery, then remainings: 4 / 3.25 / 2.25 / mid / 0.66. */
function fixture({ mid = 0.75, include17 = true, loc = confinement, windows = groupWindows, extraEntries = [], extraItems = [] } = {}) {
  const checks = [
    check('chk-11', '2026-11-11', '14:37'),
    check('chk-12', '2026-11-12', '15:00'),
    check('chk-13', '2026-11-13', '17:02'),
    check('chk-16', '2026-11-16', '09:12'),
  ];
  const items = [
    item('chk-11', 4), item('chk-12', 3.25), item('chk-13', 2.25), item('chk-16', mid),
  ];
  if (include17) {
    checks.push(check('chk-17', '2026-11-17', '12:04'));
    items.push(item('chk-17', 0.66));
  }
  return {
    poolInput: {
      eventId: EVENT,
      entries: [delivery('fed-hay', '2026-11-11', '10:00', 4), ...extraEntries],
      checks, items: [...items, ...extraItems],
      feedTypes, batches: [],
    },
    event, paddockWindows, locations: { [LOC]: loc }, groupWindows: windows,
  };
}

function warn(args, proposedId) {
  const ctx = { ...args };
  return feedCheckPlausibility({ ...ctx, proposedCheck: ctx.poolInput.checks.find(row => row.id === proposedId) });
}

function lb(kg) {
  return convert(kg, 'weight', 'toImperial');
}

describe('feedCheckPlausibility helper', () => {
  it('is registered with a formula string', () => {
    const calc = getCalcByName('feedCheckPlausibility');
    expect(calc.category).toBe('feed');
    expect(calc.formula).toMatch(/impliedDmPerDay/);
    expect(calc.fn).toBe(feedCheckPlausibility);
  });

  it('saving the Nov 17 0.66 reading warns low at about 30% (43 lb/day vs 145.5)', () => {
    const warnings = warn(fixture({ mid: 0.75, include17: true }), 'chk-17');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('low');
    expect(warnings[0].poolKey).toBe(key());
    expect(lb(warnings[0].impliedDmKgPerDay)).toBeCloseTo(43.4, 1);
    expect(lb(warnings[0].expectedDmKgPerDay)).toBeCloseTo(145.5, 1);
    expect(warnings[0].pct).toBeCloseTo(30, 0);
    expect(warnings[0].interval.from.date).toBe('2026-11-16');
    expect(warnings[0].interval.to.date).toBe('2026-11-17');
  });

  it('re-saving Nov 16 = 0.75 warns only on the next 30% interval, not the previous 208%', () => {
    const warnings = warn(fixture({ mid: 0.75, include17: true }), 'chk-16');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('low');
    expect(warnings[0].interval.from.date).toBe('2026-11-16');
    expect(warnings[0].interval.to.date).toBe('2026-11-17');
    expect(warnings[0].pct).toBeCloseTo(30, 0);
  });

  it('the Nov 12 15:00 → Nov 13 17:02 interval at 342% does not warn', () => {
    expect(warn(fixture({ mid: 0.75, include17: true }), 'chk-13')).toEqual([]);
    expect(warn(fixture({ mid: 0.75, include17: true }), 'chk-12')).toEqual([]);
  });

  it('saving Nov 16 = 2.25 warns low at 0% on the interval from Nov 13', () => {
    const warnings = warn(fixture({ mid: 2.25, include17: false }), 'chk-16');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('low');
    expect(warnings[0].pct).toBeCloseTo(0, 5);
    expect(warnings[0].impliedDmKgPerDay).toBeCloseTo(0, 5);
    expect(warnings[0].interval.from.date).toBe('2026-11-13');
    expect(warnings[0].interval.to.date).toBe('2026-11-16');
  });

  it('with 2.25 in place, saving Nov 17 = 0.66 warns high at about 527%', () => {
    const warnings = warn(fixture({ mid: 2.25, include17: true }), 'chk-17');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('high');
    expect(warnings[0].pct).toBeCloseTo(527, 0);
  });

  it('the same 0% interval is silent when the event has an open non-confinement paddock window', () => {
    expect(warn(fixture({ mid: 2.25, include17: false, loc: pastureLoc }), 'chk-16')).toEqual([]);
  });

  it('a pasture event still warns above 400%', () => {
    const warnings = warn(fixture({ mid: 2.25, include17: true, loc: pastureLoc }), 'chk-17');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('high');
    expect(warnings[0].pct).toBeCloseTo(527, 0);
  });

  it('skips the first reading of a pool', () => {
    const ctx = fixture({ mid: 0.75, include17: false });
    ctx.poolInput.checks = [check('chk-11', '2026-11-11', '14:37')];
    ctx.poolInput.items = [item('chk-11', 4)];
    expect(warn(ctx, 'chk-11')).toEqual([]);
  });

  it('skips an interval under 12 hours', () => {
    const ctx = fixture({ mid: 0.75, include17: false });
    ctx.poolInput.checks = [
      check('chk-11', '2026-11-11', '14:37'),
      check('chk-soon', '2026-11-11', '23:00'),
    ];
    ctx.poolInput.items = [item('chk-11', 4), item('chk-soon', 0)];
    expect(warn(ctx, 'chk-soon')).toEqual([]);
  });

  it('skips when expected DMI is unknown or zero', () => {
    expect(warn(fixture({ mid: 2.25, include17: false, windows: [] }), 'chk-16')).toEqual([]);
  });

  it('skips when live window weights are unknown', () => {
    const windows = [{ id: 'gw-open', eventId: EVENT, groupId: 'grp-open', dateJoined: '2026-11-09', headCount: 22, avgWeightKg: 120 }];
    const ctx = fixture({ mid: 2.25, include17: false, windows });
    const warnings = feedCheckPlausibility({
      ...ctx,
      proposedCheck: ctx.poolInput.checks.find(row => row.id === 'chk-16'),
      memberships: [{ groupId: 'grp-open', animalId: 'an-1', startDate: '2026-11-01' }],
      animals: [{ id: 'an-1' }],
      animalClasses: {},
      animalWeightRecords: [],
    });
    expect(warnings).toEqual([]);
  });

  it('a second active stored-feed pool on a confinement event uses the upper bound only', () => {
    const extra = {
      extraEntries: [delivery('fed-straw', '2026-11-11', '10:00', 2, STRAW)],
      extraItems: [
        item('chk-11', 2, STRAW), item('chk-12', 2, STRAW), item('chk-13', 2, STRAW), item('chk-16', 2, STRAW),
      ],
    };
    expect(warn(fixture({ mid: 2.25, include17: false, ...extra }), 'chk-16')).toEqual([]);
    const high = warn(fixture({ mid: 2.25, include17: true, extraEntries: extra.extraEntries, extraItems: [...extra.extraItems, item('chk-17', 2, STRAW)] }), 'chk-17');
    expect(high).toHaveLength(1);
    expect(high[0].kind).toBe('high');
  });

  it('returns negative for a hand-built interval whose remaining rises with no deliveries', () => {
    const ctx = {
      poolInput: {
        eventId: EVENT,
        entries: [delivery('fed-hay', '2026-11-11', '10:00', 4)],
        checks: [check('chk-a', '2026-11-12', '08:00'), check('chk-b', '2026-11-14', '08:00')],
        items: [item('chk-a', 1), item('chk-b', 2)],
        feedTypes, batches: [],
      },
      event, paddockWindows, locations: { [LOC]: confinement }, groupWindows,
    };
    const warnings = warn(ctx, 'chk-b');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('negative');
    expect(warnings[0].impliedDmKgPerDay).toBeLessThan(0);
  });
});

describe('existing intake blocks and no-op preview', () => {
  const OP = 'op-plausibility';
  function seedRow(type, entity, data, table = type) {
    const row = entity.create({ operationId: OP, ...data });
    add(type, row, entity.validate, entity.toSupabaseShape, table);
    return row;
  }

  beforeEach(() => {
    _reset();
    setSyncAdapter(null);
    seedRow('operations', Operation, { id: OP, name: 'Op', unitSystem: 'imperial' }, 'operations');
    seedRow('events', EventEntity, { id: EVENT, farmId: 'farm-1', dateIn: '2026-11-09' }, 'events');
    seedRow('locations', Location, { id: LOC, farmId: 'farm-1', name: 'Corral', type: 'confinement' }, 'locations');
    seedRow('feedTypes', FeedType, { id: HAY, name: 'Hay', category: 'forage', unit: 'bale' }, 'feed_types');
    const batch = seedRow('batches', Batch, { id: 'batch-hay', feedTypeId: HAY, name: 'Hay', unit: 'bale', quantity: 10, remaining: 6, weightPerUnitKg: BALE_KG, dmPct: DM_PCT }, 'batches');
    seedRow('eventPaddockWindows', PW, { id: 'pw-corral', eventId: EVENT, locationId: LOC, dateOpened: '2026-11-09' }, 'event_paddock_windows');
    seedRow('eventGroupWindows', GW, { id: 'gw-a', eventId: EVENT, groupId: 'grp-a', dateJoined: '2026-11-09', headCount: 22, avgWeightKg: 120 }, 'event_group_windows');
    seedRow('animalClasses', AnimalClass, { id: 'cls-ram', name: 'Ram lambs', species: 'sheep', role: 'growing', defaultWeightKg: 120, dmiPct: 2.5 }, 'animal_classes');
    seedRow('animals', Animal, { id: 'an-rams', classId: 'cls-ram', name: 'Rams', sex: 'male', isBulk: true, bulkHeadCount: 22 }, 'animals');
    seedRow('animalGroupMemberships', Membership, { id: 'mem-rams', animalId: 'an-rams', groupId: 'grp-a', dateJoined: '2026-11-09' }, 'animal_group_memberships');
    seedRow('eventFeedEntries', Entry, { id: 'fed-hay', eventId: EVENT, locationId: LOC, batchId: 'batch-hay', date: '2026-11-11', time: '10:00', quantity: 4, ...inventoryPoolSnapshot(batch) }, 'event_feed_entries');
    for (const [id, date, time, remaining] of [['chk-11', '2026-11-11', '14:37', 4], ['chk-12', '2026-11-12', '15:00', 3.25], ['chk-13', '2026-11-13', '17:02', 2.25], ['chk-16', '2026-11-16', '09:12', 0.75]]) {
      seedRow('eventFeedChecks', Check, { id, eventId: EVENT, date, time }, 'event_feed_checks');
      seedRow('eventFeedCheckItems', Item, { id: `item-${id}`, feedCheckId: id, locationId: LOC, feedTypeId: HAY, batchId: null, remainingQuantity: remaining, unitSnapshot: 'bale', weightPerUnitKgSnapshot: BALE_KG, dmPctSnapshot: DM_PCT }, 'event_feed_check_items');
    }
  });

  it('still refuses a remaining above available feed', () => {
    const pool = { feedTypeId: HAY, locationId: LOC, q: 0.75, m: 0.75 * BALE_KG, d: 0.75 * BALE_KG * DM_PCT / 100, unit: 'bale', massBased: false };
    expect(() => poolReading(pool, 2, 'bale')).toThrow('exceeds available feed');
  });

  it('still refuses an edit that would leave a later reading above its stock', () => {
    expect(() => writePoolCheck({
      operationId: OP, eventId: EVENT, date: '2026-11-11', time: '14:37',
      readings: [{ locationId: LOC, feedTypeId: HAY, remainingQuantity: 0, unit: 'bale' }],
      checkId: 'chk-11',
    })).toThrow('later observation');
  });

  it('a no-op edit preview returns no warnings and writes nothing', () => {
    const before = JSON.stringify(getAll('eventFeedCheckItems'));
    const warnings = previewPoolCheck({
      operationId: OP, eventId: EVENT, date: '2026-11-16', time: '09:12',
      readings: [{ locationId: LOC, feedTypeId: HAY, remainingQuantity: 0.75, unit: 'bale' }],
      checkId: 'chk-16',
    });
    expect(warnings).toEqual([]);
    expect(JSON.stringify(getAll('eventFeedCheckItems'))).toBe(before);
  });

  it('preview of a mid-sequence no-consumption edit still reports the 0% interval when values actually change from a later state', () => {
    // Sanity: editing Nov 16 from 0.75 to 2.25 is a change and warns low.
    const warnings = previewPoolCheck({
      operationId: OP, eventId: EVENT, date: '2026-11-16', time: '09:12',
      readings: [{ locationId: LOC, feedTypeId: HAY, remainingQuantity: 2.25, unit: 'bale' }],
      checkId: 'chk-16',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('low');
    expect(warnings[0].pct).toBeCloseTo(0, 5);
    expect(getAll('eventFeedCheckItems').find(row => row.feedCheckId === 'chk-16').remainingQuantity).toBe(0.75);
  });
});
