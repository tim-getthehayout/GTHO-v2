/**
 * @file mergeRemote integration — stringified-numeric round-trip (OI-0106).
 *
 * This is the path Tim got burned by in the field:
 *   1. Supabase returns a numeric column as a string via PostgREST
 *   2. sync-adapter's pullAll hands the row to pull-remote
 *   3. pull-remote maps through the entity's fromSupabaseShape
 *   4. mergeRemote stores the record
 *   5. feature code reads via getAll and does math — quantity is "42.5" (str)
 *
 * Pre-hotfix, batch.fromSupabaseShape didn't coerce, so step 5 concatenated
 * "42.5" + 10 = "42.510" (silent corruption) or crashed on .toFixed().
 * This test asserts the full pipeline lands numbers in state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { init, getAll, setSyncAdapter, _reset } from '../../src/data/store.js';
import { pullAllRemote } from '../../src/data/pull-remote.js';

function stubAdapter(byTable) {
  return {
    isOnline: async () => true,
    pullAll: async (table) => byTable[table] ?? [],
    push: async () => ({ success: true }),
  };
}

describe('mergeRemote + pullAllRemote — stringified numerics coerce (OI-0106)', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
    init();
  });

  it('batch row with stringified numerics lands as numbers in state', async () => {
    const remoteRow = {
      id: '00000000-0000-0000-0000-000000000b01',
      operation_id: '00000000-0000-0000-0000-0000000000aa',
      feed_type_id: '00000000-0000-0000-0000-0000000000bb',
      name: 'Hay — North Field',
      batch_number: 'H-2026-01',
      source: 'harvest',
      // PostgREST returns numeric/decimal columns as strings.
      quantity: '42.5',
      remaining: '30',
      unit: 'bale',
      weight_per_unit_kg: '20.25',
      dm_pct: '85',
      cost_per_unit: '12.5',
      purchase_date: '2026-03-15',
      notes: null,
      archived: false,
      created_at: '2026-04-18T12:00:00Z',
      updated_at: '2026-04-18T12:00:00Z',
    };

    setSyncAdapter(stubAdapter({ batches: [remoteRow] }));

    const result = await pullAllRemote();
    expect(result.errors).toBe(0);
    expect(result.pulled).toBeGreaterThanOrEqual(1);

    const batches = getAll('batches');
    expect(batches).toHaveLength(1);

    const b = batches[0];
    expect(typeof b.quantity).toBe('number');
    expect(b.quantity).toBe(42.5);
    expect(typeof b.remaining).toBe('number');
    expect(b.remaining).toBe(30);
    expect(typeof b.weightPerUnitKg).toBe('number');
    expect(typeof b.dmPct).toBe('number');
    expect(typeof b.costPerUnit).toBe('number');
  });

  it('downstream math (sum, toFixed, divide) does not corrupt or crash', async () => {
    const mkRow = (id, qty) => ({
      id,
      operation_id: '00000000-0000-0000-0000-0000000000aa',
      feed_type_id: '00000000-0000-0000-0000-0000000000bb',
      name: `Batch ${id}`,
      source: 'purchase',
      quantity: qty,
      remaining: qty,
      unit: 'bale',
      weight_per_unit_kg: '20',
      dm_pct: '85',
      cost_per_unit: '10',
      archived: false,
      created_at: '2026-04-18T12:00:00Z',
      updated_at: '2026-04-18T12:00:00Z',
    });

    setSyncAdapter(stubAdapter({
      batches: [
        mkRow('00000000-0000-0000-0000-000000000101', '10'),
        mkRow('00000000-0000-0000-0000-000000000102', '20'),
        mkRow('00000000-0000-0000-0000-000000000103', '30'),
      ],
    }));

    await pullAllRemote();
    const batches = getAll('batches');

    // Pre-hotfix, this produced "0102030" via string concat.
    let total = 0;
    for (const b of batches) total += b.quantity;
    expect(total).toBe(60);
    expect(typeof total).toBe('number');

    // Pre-hotfix, .toFixed on a string threw TypeError.
    expect(() => batches[0].quantity.toFixed(2)).not.toThrow();
    expect(batches[0].quantity.toFixed(2)).toBe('10.00');

    // Pre-hotfix, division-by-string NaN'd the result.
    const audPerBatch = 100 / batches[0].quantity;
    expect(Number.isFinite(audPerBatch)).toBe(true);
    expect(audPerBatch).toBe(10);
  });

  it('null numeric → null (not NaN) survives mergeRemote', async () => {
    setSyncAdapter(stubAdapter({
      batches: [{
        id: '00000000-0000-0000-0000-000000000201',
        operation_id: '00000000-0000-0000-0000-0000000000aa',
        feed_type_id: '00000000-0000-0000-0000-0000000000bb',
        name: 'No weight recorded',
        source: 'purchase',
        quantity: '5',
        remaining: '5',
        unit: 'bale',
        weight_per_unit_kg: null,
        dm_pct: null,
        cost_per_unit: null,
        archived: false,
        created_at: '2026-04-18T12:00:00Z',
        updated_at: '2026-04-18T12:00:00Z',
      }],
    }));

    await pullAllRemote();
    const [b] = getAll('batches');
    expect(b.weightPerUnitKg).toBeNull();
    expect(b.dmPct).toBeNull();
    expect(b.costPerUnit).toBeNull();
    expect(Number.isNaN(b.weightPerUnitKg)).toBe(false);
  });
});
