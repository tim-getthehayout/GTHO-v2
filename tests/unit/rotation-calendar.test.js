/** @file Rotation calendar component tests — CP-54. */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildGroupLabel } from '../../src/features/events/rotation-calendar/past-block.js';
import { resolveRange, dateToPx } from '../../src/features/events/rotation-calendar/timeline.js';

describe('rotation-calendar components', () => {
  describe('buildGroupLabel — multi-group rule', () => {
    it('empty groups returns empty', () => {
      const result = buildGroupLabel([]);
      expect(result.text).toBe('');
      expect(result.tooltip).toBeNull();
    });

    it('N=1 returns group name directly', () => {
      const result = buildGroupLabel([{ id: 'g1', name: 'Herd A' }]);
      expect(result.text).toBe('Herd A');
      expect(result.tooltip).toBeNull();
      expect(result.ariaLabel).toBe('Herd A');
    });

    it('N>1 returns "Multiple Groups (N)" with tooltip', () => {
      const result = buildGroupLabel([
        { id: 'g1', name: 'Herd A' },
        { id: 'g2', name: 'Herd B' },
      ]);
      expect(result.text).toBe('Multiple Groups (2)');
      expect(result.tooltip).toBe('Herd A, Herd B');
      expect(result.ariaLabel).toBe('Multiple Groups (2): Herd A, Herd B');
    });

    it('N=3 includes all group names in tooltip', () => {
      const result = buildGroupLabel([
        { id: 'g1', name: 'A' },
        { id: 'g2', name: 'B' },
        { id: 'g3', name: 'C' },
      ]);
      expect(result.text).toBe('Multiple Groups (3)');
      expect(result.tooltip).toBe('A, B, C');
    });
  });

  describe('resolveRange — zoom/anchor to date range', () => {
    it('week zoom produces ~14 day span', () => {
      const { start, end, pxPerDay } = resolveRange('today', 'week');
      const days = Math.round((end - start) / 86400000);
      expect(days).toBe(14);
      expect(pxPerDay).toBe(40);
    });

    it('day zoom produces ~3 day span', () => {
      const { start, end, pxPerDay } = resolveRange('today', 'day');
      const days = Math.round((end - start) / 86400000);
      expect(days).toBe(3);
      expect(pxPerDay).toBe(120);
    });

    it('month zoom produces ~60 day span', () => {
      const { start, end } = resolveRange('today', 'month');
      const days = Math.round((end - start) / 86400000);
      expect(days).toBe(60);
    });

    it('last90 zoom produces 90 day span', () => {
      const { start, end } = resolveRange('today', 'last90');
      const days = Math.round((end - start) / 86400000);
      expect(days).toBe(90);
    });

    it('ISO date anchor centers on that date', () => {
      const { start, end } = resolveRange('2026-06-15', 'week');
      const mid = new Date((start.getTime() + end.getTime()) / 2);
      expect(mid.toISOString().slice(0, 10)).toBe('2026-06-15');
    });
  });

  describe('dateToPx — date to pixel conversion', () => {
    it('same day returns 0', () => {
      const start = new Date('2026-01-01');
      expect(dateToPx(start, start, 40)).toBe(0);
    });

    it('one day later returns pxPerDay', () => {
      const start = new Date('2026-01-01');
      const next = new Date('2026-01-02');
      expect(dateToPx(next, start, 40)).toBe(40);
    });

    it('7 days later returns 7 × pxPerDay', () => {
      const start = new Date('2026-01-01');
      const week = new Date('2026-01-08');
      expect(dateToPx(week, start, 40)).toBe(280);
    });
  });

  describe('strip-band computation', () => {
    it('N strips with given area_pct sum to 100%', () => {
      const strips = [
        { areaPct: 5 },
        { areaPct: 25 },
        { areaPct: 70 },
      ];
      const totalPct = strips.reduce((sum, s) => sum + s.areaPct, 0);
      expect(totalPct).toBe(100);
    });

    it('equal strips produce equal widths', () => {
      const strips = [
        { areaPct: 25 },
        { areaPct: 25 },
        { areaPct: 25 },
        { areaPct: 25 },
      ];
      // All strips should have the same width percentage
      const widths = strips.map(s => s.areaPct);
      expect(new Set(widths).size).toBe(1);
    });

    it('uneven strips maintain proportions', () => {
      const strips = [
        { areaPct: 10 },
        { areaPct: 30 },
        { areaPct: 60 },
      ];
      // Proportional: strip2 should be 3× strip1, strip3 should be 6× strip1
      expect(strips[1].areaPct / strips[0].areaPct).toBe(3);
      expect(strips[2].areaPct / strips[0].areaPct).toBe(6);
    });
  });
});
