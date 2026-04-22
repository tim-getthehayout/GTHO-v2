/**
 * @file OI-0131 — Pasture Survey bulk-draft autosave wired via event
 * delegation on the stable paddockList container.
 *
 * After OI-0126 delegated each paddock's form to `renderSurveyCard`, the
 * per-input onChange wiring was dropped and `triggerDraftSave()` had zero
 * call-sites — typed values only persisted on manual Save Draft or sheet
 * close. The fix attaches `input` + guarded `click` listeners to
 * `paddockList`. `input` bubbles from every native field inside the card;
 * a `.obs-condition-chip` closest-match picks up chip clicks (chips fire
 * onClick only). Header expand/collapse clicks are rejected by the guard.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import '../../src/calcs/survey-bale-ring.js';
import { openSurveySheet } from '../../src/features/locations/index.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC_A = '00000000-0000-0000-0000-0000000000c1';
const LOC_B = '00000000-0000-0000-0000-0000000000c2';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  vi.useFakeTimers();
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({
    farmId: FARM, operationId: OP,
    baleRingResidueDiameterCm: 365.76,
  }), FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC_A, operationId: OP, farmId: FARM, name: 'North 40',
    type: 'land', landUse: 'pasture', areaHectares: 1.0,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: LOC_B, operationId: OP, farmId: FARM, name: 'South 40',
    type: 'land', landUse: 'pasture', areaHectares: 1.5,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
});

afterEach(() => {
  vi.useRealTimers();
});

function panel() { return document.getElementById('survey-sheet-panel'); }

function expandLocA(p) {
  for (const span of p.querySelectorAll('span')) {
    if (span.textContent === 'North 40' && span.getAttribute('style')?.includes('font-weight')) {
      span.closest('div[style*="cursor: pointer"]').click();
      return;
    }
  }
}

function draftsFor(locId) {
  return getAll('surveyDraftEntries').filter(d => d.locationId === locId);
}

describe('OI-0131 — Pasture Survey bulk autosave via event delegation', () => {
  it('`input` on the quality slider schedules a debounced saveDraft', () => {
    openSurveySheet(null, OP);
    const p = panel();
    expandLocA(p);

    expect(draftsFor(LOC_A).length).toBe(0);

    const slider = p.querySelector('[data-testid="obs-card-forage-quality"]');
    expect(slider, 'quality slider must render').toBeTruthy();
    slider.value = '65';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    // Debounce is 1s; before the timer fires no draft entry exists.
    vi.advanceTimersByTime(500);
    expect(draftsFor(LOC_A).length, 'no save before debounce').toBe(0);

    vi.advanceTimersByTime(1000); // total 1500ms past the input
    const entries = draftsFor(LOC_A);
    expect(entries.length, 'debounced save lands exactly one row').toBe(1);
    expect(entries[0].forageQuality).toBe(65);
  });

  it('condition chip `click` schedules a debounced saveDraft', () => {
    openSurveySheet(null, OP);
    const p = panel();
    expandLocA(p);

    const goodChip = p.querySelector('[data-testid="obs-card-condition-good"]');
    expect(goodChip, 'good-condition chip must render').toBeTruthy();
    goodChip.click();

    vi.advanceTimersByTime(1500);
    const entries = draftsFor(LOC_A);
    expect(entries.length).toBe(1);
    expect(entries[0].forageCondition).toBe('good');
  });

  it('header expand/collapse click does NOT schedule a save (guard rejects non-chip clicks)', () => {
    openSurveySheet(null, OP);
    const p = panel();

    // Click LOC_A's card header to expand — this should NOT trigger the
    // .obs-condition-chip guard.
    expandLocA(p);

    vi.advanceTimersByTime(1500);
    expect(
      getAll('surveyDraftEntries').length,
      'no draft rows written from a header click',
    ).toBe(0);
  });

  it('debounce collapses rapid inputs into a single save with the last value', () => {
    openSurveySheet(null, OP);
    const p = panel();
    expandLocA(p);

    const heightInput = p.querySelector('[data-testid="obs-card-forage-height"]');
    expect(heightInput).toBeTruthy();

    // Fire four inputs 200ms apart. Each resets the 1s timer, so no save
    // fires until 1s after the last input.
    const values = ['10', '11', '12', '13'];
    for (const v of values) {
      heightInput.value = v;
      heightInput.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(200);
    }

    // Timer was reset at t=600; it should fire at t=1600. Advance to 1700.
    vi.advanceTimersByTime(1100);

    const entries = draftsFor(LOC_A);
    expect(entries.length, 'exactly one save for four rapid inputs').toBe(1);
    // 13 in → 33.02 cm via heightInputToCm under imperial unitSystem.
    expect(entries[0].forageHeightCm).toBeCloseTo(33.02, 1);
  });
});
