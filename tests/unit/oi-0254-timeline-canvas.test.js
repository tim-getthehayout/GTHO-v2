/** @file OI-0254 — Sc1 canvas extent, Rd1 readiness band, Tk1 ticks, Cm1 collapse. */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveRange,
  resolveCanvasRange,
  dateToPx,
  enumerateTicks,
  defaultSpanDays,
  zoomPxPerDay,
} from '../../src/features/events/rotation-calendar/timeline.js';
import { readinessBandRange } from '../../src/features/events/rotation-calendar/readiness.js';
import {
  getCalendarState,
  resetCalendarState,
  setMetricsCollapsed,
  toggleMetricsCollapsed,
} from '../../src/features/events/calendar-state.js';

describe('OI-0254 timeline canvas', () => {
  describe('resolveCanvasRange — Sc1', () => {
    it('spans earliest event start through latest ready-by', () => {
      const { start, end, pxPerDay } = resolveCanvasRange({
        zoom: 'week',
        today: '2026-11-22',
        eventStarts: ['2026-05-01', '2026-08-15', '2026-03-10'],
        readyByDates: ['2026-12-01', '2026-12-20', '2026-11-30'],
      });
      expect(start.toISOString().slice(0, 10)).toBe('2026-03-10');
      expect(end.toISOString().slice(0, 10)).toBe('2026-12-20');
      expect(pxPerDay).toBe(40);
    });

    it('always includes today even when events are all in the future', () => {
      const { start, end } = resolveCanvasRange({
        zoom: 'week',
        today: '2026-11-22',
        eventStarts: ['2026-12-01'],
        readyByDates: ['2026-12-15'],
      });
      expect(start.toISOString().slice(0, 10)).toBe('2026-11-22');
      expect(end.toISOString().slice(0, 10)).toBe('2026-12-15');
    });

    it('falls back to zoom span when no events or ready-by', () => {
      const { start, end } = resolveCanvasRange({
        zoom: 'week',
        today: '2026-11-22',
        eventStarts: [],
        readyByDates: [],
      });
      const days = Math.round((end - start) / 86400000);
      expect(days).toBe(14);
      expect(defaultSpanDays('week')).toBe(14);
    });

    it('extends left through all past events beyond the old 14-day window', () => {
      const { start, end } = resolveCanvasRange({
        zoom: 'week',
        today: '2026-11-22',
        eventStarts: ['2026-01-05'],
        readyByDates: ['2026-11-25'],
      });
      const days = Math.round((end - start) / 86400000);
      expect(days).toBeGreaterThan(14);
      expect(start.toISOString().slice(0, 10)).toBe('2026-01-05');
    });

    it('zoom only changes pxPerDay, not the data-driven span', () => {
      const week = resolveCanvasRange({
        zoom: 'week',
        today: '2026-11-22',
        eventStarts: ['2026-06-01'],
        readyByDates: ['2026-12-01'],
      });
      const month = resolveCanvasRange({
        zoom: 'month',
        today: '2026-11-22',
        eventStarts: ['2026-06-01'],
        readyByDates: ['2026-12-01'],
      });
      expect(week.start.toISOString().slice(0, 10)).toBe(month.start.toISOString().slice(0, 10));
      expect(week.end.toISOString().slice(0, 10)).toBe(month.end.toISOString().slice(0, 10));
      expect(week.pxPerDay).toBe(40);
      expect(month.pxPerDay).toBe(12);
      expect(zoomPxPerDay('day')).toBe(120);
    });
  });

  describe('resolveRange — legacy short canvas still works', () => {
    it('week zoom still produces ~14 day span', () => {
      const { start, end, pxPerDay } = resolveRange('today', 'week');
      const days = Math.round((end - start) / 86400000);
      expect(days).toBe(14);
      expect(pxPerDay).toBe(40);
    });
  });

  describe('enumerateTicks — Tk1', () => {
    it('marks month starts large, Saturdays medium, other days small', () => {
      // Nov 2026: Sat Nov 1? Nov 1 2026 is Sunday. First Saturday = Nov 7.
      const start = new Date('2026-11-01T00:00:00');
      const end = new Date('2026-11-08T00:00:00');
      const ticks = enumerateTicks(start, end);
      expect(ticks[0]).toMatchObject({ iso: '2026-11-01', kind: 'month' });
      const sat = ticks.find(t => t.iso === '2026-11-07');
      expect(sat?.kind).toBe('saturday');
      const mon = ticks.find(t => t.iso === '2026-11-02');
      expect(mon?.kind).toBe('day');
      expect(ticks.filter(t => t.kind === 'month')).toHaveLength(1);
      expect(ticks.filter(t => t.kind === 'saturday')).toHaveLength(1);
    });

    it('includes a month tick on the 1st even when it is also Saturday', () => {
      // Aug 1 2026 is Saturday — month wins.
      const ticks = enumerateTicks(
        new Date('2026-08-01T00:00:00'),
        new Date('2026-08-01T00:00:00'),
      );
      expect(ticks).toHaveLength(1);
      expect(ticks[0].kind).toBe('month');
    });
  });

  describe('readinessBandRange — Rd1', () => {
    it('returns earliest→latest for survey readiness', () => {
      expect(readinessBandRange({
        mode: 'survey',
        earliestReturn: '2026-12-01',
        windowCloses: '2026-12-15',
      })).toEqual({ start: '2026-12-01', end: '2026-12-15' });
    });

    it('returns null for relative / never / active / missing ends', () => {
      expect(readinessBandRange({ mode: 'relative', earliestReturn: null, windowCloses: null })).toBeNull();
      expect(readinessBandRange({ mode: 'never' })).toBeNull();
      expect(readinessBandRange({ mode: 'active' })).toBeNull();
      expect(readinessBandRange({
        mode: 'survey', earliestReturn: '2026-12-01', windowCloses: null,
      })).toBeNull();
      expect(readinessBandRange(null)).toBeNull();
    });

    it('band left is earliestReturn, not today (Rd1 vs 9ce0e69 shared Today→end)', () => {
      const band = readinessBandRange({
        mode: 'survey',
        earliestReturn: '2026-12-05',
        windowCloses: '2026-12-20',
      });
      expect(band.start).toBe('2026-12-05');
      expect(band.start).not.toBe('2026-11-22');
      // Pixel placement: band starts after today on a canvas that includes today.
      const range = resolveCanvasRange({
        zoom: 'week',
        today: '2026-11-22',
        eventStarts: ['2026-10-01'],
        readyByDates: [band.end],
      });
      const todayPx = dateToPx(new Date('2026-11-22T00:00:00'), range.start, range.pxPerDay);
      const bandLeft = dateToPx(new Date(`${band.start}T00:00:00`), range.start, range.pxPerDay);
      expect(bandLeft).toBeGreaterThan(todayPx);
    });
  });

  describe('metrics collapse — Cm1+Cm1a', () => {
    beforeEach(() => {
      resetCalendarState();
    });

    it('defaults expanded (Cm1a)', () => {
      expect(getCalendarState().metricsCollapsed).toBe(false);
    });

    it('toggle and setMetricsCollapsed flip session state', () => {
      toggleMetricsCollapsed();
      expect(getCalendarState().metricsCollapsed).toBe(true);
      setMetricsCollapsed(false);
      expect(getCalendarState().metricsCollapsed).toBe(false);
      setMetricsCollapsed(true);
      expect(getCalendarState().metricsCollapsed).toBe(true);
    });
  });
});
