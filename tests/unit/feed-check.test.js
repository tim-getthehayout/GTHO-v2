/** @file Tests for feed-check Save flow (OI-0103). */
import { describe, it, expect } from 'vitest';
import * as FeedCheckEntity from '../../src/entities/event-feed-check.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const EVT = '00000000-0000-0000-0000-0000000000e1';

describe('FeedCheckEntity — `date` field round-trip (OI-0103)', () => {
  it('create() picks up `date` from input and toSupabaseShape emits `date`', () => {
    // Mirrors the save-handler call in src/features/feed/check.js after the fix.
    const record = FeedCheckEntity.create({
      operationId: OP,
      eventId: EVT,
      date: '2026-04-18',
      time: '14:30',
    });
    expect(record.date).toBe('2026-04-18');
    expect(record.time).toBe('14:30');

    const sb = FeedCheckEntity.toSupabaseShape(record);
    expect(sb.date).toBe('2026-04-18');

    // Round-trip survives fromSupabaseShape.
    const back = FeedCheckEntity.fromSupabaseShape(sb);
    expect(back.date).toBe('2026-04-18');
  });

  it('validate() rejects a record with a missing date (regression guard for the pre-fix silent drop)', () => {
    const bad = FeedCheckEntity.create({
      operationId: OP,
      eventId: EVT,
      // date intentionally omitted — simulates what the pre-OI-0103 code produced
      // when it passed `checkDate:` (entity FIELDS key is `date`, so create()
      // ignored the misnamed key and left date=null).
    });
    const v = FeedCheckEntity.validate(bad);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => /date/i.test(e))).toBe(true);
  });

  it('validate() accepts a record with date set', () => {
    const good = FeedCheckEntity.create({
      operationId: OP,
      eventId: EVT,
      date: '2026-04-18',
    });
    const v = FeedCheckEntity.validate(good);
    expect(v.valid).toBe(true);
  });
});
