import { expect, it } from 'vitest';
import '../../src/calcs/feed-forage.js';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import { computeIntervals, buildLineSequence } from '../../src/features/events/edit-feed-check.js';
const calc = () => getCalcByName('DMI-8');
function context() {
  return { event: { id: 'event', dateIn: '2026-11-05' }, date: '2026-11-08',
    groupWindows: [{ groupId: 'herd', headCount: 20, avgWeightKg: 500, dateJoined: '2026-11-05' }], memberships: null, animals: [], animalWeightRecords: [], animalClasses: {},
    paddockWindows: [{ id: 'pw', eventId: 'event', locationId: 'yard', dateOpened: '2026-11-05' }], locations: { yard: { type: 'confinement' } }, forageTypes: {}, observations: [],
    batches: { hay: { weightPerUnitKg: 100, dmPct: 100 } },
    feedEntries: [{ id: 'delivery', batchId: 'hay', date: '2026-11-05', time: '10:00', quantity: 12 }],
    feedChecks: [{ id: 'open', date: '2026-11-05', time: '09:00' }, { id: 'close', date: '2026-11-09', time: '13:00' }],
    feedCheckItems: [{ feedCheckId: 'open', batchId: 'hay', remainingQuantity: 2.5 }, { feedCheckId: 'close', batchId: 'hay', remainingQuantity: 7 }],
  };
}
// Nov 5 09:00 → Nov 9 13:00 is 100 elapsed hours (750 kg eaten); Nov 8 holds 24 of them = 180 kg.
it('live November bracket includes same-day later feeding, not a feeding after the closing clock', () => {
  const ctx = context(); ctx.feedEntries.push({ batchId: 'hay', date: '2026-11-09', time: '13:01', quantity: 20 });
  const before = JSON.stringify(ctx); expect(calc().fn(ctx)).toMatchObject({ status: 'actual', storedDmiKg: 180 });
  expect(JSON.stringify(ctx)).toBe(before);
});
it.each([
  ['2026-11-05', '08:59', false], ['2026-11-05', '09:00', false], ['2026-11-05', '09:01', true],
  ['2026-11-09', '12:59', true], ['2026-11-09', '13:00', true], ['2026-11-09', '13:01', false],
  ['2026-11-05', null, false], ['2026-11-09', null, true], ['2026-11-04', '23:59', false], ['2026-11-10', '00:00', false],
])('history and edit intervals agree for delivery %s %s (captured: %s)', (date, time, included) => {
  const ctx = context(); ctx.feedEntries.push({ batchId: 'hay', date, time, quantity: 1 });
  const before = JSON.stringify(ctx); expect(calc().fn(ctx).storedDmiKg).toBe(180 + (included ? 24 : 0));
  expect(computeIntervals({ sequence: [{ ...ctx.feedChecks[0], remaining: 2.5 }, { ...ctx.feedChecks[1], remaining: 7 }], entries: ctx.feedEntries })[0].consumed).toBe(7.5 + (included ? 1 : 0));
  expect(JSON.stringify(ctx)).toBe(before);
});
it('multiple same-day checks and backdated insertion order select the same effective anchors', () => {
  const ctx = context(); ctx.feedChecks.push({ id: 'later-open', date: '2026-11-05', time: '15:00' });
  ctx.feedCheckItems.push({ feedCheckId: 'later-open', batchId: 'hay', remainingQuantity: 8 });
  // Nov 5 15:00 → Nov 9 13:00 is 94 elapsed hours (100 kg eaten); Nov 8 holds 24 of them.
  expect(calc().fn(ctx).storedDmiKg).toBeCloseTo(100 * 24 / 94, 9);
  ctx.feedChecks.reverse(); ctx.feedCheckItems.reverse(); ctx.feedEntries.reverse(); const before = JSON.stringify(ctx);
  expect(calc().fn(ctx).storedDmiKg).toBeCloseTo(100 * 24 / 94, 9); expect(JSON.stringify(ctx)).toBe(before);
});
it('the editor stages the new clock, uses midnight for missing time, and never double-counts captured feeding', () => {
  const checks = [{ id: 'one', eventId: 'event', date: '2026-11-09', time: '12:59' }, { id: 'two', eventId: 'event', date: '2026-11-09', time: '13:01' }];
  const items = checks.map((row, i) => ({ id: 'item-' + i, feedCheckId: row.id, locationId: 'yard', batchId: 'hay', remainingQuantity: i ? 8 : 2 }));
  const entries = [{ date: '2026-11-09', time: '13:00', quantity: 6 }];
  const sequence = buildLineSequence({ eventId: 'event', batchId: 'hay', locationId: 'yard', allChecks: checks, allItems: items });
  expect(computeIntervals({ sequence, entries })[0].consumed).toBe(0);
  const changed = buildLineSequence({ eventId: 'event', batchId: 'hay', locationId: 'yard', allChecks: checks, allItems: items, editedItemId: 'item-0', stagedRemaining: 8, stagedTime: '13:00' });
  expect(computeIntervals({ sequence: changed, entries })[0].consumed).toBe(0);
  const missing = buildLineSequence({ eventId: 'event', batchId: 'hay', locationId: 'yard', allChecks: [{ ...checks[0], time: null }, { ...checks[1], time: '00:00' }], allItems: items });
  expect(computeIntervals({ sequence: missing, entries: [{ ...entries[0], time: null }] })[0].consumed).toBe(-6);
});
