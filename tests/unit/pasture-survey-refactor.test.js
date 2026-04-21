/**
 * @file OI-0126 — Pasture Survey card body delegates to the unified
 * `renderSurveyCard` component.
 *
 * Before: `openSurveySheet` rendered its own hand-rolled Height/Cover row,
 * standalone bale-ring block, hand-rolled condition chips + recovery min-max,
 * and had no Notes textarea — the readings[].notes field was a dead write.
 *
 * After: `openSurveySheet` mounts `renderSurveyCard` per paddock and tracks
 * each card in a `cards` Map so values survive filter / expand-collapse /
 * search re-renders. Legacy `readings` field names (`rating`, `heightCm`,
 * `coverPct`, …) are renamed to canonical (`forageQuality`, `forageHeightCm`,
 * `forageCoverPct`, …) so the spread round-trip matches `survey_draft_entries`
 * + `paddock_observations` columns without a rename shim.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
// BRC-1 side-effect registration so the bale-ring helper activates.
import '../../src/calcs/survey-bale-ring.js';
import { openSurveySheet } from '../../src/features/locations/index.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC_A = '00000000-0000-0000-0000-0000000000c1';
const LOC_B = '00000000-0000-0000-0000-0000000000c2';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({
    farmId: FARM, operationId: OP,
    baleRingResidueDiameterCm: 365.76, // 12 ft exactly
  }), FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  // areaHectares = 1.0 → ~2.47 ac — enough for BRC-1 to yield a sub-100% cover.
  add('locations', LocationEntity.create({
    id: LOC_A, operationId: OP, farmId: FARM, name: 'North 40',
    type: 'land', landUse: 'pasture', areaHectares: 1.0,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: LOC_B, operationId: OP, farmId: FARM, name: 'South 40',
    type: 'land', landUse: 'pasture', areaHectares: 1.5,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
});

function panel() { return document.getElementById('survey-sheet-panel'); }

describe('OI-0126 — openSurveySheet delegates to renderSurveyCard', () => {
  it('Single mode: 3-up top row, Notes textarea present, Recovery above Notes', () => {
    openSurveySheet(LOC_A, OP);
    const p = panel();
    const topRow = p.querySelector('.obs-top-row');
    expect(topRow, 'obs-top-row layout must render').toBeTruthy();
    const fields = topRow.querySelectorAll('.obs-field, .obs-field-rings');
    expect(fields.length, 'top row has 3 fields (height, cover, rings)').toBe(3);
    const notes = p.querySelector('[data-testid="obs-card-notes"]');
    expect(notes, 'Notes textarea must render').toBeTruthy();
    const recovery = p.querySelector('[data-testid="obs-card-recovery-min"]');
    expect(recovery, 'Recovery min input must render').toBeTruthy();
    // Recovery renders BEFORE Notes in DOM order.
    const followsRecovery = recovery.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(followsRecovery, 'Notes should follow Recovery in DOM order').toBeTruthy();
  });

  it('Bulk mode: expanded card renders the same unified layout', () => {
    openSurveySheet(null, OP);
    // Click the card header for LOC_A to expand.
    const p = panel();
    // Bulk mode collapses all by default — find LOC_A's card header and click it.
    // The card header text includes the location name; click the first paddock
    // card's header to expand.
    const cards = p.querySelectorAll('[style*="border"][style*="radius"]');
    // More robust: find by location name and traverse to the header.
    let headerA = null;
    for (const span of p.querySelectorAll('span')) {
      if (span.textContent === 'North 40' && span.getAttribute('style')?.includes('font-weight')) {
        // Walk up to the clickable header div.
        headerA = span.closest('div[style*="cursor: pointer"]');
        if (headerA) break;
      }
    }
    expect(headerA, 'clickable card header for North 40 must exist').toBeTruthy();
    headerA.click();

    const topRow = p.querySelector('.obs-top-row');
    expect(topRow, 'top row should render in expanded bulk card').toBeTruthy();
    const fields = topRow.querySelectorAll('.obs-field, .obs-field-rings');
    expect(fields.length).toBe(3);
    expect(p.querySelector('[data-testid="obs-card-notes"]')).toBeTruthy();
    // Silence unused lint.
    expect(cards.length).toBeGreaterThan(0);
  });

  it('BRC auto-fill parity (OI-0124 Phase 1 preservation)', () => {
    openSurveySheet(LOC_A, OP);
    const p = panel();
    const baleInput = p.querySelector('[data-testid="obs-card-bale-ring"]');
    const coverInput = p.querySelector('[data-testid="obs-card-forage-cover"]');
    const helper = p.querySelector('[data-testid="obs-card-bale-ring-helper"]');
    expect(baleInput).toBeTruthy();
    expect(coverInput).toBeTruthy();
    // Helper must be in the active state — areaHectares is set, so paddockAcres
    // reached the card. Pre-OI-0126 the Field Mode survey also wired BRC but
    // via its own hand-rolled block; the assertion here is that the unified
    // card's active path fires under the refactor.
    expect(helper.textContent).toMatch(/12\.0 ft/);
    expect(helper.textContent).toMatch(/2\.47 ac/);
    baleInput.value = '3';
    baleInput.dispatchEvent(new Event('input', { bubbles: true }));
    const covered = parseInt(coverInput.value, 10);
    expect(Number.isInteger(covered)).toBe(true);
    expect(covered).toBeGreaterThan(0);
  });

  it('Round-trip draft save: all 8 fields land in surveyDraftEntries with canonical names', () => {
    openSurveySheet(null, OP);
    const p = panel();
    // Expand LOC_A
    for (const span of p.querySelectorAll('span')) {
      if (span.textContent === 'North 40' && span.getAttribute('style')?.includes('font-weight')) {
        span.closest('div[style*="cursor: pointer"]').click();
        break;
      }
    }
    // Populate the 8 fields on LOC_A's card.
    const setVal = (testid, val) => {
      const el = p.querySelector(`[data-testid="${testid}"]`);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setVal('obs-card-forage-height', '4');   // 4 in → stored 10.16 cm
    setVal('obs-card-forage-quality', '60');
    // Click the "good" condition chip.
    p.querySelector('[data-testid="obs-card-condition-good"]').click();
    setVal('obs-card-bale-ring', '2');
    // Cover must be set AFTER bale-ring: the BRC-1 listener auto-writes into
    // the cover input when rings are typed, so a manual cover value only
    // sticks if it's written last.
    setVal('obs-card-forage-cover', '70');
    setVal('obs-card-recovery-min', '21');
    setVal('obs-card-recovery-max', '60');
    const notesEl = p.querySelector('[data-testid="obs-card-notes"]');
    notesEl.value = 'Roundtrip test note';
    notesEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Find the Save Draft button and click it.
    let saveDraftBtn = null;
    for (const btn of p.querySelectorAll('button')) {
      if (btn.textContent === 'Save Draft') { saveDraftBtn = btn; break; }
    }
    expect(saveDraftBtn).toBeTruthy();
    saveDraftBtn.click();

    const entries = getAll('surveyDraftEntries').filter(d => d.locationId === LOC_A);
    expect(entries.length, 'one draft entry for LOC_A').toBe(1);
    const entry = entries[0];
    // 4 in → 10.16 cm (metric stored, via convert()).
    expect(entry.forageHeightCm).toBeCloseTo(10.16, 1);
    expect(entry.forageCoverPct).toBe(70);
    expect(entry.forageQuality).toBe(60);
    expect(entry.forageCondition).toBe('good');
    expect(entry.baleRingResidueCount).toBe(2);
    expect(entry.recoveryMinDays).toBe(21);
    expect(entry.recoveryMaxDays).toBe(60);
    expect(entry.notes).toBe('Roundtrip test note');
  });

  it('Expand/collapse preserves in-progress state via commitReadingsFromCards', () => {
    openSurveySheet(null, OP);
    const p = panel();
    const expandHeaderA = () => {
      for (const span of p.querySelectorAll('span')) {
        if (span.textContent === 'North 40' && span.getAttribute('style')?.includes('font-weight')) {
          span.closest('div[style*="cursor: pointer"]').click();
          return;
        }
      }
    };
    expandHeaderA();
    const heightInput = p.querySelector('[data-testid="obs-card-forage-height"]');
    heightInput.value = '5';
    heightInput.dispatchEvent(new Event('input', { bubbles: true }));
    heightInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Collapse (click again to toggle the expansion) — renderPaddockList
    // re-runs, commitReadingsFromCards() flushes the height value back into
    // readings[LOC_A].forageHeightCm, cards.clear() drops the old card.
    expandHeaderA();
    // Re-expand — the new card reads initialValues from readings, which now
    // contain the stored metric value. 5 in → ~12.7 cm, rendered back as 5.0 in.
    expandHeaderA();
    const rehydrated = p.querySelector('[data-testid="obs-card-forage-height"]');
    expect(rehydrated.value).toBe('5.0');
  });
});
