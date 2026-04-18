/**
 * @file Tier 2 numeric-coercion round-trip tests (OI-0106).
 *
 * Entities that manifest the stringified-numeric bug in specific
 * reports/flows (not dashboard hot path). 9 entities covered.
 */
import { describe, it, expect } from 'vitest';
import * as EventPaddockWindow from '../../src/entities/event-paddock-window.js';
import * as PaddockObservation from '../../src/entities/paddock-observation.js';
import * as SurveyDraftEntry from '../../src/entities/survey-draft-entry.js';
import * as ForageType from '../../src/entities/forage-type.js';
import * as FeedType from '../../src/entities/feed-type.js';
import * as BatchNutritionalProfile from '../../src/entities/batch-nutritional-profile.js';
import * as HarvestEventField from '../../src/entities/harvest-event-field.js';
import * as AnimalBcsScore from '../../src/entities/animal-bcs-score.js';
import * as BatchAdjustment from '../../src/entities/batch-adjustment.js';

const UUID = '00000000-0000-0000-0000-0000000000aa';

function expectNumericKeys(record, keys) {
  for (const k of keys) {
    expect(typeof record[k], `${k} should be coerced to number`).toBe('number');
  }
}

describe('Tier 2 entities — stringified-numeric → Number round-trip (OI-0106)', () => {
  it('event-paddock-window.fromSupabaseShape coerces areaPct', () => {
    const r = EventPaddockWindow.fromSupabaseShape({
      id: UUID, operation_id: UUID, event_id: UUID, location_id: UUID,
      date_opened: '2026-04-01',
      is_strip_graze: true, area_pct: '33.33',
    });
    expect(typeof r.areaPct).toBe('number');
    expect(r.areaPct).toBeCloseTo(33.33, 4);
    // null-safe
    expect(EventPaddockWindow.fromSupabaseShape({ area_pct: null }).areaPct).toBeNull();
  });

  it('paddock-observation.fromSupabaseShape coerces every numeric/integer col', () => {
    const r = PaddockObservation.fromSupabaseShape({
      id: UUID, operation_id: UUID, location_id: UUID,
      observed_at: '2026-04-01T00:00:00Z', type: 'open', source: 'survey',
      forage_height_cm: '18.5',
      forage_cover_pct: '75',
      forage_quality: '4',
      bale_ring_residue_count: '3',
      residual_height_cm: '8',
      recovery_min_days: '21',
      recovery_max_days: '45',
    });
    expectNumericKeys(r, [
      'forageHeightCm', 'forageCoverPct', 'forageQuality',
      'baleRingResidueCount', 'residualHeightCm',
      'recoveryMinDays', 'recoveryMaxDays',
    ]);
    expect(r.forageHeightCm).toBe(18.5);
  });

  it('survey-draft-entry.fromSupabaseShape coerces every numeric/integer col', () => {
    const r = SurveyDraftEntry.fromSupabaseShape({
      id: UUID, operation_id: UUID, survey_id: UUID, location_id: UUID,
      forage_height_cm: '22',
      forage_cover_pct: '80',
      forage_quality: '5',
      bale_ring_residue_count: '2',
      recovery_min_days: '28',
      recovery_max_days: '56',
    });
    expectNumericKeys(r, [
      'forageHeightCm', 'forageCoverPct', 'forageQuality',
      'baleRingResidueCount', 'recoveryMinDays', 'recoveryMaxDays',
    ]);
  });

  it('forage-type.fromSupabaseShape coerces all 7 numeric cols', () => {
    const r = ForageType.fromSupabaseShape({
      id: UUID, operation_id: UUID, name: 'Fescue',
      dm_pct: '85',
      n_per_tonne_dm: '28',
      p_per_tonne_dm: '3.5',
      k_per_tonne_dm: '25',
      dm_kg_per_cm_per_ha: '320',
      min_residual_height_cm: '8',
      utilization_pct: '65',
    });
    expectNumericKeys(r, [
      'dmPct', 'nPerTonneDm', 'pPerTonneDm', 'kPerTonneDm',
      'dmKgPerCmPerHa', 'minResidualHeightCm', 'utilizationPct',
    ]);
  });

  it('feed-type.fromSupabaseShape coerces all 6 numeric/integer cols', () => {
    const r = FeedType.fromSupabaseShape({
      id: UUID, operation_id: UUID, name: 'Alfalfa', category: 'hay', unit: 'bale',
      dm_pct: '88',
      n_pct: '2.8',
      p_pct: '0.3',
      k_pct: '2.4',
      default_weight_kg: '550',
      cutting_number: '2',
    });
    expectNumericKeys(r, ['dmPct', 'nPct', 'pPct', 'kPct', 'defaultWeightKg', 'cuttingNumber']);
  });

  it('batch-nutritional-profile.fromSupabaseShape coerces all 12 lab cols', () => {
    const r = BatchNutritionalProfile.fromSupabaseShape({
      id: UUID, operation_id: UUID, batch_id: UUID,
      tested_at: '2026-03-15', source: 'lab',
      dm_pct: '88.5', protein_pct: '18.2', adf_pct: '32', ndf_pct: '45',
      tdn_pct: '62', rfv: '128',
      n_pct: '2.9', p_pct: '0.28', k_pct: '2.5',
      ca_pct: '1.2', mg_pct: '0.3', s_pct: '0.22',
    });
    expectNumericKeys(r, [
      'dmPct', 'proteinPct', 'adfPct', 'ndfPct', 'tdnPct', 'rfv',
      'nPct', 'pPct', 'kPct', 'caPct', 'mgPct', 'sPct',
    ]);
  });

  it('harvest-event-field.fromSupabaseShape coerces quantity + related; validate passes after coercion', () => {
    const r = HarvestEventField.fromSupabaseShape({
      id: UUID, operation_id: UUID, harvest_event_id: UUID,
      location_id: UUID, feed_type_id: UUID,
      quantity: '42',
      weight_per_unit_kg: '25',
      dm_pct: '85',
      cutting_number: '1',
    });
    expectNumericKeys(r, ['quantity', 'weightPerUnitKg', 'dmPct', 'cuttingNumber']);
    // Strict typeof validate used to reject stringified quantity.
    const v = HarvestEventField.validate(r);
    expect(v.valid).toBe(true);
  });

  it('animal-bcs-score.fromSupabaseShape coerces score', () => {
    const r = AnimalBcsScore.fromSupabaseShape({
      id: UUID, operation_id: UUID, animal_id: UUID,
      scored_at: '2026-04-01T00:00:00Z',
      score: '6.5',
    });
    expect(typeof r.score).toBe('number');
    expect(r.score).toBe(6.5);
  });

  it('batch-adjustment.fromSupabaseShape coerces all 3 qty cols; validate passes', () => {
    const r = BatchAdjustment.fromSupabaseShape({
      id: UUID, batch_id: UUID, operation_id: UUID,
      previous_qty: '10',
      new_qty: '7',
      delta: '-3',
    });
    expectNumericKeys(r, ['previousQty', 'newQty', 'delta']);
    const v = BatchAdjustment.validate(r);
    expect(v.valid).toBe(true);
  });
});
