/** @file Date utility tests — edge cases: midnight, DST, date math */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  today, formatDate, formatDateTime, addDays,
  daysBetweenInclusive, startOfDay,
  isValidDateString, parseDate, getLocalTodayStr,
} from '../../src/utils/date-utils.js';

describe('date-utils', () => {
  describe('formatDate', () => {
    it('formats a Date as YYYY-MM-DD in UTC', () => {
      const d = new Date('2024-03-15T10:30:00Z');
      expect(formatDate(d, 'UTC')).toBe('2024-03-15');
    });

    it('formats an ISO string', () => {
      expect(formatDate('2024-12-31T23:59:59Z', 'UTC')).toBe('2024-12-31');
    });

    it('respects timezone — midnight UTC is previous day in US timezones', () => {
      // 2024-01-15 00:30 UTC = 2024-01-14 in America/Chicago
      const d = new Date('2024-01-15T00:30:00Z');
      expect(formatDate(d, 'America/Chicago')).toBe('2024-01-14');
    });
  });

  describe('today', () => {
    it('returns a YYYY-MM-DD string', () => {
      const result = today('UTC');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('formatDateTime', () => {
    it('returns a human-readable string', () => {
      const result = formatDateTime('2024-06-15T14:30:00Z', 'UTC');
      expect(result).toContain('Jun');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });
  });

  describe('addDays', () => {
    it('adds positive days', () => {
      const result = addDays('2024-01-01T00:00:00Z', 5);
      expect(result.toISOString()).toContain('2024-01-06');
    });

    it('subtracts with negative days', () => {
      const result = addDays('2024-01-10T00:00:00Z', -3);
      expect(result.toISOString()).toContain('2024-01-07');
    });

    it('crosses month boundary', () => {
      const result = addDays('2024-01-30T00:00:00Z', 3);
      expect(result.toISOString()).toContain('2024-02-02');
    });
  });

  describe('daysBetweenInclusive', () => {
    it('same day = 1', () => {
      expect(daysBetweenInclusive('2024-01-01', '2024-01-01')).toBe(1);
    });

    it('adjacent days = 2', () => {
      expect(daysBetweenInclusive('2024-01-01', '2024-01-02')).toBe(2);
    });

    it('3 days apart = 3', () => {
      expect(daysBetweenInclusive('2024-01-01', '2024-01-03')).toBe(3);
    });
  });

  describe('startOfDay', () => {
    it('strips time to midnight UTC', () => {
      const result = startOfDay('2024-06-15T14:30:00Z');
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
    });
  });

  describe('isValidDateString', () => {
    it('true for ISO date', () => {
      expect(isValidDateString('2024-01-15')).toBe(true);
    });
    it('true for ISO datetime', () => {
      expect(isValidDateString('2024-01-15T10:30:00Z')).toBe(true);
    });
    it('false for garbage', () => {
      expect(isValidDateString('not-a-date')).toBe(false);
    });
    it('false for non-string', () => {
      expect(isValidDateString(12345)).toBe(false);
    });
  });

  describe('parseDate', () => {
    it('parses YYYY-MM-DD to midnight UTC', () => {
      const d = parseDate('2024-06-15');
      expect(d.toISOString()).toBe('2024-06-15T00:00:00.000Z');
    });
    it('parses full ISO string', () => {
      const d = parseDate('2024-06-15T14:30:00Z');
      expect(d.toISOString()).toBe('2024-06-15T14:30:00.000Z');
    });
    it('returns null for invalid', () => {
      expect(parseDate('nope')).toBeNull();
    });
  });
});

describe('getLocalTodayStr (device-local today)', () => {
  const origTZ = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    if (origTZ === undefined) delete process.env.TZ; else process.env.TZ = origTZ;
  });

  function at(tz, isoInstant) {
    process.env.TZ = tz;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoInstant));
    return getLocalTodayStr();
  }

  // [timezone, offset label, local midnight, local noon, local 11:59 PM] as UTC instants for 2026-05-08 local
  const cases = [
    ['America/New_York', 'EDT -4', '2026-05-08T04:00:00Z', '2026-05-08T16:00:00Z', '2026-05-09T03:59:00Z'],
    ['America/Los_Angeles', 'PDT -7', '2026-05-08T07:00:00Z', '2026-05-08T19:00:00Z', '2026-05-09T06:59:00Z'],
    ['UTC', 'UTC 0', '2026-05-08T00:00:00Z', '2026-05-08T12:00:00Z', '2026-05-08T23:59:00Z'],
    ['Asia/Tokyo', 'JST +9', '2026-05-07T15:00:00Z', '2026-05-08T03:00:00Z', '2026-05-08T14:59:00Z'],
    ['Pacific/Auckland', 'NZST +12', '2026-05-07T12:00:00Z', '2026-05-08T00:00:00Z', '2026-05-08T11:59:00Z'],
  ];

  for (const [tz, label, midnight, noon, late] of cases) {
    it(`returns the local date at midnight, noon, and 11:59 PM in ${tz} (${label})`, () => {
      expect(at(tz, midnight)).toBe('2026-05-08');
      expect(at(tz, noon)).toBe('2026-05-08');
      expect(at(tz, late)).toBe('2026-05-08');
    });
  }

  it('K-5 repro: 8:23 PM EDT on 2026-05-08 with dateOpened 2026-05-08 reads Day 1', () => {
    const todayStr = at('America/New_York', '2026-05-09T00:23:00Z');
    expect(todayStr).toBe('2026-05-08');
    expect(daysBetweenInclusive('2026-05-08', todayStr)).toBe(1);
    // the old UTC slice rolled over to tomorrow and read Day 2
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-05-09');
  });

  it('pasture-% day count is identical at noon and late evening on the same local day', () => {
    const dmiKgPerDay = 250;
    const noonDays = daysBetweenInclusive('2026-05-01', at('America/New_York', '2026-05-08T16:00:00Z'));
    const lateDays = daysBetweenInclusive('2026-05-01', at('America/New_York', '2026-05-09T03:30:00Z'));
    expect(lateDays).toBe(noonDays);
    expect(dmiKgPerDay * lateDays).toBe(dmiKgPerDay * noonDays);
  });
});
