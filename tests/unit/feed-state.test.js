/** @file OI-0135 — getLiveRemainingForMove helper resolves per (batch, location)
 * the most-recent feed check's remaining_quantity, falling back to the sum of
 * deliveries when no check exists.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../src/entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../src/entities/event-feed-check-item.js';
import { getLiveRemainingForMove } from '../../src/calcs/feed-state.js';

const OP = '00000000-0000-0000-0000-000000001aa1';
const EVT = '00000000-0000-0000-0000-000000001d11';
const OTHER_EVT = '00000000-0000-0000-0000-000000001d22';
const BATCH_A = '00000000-0000-0000-0000-0000000001b1';
const BATCH_B = '00000000-0000-0000-0000-0000000001b2';
const LOC_A = '00000000-0000-0000-0000-0000000001c1';
const LOC_B = '00000000-0000-0000-0000-0000000001c2';

function addDelivery({ eventId = EVT, batchId, locationId, quantity, date = '2026-04-10' }) {
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId, batchId, locationId, date, quantity,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
}

function addCheck({ eventId = EVT, date, time = null, items }) {
  const check = FeedCheckEntity.create({ operationId: OP, eventId, date, time });
  add('eventFeedChecks', check, FeedCheckEntity.validate,
    FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
  for (const it of items) {
    add('eventFeedCheckItems', FeedCheckItemEntity.create({
      operationId: OP,
      feedCheckId: check.id,
      batchId: it.batchId,
      locationId: it.locationId,
      remainingQuantity: it.remainingQuantity,
    }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
  }
  return check;
}

describe('getLiveRemainingForMove (OI-0135)', () => {
  beforeEach(() => {
    _reset();
    localStorage.clear();
  });

  it('no prior check → falls back to sum of delivery quantities per (batch, location)', () => {
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 10 });
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 5 });
    addDelivery({ batchId: BATCH_B, locationId: LOC_A, quantity: 3 });

    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(15);
    expect(result[`${BATCH_B}|${LOC_A}`]).toBe(3);
  });

  it('single check → uses the check\'s remaining_quantity, not the delivery total', () => {
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 10 });
    addCheck({
      date: '2026-04-12', time: '13:00',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 4 }],
    });

    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(4);
  });

  it('multiple checks → uses the most recent per (batch, location) (date + time ordering)', () => {
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 10 });
    addCheck({
      date: '2026-04-12', time: '09:00',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 7 }],
    });
    addCheck({
      date: '2026-04-12', time: '15:00',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 3 }],
    });
    addCheck({
      date: '2026-04-11', time: '18:00',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 9 }],
    });

    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(3);
  });

  it('mixed: one (batch, location) has a check, another doesn\'t → resolves per-line independently', () => {
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 10 });
    addDelivery({ batchId: BATCH_B, locationId: LOC_B, quantity: 6 });
    addCheck({
      date: '2026-04-12',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 2 }],
    });

    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(2); // check wins
    expect(result[`${BATCH_B}|${LOC_B}`]).toBe(6); // delivery fallback
  });

  it('ignores feed checks and deliveries from other events', () => {
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 10 });
    addDelivery({ eventId: OTHER_EVT, batchId: BATCH_A, locationId: LOC_A, quantity: 99 });
    addCheck({
      eventId: OTHER_EVT,
      date: '2026-04-12',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 50 }],
    });

    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(10);
  });
});

describe('getLiveRemainingForMove (OI-0139 — post-check deliveries)', () => {
  beforeEach(() => {
    _reset();
    localStorage.clear();
  });

  // Case 1: lifetime seed unchanged when no check exists. Belt-and-braces with
  // OI-0135's "no prior check" path, restated under OI-0139's invariant.
  it('case 1 — one delivery, no prior check → lifetime seed', () => {
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 1, date: '2026-04-16' });
    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(1);
  });

  // Case 2: OI-0135 path — single check, no post-check delivery → check value wins.
  it('case 2 — one delivery + one check after, no post-check delivery → check value', () => {
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 1, date: '2026-04-16' });
    addCheck({
      date: '2026-04-20', time: '15:00',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 0.5 }],
    });
    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(0.5);
  });

  // Case 3: the live Pasture D reproducer. Check at 0 followed by a delivery
  // → live = 0 + 1 = 1.
  it('case 3 — Pasture D: 0-remaining check + post-check delivery → check + delivery', () => {
    addCheck({
      date: '2026-04-28', time: '13:51',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 0 }],
    });
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 1, date: '2026-04-29' });
    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(1);
  });

  // Case 4: only deliveries strictly after the *latest* check are added.
  // Earlier deliveries that fell between checks are already captured by the
  // latest check's reading.
  it('case 4 — two checks + deliveries between and after → only post-latest-check delivery counts', () => {
    addCheck({
      date: '2026-04-16', time: '13:19',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 0.85 }],
    });
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 1, date: '2026-04-20' });
    addCheck({
      date: '2026-04-28', time: '13:51',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 0 }],
    });
    addDelivery({ batchId: BATCH_A, locationId: LOC_A, quantity: 1, date: '2026-04-29' });
    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(1);
  });

  // Case 5: strict-`>` rule. A delivery saved at the exact same (date, time)
  // as the latest check is treated as captured BY the check, not in addition
  // to it. Prevents double-count when farmer takes a check + drops a bale in
  // the same minute.
  it('case 5 — same-instant delivery is NOT added on top of the check (strict-> rule)', () => {
    addCheck({
      date: '2026-04-28', time: '13:51',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 0.5 }],
    });
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH_A, locationId: LOC_A,
      date: '2026-04-28', time: '13:51', quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(0.5);
  });

  // Case 6: time:null on a delivery coerces to 00:00 for the timestamp
  // comparison, so a date strictly after the check's date clears strict-`>`.
  // Mirrors v1-migration deliveries which leave time null.
  it('case 6 — time:null delivery dated after the check is included', () => {
    addCheck({
      date: '2026-04-28', time: '13:51',
      items: [{ batchId: BATCH_A, locationId: LOC_A, remainingQuantity: 0.3 }],
    });
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH_A, locationId: LOC_A,
      date: '2026-04-29', time: null, quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    const result = getLiveRemainingForMove(EVT);
    expect(result[`${BATCH_A}|${LOC_A}`]).toBe(1.3);
  });
});
