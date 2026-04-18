/**
 * @file Tier 3 numeric-coercion round-trip tests (OI-0106).
 *
 * Less likely to crash than T1/T2 but still silent corruption vectors for
 * reports and nutrient math. 10 entities covered.
 */
import { describe, it, expect } from 'vitest';
import * as SoilTest from '../../src/entities/soil-test.js';
import * as ManureBatch from '../../src/entities/manure-batch.js';
import * as ManureBatchTransaction from '../../src/entities/manure-batch-transaction.js';
import * as InputProduct from '../../src/entities/input-product.js';
import * as Amendment from '../../src/entities/amendment.js';
import * as AmendmentLocation from '../../src/entities/amendment-location.js';
import * as NpkPriceHistory from '../../src/entities/npk-price-history.js';
import * as Spreader from '../../src/entities/spreader.js';
import * as AnimalTreatment from '../../src/entities/animal-treatment.js';
import * as Farm from '../../src/entities/farm.js';

const UUID = '00000000-0000-0000-0000-0000000000aa';

function expectNumericKeys(record, keys) {
  for (const k of keys) {
    expect(typeof record[k], `${k} should be coerced to number`).toBe('number');
  }
}

describe('Tier 3 entities — stringified-numeric → Number round-trip (OI-0106)', () => {
  it('soil-test.fromSupabaseShape coerces 18 numeric/chemistry cols', () => {
    const row = { id: UUID, operation_id: UUID, location_id: UUID,
      tested_at: '2026-03-01T00:00:00Z', unit: 'ppm',
      n: '20', p: '30', k: '180', s: '12', ca: '1500', mg: '250',
      cu: '1.5', fe: '80', mn: '40', mo: '0.1', zn: '3', b: '0.5', cl: '25',
      ph: '6.3', buffer_ph: '6.5', cec: '14.2', base_saturation: '82',
      organic_matter: '3.8',
    };
    const r = SoilTest.fromSupabaseShape(row);
    expectNumericKeys(r, [
      'n', 'p', 'k', 's', 'ca', 'mg', 'cu', 'fe', 'mn', 'mo', 'zn', 'b', 'cl',
      'ph', 'bufferPh', 'cec', 'baseSaturation', 'organicMatter',
    ]);
    // nullable passthrough
    const r2 = SoilTest.fromSupabaseShape({ ...row, ph: null });
    expect(r2.ph).toBeNull();
  });

  it('manure-batch.fromSupabaseShape coerces volume + 14 nutrient cols', () => {
    const r = ManureBatch.fromSupabaseShape({
      id: UUID, operation_id: UUID, label: 'Winter compost',
      estimated_volume_kg: '12000',
      n_kg: '240', p_kg: '40', k_kg: '180', s_kg: '12',
      ca_kg: '60', mg_kg: '20', cu_kg: '0.2', fe_kg: '4',
      mn_kg: '1.5', mo_kg: '0.02', zn_kg: '0.8', b_kg: '0.1', cl_kg: '2',
    });
    expectNumericKeys(r, [
      'estimatedVolumeKg',
      'nKg', 'pKg', 'kKg', 'sKg', 'caKg', 'mgKg', 'cuKg',
      'feKg', 'mnKg', 'moKg', 'znKg', 'bKg', 'clKg',
    ]);
  });

  it('manure-batch-transaction.fromSupabaseShape coerces volumeKg', () => {
    const r = ManureBatchTransaction.fromSupabaseShape({
      id: UUID, operation_id: UUID, batch_id: UUID,
      type: 'capture', transaction_date: '2026-03-01',
      volume_kg: '1500',
    });
    expect(typeof r.volumeKg).toBe('number');
    expect(r.volumeKg).toBe(1500);
  });

  it('input-product.fromSupabaseShape coerces all 13 pct + costPerUnit', () => {
    const r = InputProduct.fromSupabaseShape({
      id: UUID, operation_id: UUID, name: '10-10-10', category_id: UUID,
      n_pct: '10', p_pct: '10', k_pct: '10', s_pct: '2',
      ca_pct: '0.5', mg_pct: '0.3', cu_pct: '0.01', fe_pct: '0.5',
      mn_pct: '0.05', mo_pct: '0.01', zn_pct: '0.1', b_pct: '0.05', cl_pct: '1',
      cost_per_unit: '450',
    });
    expectNumericKeys(r, [
      'nPct', 'pPct', 'kPct', 'sPct', 'caPct', 'mgPct', 'cuPct',
      'fePct', 'mnPct', 'moPct', 'znPct', 'bPct', 'clPct',
      'costPerUnit',
    ]);
  });

  it('amendment.fromSupabaseShape coerces totalQty + costOverride', () => {
    const r = Amendment.fromSupabaseShape({
      id: UUID, operation_id: UUID,
      applied_at: '2026-03-01T00:00:00Z', source_type: 'input_product',
      total_qty: '500',
      cost_override: '800',
    });
    expect(typeof r.totalQty).toBe('number');
    expect(typeof r.costOverride).toBe('number');
  });

  it('amendment-location.fromSupabaseShape coerces qty + 12 nutrient kg + areaHa', () => {
    const r = AmendmentLocation.fromSupabaseShape({
      id: UUID, operation_id: UUID, amendment_id: UUID, location_id: UUID,
      qty: '100', area_ha: '16.2',
      n_kg: '10', p_kg: '5', k_kg: '8', s_kg: '1',
      ca_kg: '4', mg_kg: '2', cu_kg: '0.05', fe_kg: '1',
      mn_kg: '0.2', mo_kg: '0.01', zn_kg: '0.3', b_kg: '0.05', cl_kg: '0.8',
    });
    expectNumericKeys(r, [
      'qty', 'areaHa',
      'nKg', 'pKg', 'kKg', 'sKg', 'caKg', 'mgKg', 'cuKg',
      'feKg', 'mnKg', 'moKg', 'znKg', 'bKg', 'clKg',
    ]);
  });

  it('npk-price-history.fromSupabaseShape coerces all 3 price cols; validate passes', () => {
    const r = NpkPriceHistory.fromSupabaseShape({
      id: UUID, farm_id: UUID, operation_id: UUID,
      effective_date: '2026-04-01',
      n_price_per_kg: '1.21',
      p_price_per_kg: '1.43',
      k_price_per_kg: '0.93',
    });
    expectNumericKeys(r, ['nPricePerKg', 'pPricePerKg', 'kPricePerKg']);
    const v = NpkPriceHistory.validate(r);
    expect(v.valid).toBe(true);
  });

  it('spreader.fromSupabaseShape coerces capacityKg', () => {
    const r = Spreader.fromSupabaseShape({
      id: UUID, operation_id: UUID, name: 'Spreader A',
      capacity_kg: '4500',
    });
    expect(typeof r.capacityKg).toBe('number');
    expect(r.capacityKg).toBe(4500);
  });

  it('animal-treatment.fromSupabaseShape coerces doseAmount', () => {
    const r = AnimalTreatment.fromSupabaseShape({
      id: UUID, operation_id: UUID, animal_id: UUID,
      treated_at: '2026-04-01T00:00:00Z',
      dose_amount: '5.5',
    });
    expect(typeof r.doseAmount).toBe('number');
    expect(r.doseAmount).toBe(5.5);
  });

  it('farm.fromSupabaseShape coerces latitude, longitude, areaHectares', () => {
    const r = Farm.fromSupabaseShape({
      id: UUID, operation_id: UUID, name: 'Home Farm',
      latitude: '40.4406',
      longitude: '-79.9959',
      area_hectares: '80.5',
    });
    expectNumericKeys(r, ['latitude', 'longitude', 'areaHectares']);
    expect(r.latitude).toBeCloseTo(40.4406, 4);
  });
});
