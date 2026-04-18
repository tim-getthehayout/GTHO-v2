/**
 * @file Observation card unit tests (OI-0112).
 *
 * Covers the three public card variants plus the _shared sub-renderers.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import { renderPreGrazeCard } from '../../src/features/observations/pre-graze-card.js';
import { renderPostGrazeCard } from '../../src/features/observations/post-graze-card.js';
import { renderSurveyCard } from '../../src/features/observations/survey-card.js';
import {
  renderConditionChips, renderRecoveryWindow, renderForageStateRow,
  heightInputToCm, cmToDisplay, CONDITION_VALUES,
} from '../../src/features/observations/_shared.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
// Ensure BRC-1 is registered.
import '../../src/calcs/survey-bale-ring.js';

const OP_ID = '00000000-0000-0000-0000-0000000000aa';

beforeAll(() => setLocale('en', enLocale));

function seedOp(unitSystem = 'imperial') {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations',
    OperationEntity.create({ id: OP_ID, name: 'Test Op', unitSystem }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
}

describe('_shared — forage-state row + helpers', () => {
  beforeEach(() => seedOp('imperial'));

  it('heightInputToCm parses imperial input back to cm', () => {
    expect(heightInputToCm('4', 'imperial')).toBeCloseTo(10.16, 2);
    expect(heightInputToCm('10', 'metric')).toBe(10);
    expect(heightInputToCm('', 'imperial')).toBeNull();
    expect(heightInputToCm('0', 'imperial')).toBeNull();
    expect(heightInputToCm('abc', 'imperial')).toBeNull();
  });

  it('cmToDisplay formats cm → display precision', () => {
    expect(cmToDisplay(10, 'imperial')).toBe('3.9');
    expect(cmToDisplay(10, 'metric')).toBe('10');
    expect(cmToDisplay(null, 'imperial')).toBe('');
  });

  it('renderConditionChips toggles select/deselect on reclick', () => {
    const chips = renderConditionChips(null);
    document.body.appendChild(chips.container);
    const goodBtn = chips.container.querySelector('[data-testid="obs-card-condition-good"]');
    goodBtn.click();
    expect(chips.getValue()).toBe('good');
    goodBtn.click();
    expect(chips.getValue()).toBeNull();
  });

  it('renderConditionChips single-select swaps active state', () => {
    const chips = renderConditionChips(null);
    document.body.appendChild(chips.container);
    const poor = chips.container.querySelector('[data-testid="obs-card-condition-poor"]');
    const good = chips.container.querySelector('[data-testid="obs-card-condition-good"]');
    poor.click();
    expect(chips.getValue()).toBe('poor');
    good.click();
    expect(chips.getValue()).toBe('good');
  });

  it('renderConditionChips seeds active chip from initialValue when valid', () => {
    const chips = renderConditionChips('excellent');
    expect(chips.getValue()).toBe('excellent');
    expect(CONDITION_VALUES).toEqual(['poor', 'fair', 'good', 'excellent']);
  });

  it('renderRecoveryWindow returns typed inputs with seeded values', () => {
    const win = renderRecoveryWindow(21, 60);
    expect(win.minInput.value).toBe('21');
    expect(win.maxInput.value).toBe('60');
  });

  it('BRC-1 auto-fill populates cover input when farm-settings diameter + paddockAcres provided', () => {
    // farmSettings.baleRingResidueDiameterCm = 365.76 cm (= 12 ft).
    // 14 rings × 12 ft diameter × 0.25 acres → computedForageCoverPct = 85.
    const row = renderForageStateRow({
      farmSettings: { baleRingResidueDiameterCm: 365.76 },
      paddockAcres: 0.25,
      initialValues: {},
      unitSys: 'imperial',
    });
    document.body.appendChild(row.container);
    row.baleRingInput.value = '14';
    row.baleRingInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(row.coverInput.value).toBe('85');
    expect(row.brcAvailable).toBe(true);
  });

  it('BRC helper inactive when diameter missing', () => {
    const row = renderForageStateRow({
      farmSettings: { baleRingResidueDiameterCm: null },
      paddockAcres: 0.25,
      initialValues: {},
      unitSys: 'imperial',
    });
    document.body.appendChild(row.container);
    row.baleRingInput.value = '14';
    row.baleRingInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(row.coverInput.value).toBe('');
    expect(row.brcAvailable).toBe(false);
  });
});

describe('renderPreGrazeCard (variant A)', () => {
  beforeEach(() => seedOp('imperial'));

  it('returns the { container, getValues, validate } contract', () => {
    const card = renderPreGrazeCard({ farmSettings: null });
    expect(card.container).toBeInstanceOf(HTMLElement);
    expect(typeof card.getValues).toBe('function');
    expect(typeof card.validate).toBe('function');
  });

  it('renders the full pre-graze field set (header + top row + slider + chips + notes)', () => {
    const card = renderPreGrazeCard({ farmSettings: null });
    document.body.appendChild(card.container);
    expect(card.container.querySelector('[data-testid="obs-card-forage-height"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-forage-cover"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-bale-ring"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-forage-quality"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-condition-good"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-notes"]')).toBeTruthy();
  });

  it('getValues returns nulls for empty inputs (no silent zeros)', () => {
    const card = renderPreGrazeCard({ farmSettings: null });
    const v = card.getValues();
    expect(v.forageHeightCm).toBeNull();
    expect(v.forageCoverPct).toBeNull();
    expect(v.forageCondition).toBeNull();
    expect(v.baleRingResidueCount).toBeNull();
    expect(v.notes).toBeNull();
    // Quality slider defaults to 50.
    expect(v.forageQuality).toBe(50);
  });

  it('imperial height input round-trips to metric cm on getValues', () => {
    const card = renderPreGrazeCard({ farmSettings: null });
    document.body.appendChild(card.container);
    const heightInput = card.container.querySelector('[data-testid="obs-card-forage-height"]');
    heightInput.value = '4'; // 4 in → 10.16 cm
    expect(card.getValues().forageHeightCm).toBeCloseTo(10.16, 2);
  });

  it('validate() is optional when farmSettings.recoveryRequired is false/missing', () => {
    const card = renderPreGrazeCard({ farmSettings: { recoveryRequired: false } });
    expect(card.validate()).toEqual({ valid: true, errors: [] });
  });

  it('validate() blocks save when required and height+cover empty', () => {
    const card = renderPreGrazeCard({ farmSettings: { recoveryRequired: true } });
    const r = card.validate();
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBe(2);
  });

  it('Required pill appears when farmSettings.recoveryRequired', () => {
    const card = renderPreGrazeCard({ farmSettings: { recoveryRequired: true } });
    document.body.appendChild(card.container);
    const badge = card.container.querySelector('[data-testid="obs-card-badge"]');
    expect(badge.textContent).toBe('Required');
  });

  it('Optional pill appears otherwise', () => {
    const card = renderPreGrazeCard({ farmSettings: null });
    const badge = card.container.querySelector('[data-testid="obs-card-badge"]');
    expect(badge.textContent).toBe('Optional');
  });

  it('initialValues hydrates all fields (imperial converts height cm → inches on display)', () => {
    const card = renderPreGrazeCard({
      farmSettings: null,
      initialValues: {
        forageHeightCm: 10,
        forageCoverPct: 75,
        forageQuality: 80,
        forageCondition: 'good',
        baleRingResidueCount: 3,
        notes: 'hydration check',
      },
    });
    document.body.appendChild(card.container);
    expect(card.container.querySelector('[data-testid="obs-card-forage-height"]').value).toBe('3.9');
    expect(card.container.querySelector('[data-testid="obs-card-forage-cover"]').value).toBe('75');
    expect(card.container.querySelector('[data-testid="obs-card-forage-quality"]').value).toBe('80');
    expect(card.container.querySelector('[data-testid="obs-card-bale-ring"]').value).toBe('3');
    expect(card.container.querySelector('[data-testid="obs-card-notes"]').value).toBe('hydration check');
  });
});

describe('renderPostGrazeCard (variant B)', () => {
  beforeEach(() => seedOp('imperial'));

  it('renders residual + recovery + notes; no quality/condition/bale-ring', () => {
    const card = renderPostGrazeCard({ farmSettings: null });
    document.body.appendChild(card.container);
    expect(card.container.querySelector('[data-testid="obs-card-residual-height"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-recovery-min"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-recovery-max"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-notes"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-forage-quality"]')).toBeFalsy();
    expect(card.container.querySelector('[data-testid="obs-card-condition-good"]')).toBeFalsy();
    expect(card.container.querySelector('[data-testid="obs-card-bale-ring"]')).toBeFalsy();
  });

  it('getValues returns residualHeightCm + recovery days + notes', () => {
    const card = renderPostGrazeCard({ farmSettings: null });
    document.body.appendChild(card.container);
    card.container.querySelector('[data-testid="obs-card-residual-height"]').value = '4';
    card.container.querySelector('[data-testid="obs-card-recovery-min"]').value = '21';
    card.container.querySelector('[data-testid="obs-card-recovery-max"]').value = '45';
    card.container.querySelector('[data-testid="obs-card-notes"]').value = 'post-graze';
    const v = card.getValues();
    expect(v.residualHeightCm).toBeCloseTo(10.16, 2);
    expect(v.recoveryMinDays).toBe(21);
    expect(v.recoveryMaxDays).toBe(45);
    expect(v.notes).toBe('post-graze');
  });

  it('seeds residual + recovery from farmSettings defaults when initialValues missing', () => {
    const card = renderPostGrazeCard({
      farmSettings: {
        defaultResidualHeightCm: 10,
        defaultRecoveryMinDays: 21,
        defaultRecoveryMaxDays: 60,
      },
    });
    document.body.appendChild(card.container);
    // Imperial: 10 cm ≈ 3.9 in.
    expect(card.container.querySelector('[data-testid="obs-card-residual-height"]').value).toBe('3.9');
    expect(card.container.querySelector('[data-testid="obs-card-recovery-min"]').value).toBe('21');
    expect(card.container.querySelector('[data-testid="obs-card-recovery-max"]').value).toBe('60');
  });

  it('validate() is always optional (post-graze never required)', () => {
    const card = renderPostGrazeCard({ farmSettings: { recoveryRequired: true } });
    expect(card.validate()).toEqual({ valid: true, errors: [] });
  });

  it('accepts legacy postGrazeHeightCm initialValue alias', () => {
    const card = renderPostGrazeCard({
      farmSettings: null,
      initialValues: { postGrazeHeightCm: 10 },
    });
    document.body.appendChild(card.container);
    expect(card.container.querySelector('[data-testid="obs-card-residual-height"]').value).toBe('3.9');
  });
});

describe('renderSurveyCard (variant C)', () => {
  beforeEach(() => seedOp('imperial'));

  it('renders pre-graze fields + recovery window + notes', () => {
    const card = renderSurveyCard({ farmSettings: null });
    document.body.appendChild(card.container);
    expect(card.container.querySelector('[data-testid="obs-card-forage-height"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-forage-cover"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-bale-ring"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-forage-quality"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-recovery-min"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-recovery-max"]')).toBeTruthy();
    expect(card.container.querySelector('[data-testid="obs-card-notes"]')).toBeTruthy();
  });

  it('getValues returns pre-graze shape + recovery days', () => {
    const card = renderSurveyCard({ farmSettings: null });
    document.body.appendChild(card.container);
    card.container.querySelector('[data-testid="obs-card-forage-height"]').value = '4';
    card.container.querySelector('[data-testid="obs-card-forage-cover"]').value = '80';
    card.container.querySelector('[data-testid="obs-card-bale-ring"]').value = '3';
    card.container.querySelector('[data-testid="obs-card-recovery-min"]').value = '28';
    card.container.querySelector('[data-testid="obs-card-recovery-max"]').value = '56';
    card.container.querySelector('[data-testid="obs-card-notes"]').value = 'readiness check';
    card.container.querySelector('[data-testid="obs-card-condition-good"]').click();
    const v = card.getValues();
    expect(v.forageHeightCm).toBeCloseTo(10.16, 2);
    expect(v.forageCoverPct).toBe(80);
    expect(v.forageCondition).toBe('good');
    expect(v.baleRingResidueCount).toBe(3);
    expect(v.recoveryMinDays).toBe(28);
    expect(v.recoveryMaxDays).toBe(56);
    expect(v.notes).toBe('readiness check');
  });

  it('required validation same as pre-graze', () => {
    const card = renderSurveyCard({ farmSettings: { recoveryRequired: true } });
    const r = card.validate();
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBe(2);
  });

  it('has surveyObs header label', () => {
    const card = renderSurveyCard({ farmSettings: null });
    document.body.appendChild(card.container);
    const header = card.container.querySelector('.close-open-section-title');
    expect(header.textContent).toBe('Survey Observations');
  });
});
