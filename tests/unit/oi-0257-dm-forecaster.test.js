/** @file OI-0257 — Ag1 active-groups picker + St1 no CAP-1 fake-tan stub (Fx1 parked). */
import { describe, it, expect } from 'vitest';
import {
  listActiveForecasterGroups,
  shouldPaintCap1ForecastStub,
  CAP1_FORECAST_STUB,
} from '../../src/features/events/rotation-calendar/forecaster-helpers.js';
import { renderForecastFutureBlock } from '../../src/features/events/rotation-calendar/future-block.js';

describe('OI-0257 DM forecaster narrow (Ag1+St1)', () => {
  describe('listActiveForecasterGroups — Ag1', () => {
    const groups = [
      { id: 'a', name: 'Herd A', archivedAt: null },
      { id: 'b', name: 'Herd B' },
      { id: 'c', name: 'Old herd', archivedAt: '2026-10-01T00:00:00Z' },
      { id: 'd', name: 'Herd D', archivedAt: undefined },
    ];

    it('returns only non-archived groups', () => {
      const active = listActiveForecasterGroups(groups);
      expect(active.map(g => g.id)).toEqual(['a', 'b', 'd']);
    });

    it('excludes already-selected active groups from the picker list', () => {
      const available = listActiveForecasterGroups(groups, ['a', 'c']);
      expect(available.map(g => g.id)).toEqual(['b', 'd']);
    });

    it('never offers archived groups even when not selected', () => {
      const available = listActiveForecasterGroups(groups, []);
      expect(available.some(g => g.id === 'c')).toBe(false);
      expect(available.every(g => !g.archivedAt)).toBe(true);
    });

    it('handles empty / null inputs', () => {
      expect(listActiveForecasterGroups()).toEqual([]);
      expect(listActiveForecasterGroups(null, null)).toEqual([]);
    });
  });

  describe('shouldPaintCap1ForecastStub — St1', () => {
    it('is always false so selecting period+groups does not paint the CAP-1 stub', () => {
      expect(shouldPaintCap1ForecastStub()).toBe(false);
      expect(shouldPaintCap1ForecastStub({
        viewMode: 'forecast',
        selectedGroups: [{ id: 'a' }],
        period: 3,
      })).toBe(false);
    });

    it('documents the stub values that used to fake tan "0 lb hay"', () => {
      expect(CAP1_FORECAST_STUB).toEqual({
        coverageFraction: 0,
        coversHours: 0,
        shortfallKg: 0,
        surplusHours: 0,
      });
    });

    it('CAP-1 stub values would paint a full tan "0 lb hay" segment (why St1 blocks it)', () => {
      const node = renderForecastFutureBlock({
        leftPx: 0,
        widthPx: 100,
        ...CAP1_FORECAST_STUB,
        isNeverGrazed: false,
        isGrazingInProgress: false,
        locationId: 'loc-1',
        onClickBlock: () => {},
      });
      expect(node.dataset.testid).toBe('future-block-forecast');
      const tan = node.querySelector('.future-block__segment--tan');
      expect(tan).toBeTruthy();
      expect(tan.textContent).toContain('0 lb hay');
      // No green segment when coverageFraction is 0
      expect(node.querySelector('.future-block__segment--green')).toBeNull();
    });
  });
});
