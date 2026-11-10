import { describe, it, expect } from 'vitest';
import {
  parseQuantityBasis, parseCarryoverTiming, allocateFeedingLines,
  applyPendingClarification, reconcileAllocatedLines, QUANTITY_BASIS_TOTAL, QUANTITY_BASIS_PER_PADDOCK,
} from '../../../src/features/assistant/feeding-clarification.js';

const L1 = 'loc-1';
const L2 = 'loc-2';
const lines = [{ batchId: 'b1', qty: 4 }];

describe('quantity basis and allocation', () => {
  it('parses total vs per-paddock and ignores unrecognized text', () => {
    expect(parseQuantityBasis('total')).toBe(QUANTITY_BASIS_TOTAL);
    expect(parseQuantityBasis('4 bales total across both')).toBe(QUANTITY_BASIS_TOTAL);
    expect(parseQuantityBasis('per paddock')).toBe(QUANTITY_BASIS_PER_PADDOCK);
    expect(parseQuantityBasis('e1')).toBeNull();
  });

  it('does not even-split a total of 4 across two paddocks', () => {
    const result = allocateFeedingLines(lines, [L1, L2], 'total');
    expect(result.status).toBe('question');
    expect(result.field).toBe('lineAllocations');
    expect(result.question).toMatch(/allocated/i);
  });

  it('copies the stated quantity to each paddock when the basis is per-paddock', () => {
    const result = allocateFeedingLines(lines, [L1, L2], 'per-paddock');
    expect(result.status).toBe('allocated');
    expect(result.allocations).toEqual([
      { locationId: L1, lines: [expect.objectContaining({ batchId: 'b1', qty: 4 })] },
      { locationId: L2, lines: [expect.objectContaining({ batchId: 'b1', qty: 4 })] },
    ]);
  });

  it('uses an explicit per-target total allocation and never double-counts', () => {
    const result = allocateFeedingLines([{
      batchId: 'b1', qty: 4,
      allocations: [{ locationId: L1, qty: 3 }, { locationId: L2, qty: 1 }],
    }], [L1, L2], 'total');
    expect(result).toMatchObject({
      status: 'allocated',
      allocations: [
        { locationId: L1, lines: [expect.objectContaining({ qty: 3 })] },
        { locationId: L2, lines: [expect.objectContaining({ qty: 1 })] },
      ],
    });
  });
});

describe('clarification continuity', () => {
  it('replaces an unresolved colliding paddock name with a short disambiguating answer', () => {
    const next = applyPendingClarification(
      { field: 'paddock', ui: 'feeding', names: { paddock: 'e1' }, fields: { date: '2026-11-09', time: '13:00', lines } },
      {},
      {},
      'Corral',
    );
    expect(next.names.paddock).toBe('Corral');
    expect(next.fields).toMatchObject({ date: '2026-11-09', time: '13:00', lines });
  });

  it('applies a short paddock reply when the pending names had no paddock yet', () => {
    const next = applyPendingClarification(
      { field: 'paddock', fields: { date: '2026-11-09', time: '13:00', lines } },
      {},
      {},
      'e1',
    );
    expect(next.names.paddock).toBe('e1');
    expect(next.fields.date).toBe('2026-11-09');
  });

  it('applies a short total/per-paddock reply to the pending quantity field', () => {
    const next = applyPendingClarification(
      { field: 'quantityBasis', names: { paddock: 'e1, e2' }, fields: { date: '2026-11-09', lines }, fill: { locationIds: [L1, L2] } },
      {},
      {},
      'total',
    );
    expect(next.fields.quantityBasis).toBe('total');
    expect(next.fields.date).toBe('2026-11-09');
    expect(next.fields.locationIds).toEqual([L1, L2]);
  });

  it('parses carryover timing and leaves unclear answers unresolved', () => {
    expect(parseCarryoverTiming('before the new delivery')).toBe('before');
    expect(parseCarryoverTiming('at the same time')).toBe('same-instant');
    expect(parseCarryoverTiming('not sure')).toBeNull();
  });
});

describe('reconcileAllocatedLines and duplicate allocations', () => {
  it('drops an unknown target and uses the visible line on a single resolved paddock', () => {
    const shown = [{ batchId: 'b1', qty: 4 }];
    const result = reconcileAllocatedLines([
      { locationId: 'ghost', lines: [{ batchId: 'b1', qty: 99 }] },
      { locationId: L1, lines: [{ batchId: 'b1', qty: 99 }] },
    ], { lines: shown, locationIds: [L1] });
    expect(result.status).toBe('allocated');
    expect(result.allocations).toEqual([{ locationId: L1, lines: [expect.objectContaining({ batchId: 'b1', qty: 4 })] }]);
  });

  it('rejects duplicate allocation locations instead of crashing', () => {
    const lines = [{ batchId: 'b1', qty: 4, allocations: [{ locationId: L1, qty: 2 }, { locationId: L1, qty: 2 }] }];
    const result = allocateFeedingLines(lines, [L1, L2], 'total');
    expect(result.status).toBe('question');
    expect(reconcileAllocatedLines(
      [{ locationId: L1, lines: [{ batchId: 'b1', qty: 2 }] }, { locationId: L1, lines: [{ batchId: 'b1', qty: 2 }] }],
      { lines: [{ batchId: 'b1', qty: 4 }], locationIds: [L1, L2] },
    ).status).toBe('rejected');
  });
});
