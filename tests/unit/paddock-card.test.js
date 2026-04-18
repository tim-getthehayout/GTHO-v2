/** @file Tests for the shared paddock observation card (OI-0100). */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import { renderPaddockCard } from '../../src/features/observations/paddock-card.js';
import * as OperationEntity from '../../src/entities/operation.js';
// BRC-1 calc registration side-effect.
import '../../src/calcs/survey-bale-ring.js';

const OP_ID = '00000000-0000-0000-0000-0000000000aa';

function seedMetricOp() {
  add('operations', OperationEntity.create({ id: OP_ID, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
}

describe('renderPaddockCard (OI-0100)', () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    seedMetricOp();
  });

  it('returns { container, getValues, validate, saveTo } contract matching renderPreGrazeFields', () => {
    const card = renderPaddockCard();
    expect(card.container).toBeInstanceOf(HTMLElement);
    expect(typeof card.getValues).toBe('function');
    expect(typeof card.validate).toBe('function');
    expect(card.saveTo).toBe('event_observations');
  });

  it('getValues() returns the full observation shape', () => {
    const card = renderPaddockCard({ farmSettings: null });
    document.body.appendChild(card.container);

    const height = card.container.querySelector('[data-testid="paddock-card-forage-height"]');
    const cover = card.container.querySelector('[data-testid="paddock-card-forage-cover"]');
    const quality = card.container.querySelector('[data-testid="paddock-card-forage-quality"]');
    const condition = card.container.querySelector('[data-testid="paddock-card-forage-condition"]');
    const baleRing = card.container.querySelector('[data-testid="paddock-card-bale-ring"]');
    const rmin = card.container.querySelector('[data-testid="paddock-card-recovery-min"]');
    const rmax = card.container.querySelector('[data-testid="paddock-card-recovery-max"]');
    const notes = card.container.querySelector('[data-testid="paddock-card-notes"]');

    height.value = '12';          // metric — 12 cm
    cover.value = '85';
    quality.value = '70';
    condition.value = 'good';
    baleRing.value = '4';
    rmin.value = '21';
    rmax.value = '28';
    notes.value = 'Looks great';

    const v = card.getValues();
    expect(v).toEqual({
      forageHeightCm: 12,
      forageCoverPct: 85,
      forageQuality: 70,
      forageCondition: 'good',
      baleRingResidueCount: 4,
      recoveryMinDays: 21,
      recoveryMaxDays: 28,
      notes: 'Looks great',
    });
  });

  it('returns nulls for empty inputs (no silent zeros)', () => {
    const card = renderPaddockCard();
    document.body.appendChild(card.container);
    // quality defaults to 50 (slider midpoint), others are empty.
    const v = card.getValues();
    expect(v.forageHeightCm).toBeNull();
    expect(v.forageCoverPct).toBeNull();
    expect(v.forageCondition).toBeNull();
    expect(v.baleRingResidueCount).toBeNull();
    expect(v.recoveryMinDays).toBeNull();
    expect(v.recoveryMaxDays).toBeNull();
    expect(v.notes).toBeNull();
  });

  it('bale-ring helper auto-fills coverInput when farmSettings.baleRingResidueDiameterFt + paddockAcres supplied', () => {
    const farmSettings = { baleRingResidueDiameterFt: 12 };
    const card = renderPaddockCard({ farmSettings, paddockAcres: 0.25 });
    document.body.appendChild(card.container);

    const baleRing = card.container.querySelector('[data-testid="paddock-card-bale-ring"]');
    const cover = card.container.querySelector('[data-testid="paddock-card-forage-cover"]');

    baleRing.value = '14';
    baleRing.dispatchEvent(new Event('input', { bubbles: true }));

    // BRC-1 example: 14 rings × 12 ft diameter × 0.25 acres → computedForageCoverPct = 85.
    expect(cover.value).toBe('85');
  });

  it('bale-ring helper is inactive when diameter missing', () => {
    const card = renderPaddockCard({ farmSettings: { baleRingResidueDiameterFt: null }, paddockAcres: 0.25 });
    document.body.appendChild(card.container);
    const baleRing = card.container.querySelector('[data-testid="paddock-card-bale-ring"]');
    const cover = card.container.querySelector('[data-testid="paddock-card-forage-cover"]');
    baleRing.value = '14';
    baleRing.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cover.value).toBe('');
  });

  it('validate() is a no-op when farmSettings.recoveryRequired is false/missing', () => {
    const card = renderPaddockCard({ farmSettings: { recoveryRequired: false } });
    expect(card.validate()).toEqual({ valid: true, errors: [] });
  });

  it('validate() requires forageHeight + forageCoverPct when recoveryRequired', () => {
    const card = renderPaddockCard({ farmSettings: { recoveryRequired: true } });
    const result = card.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it('initialValues pre-populate the inputs (height converted into display units)', () => {
    const card = renderPaddockCard({
      farmSettings: null,
      initialValues: {
        forageHeightCm: 15,
        forageCoverPct: 80,
        forageQuality: 60,
        forageCondition: 'fair',
        baleRingResidueCount: 3,
        recoveryMinDays: 14,
        recoveryMaxDays: 28,
        notes: 'pre-fill',
      },
    });
    const height = card.container.querySelector('[data-testid="paddock-card-forage-height"]');
    const cover = card.container.querySelector('[data-testid="paddock-card-forage-cover"]');
    const quality = card.container.querySelector('[data-testid="paddock-card-forage-quality"]');
    const condition = card.container.querySelector('[data-testid="paddock-card-forage-condition"]');
    const baleRing = card.container.querySelector('[data-testid="paddock-card-bale-ring"]');
    const rmin = card.container.querySelector('[data-testid="paddock-card-recovery-min"]');
    const rmax = card.container.querySelector('[data-testid="paddock-card-recovery-max"]');
    const notes = card.container.querySelector('[data-testid="paddock-card-notes"]');

    // Metric op from seed → height stays 15.
    expect(height.value).toBe('15');
    expect(cover.value).toBe('80');
    expect(quality.value).toBe('60');
    expect(condition.value).toBe('fair');
    expect(baleRing.value).toBe('3');
    expect(rmin.value).toBe('14');
    expect(rmax.value).toBe('28');
    expect(notes.value).toBe('pre-fill');
  });
});
