/** @file OI-0256 Lv1+Sk1+Pn1+Mt1+Mx1 — 100% Stored Feed / no_pasture restore. */
import { describe, it, expect, beforeAll } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import {
  computeLocationMetrics,
  isNoPasturePw,
  pastureInferenceWindows,
} from '../../src/features/events/rotation-calendar/location-metrics.js';
import { renderPastBlock } from '../../src/features/events/rotation-calendar/past-block.js';
import { isNoPasturePw as isNoPasturePwUi, skipsPastureResidual, renderStoredFeedOnlyCheckbox } from '../../src/features/events/no-pasture.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { el } from '../../src/ui/dom.js';

beforeAll(() => setLocale('en', enLocale));

const LOC_A = { id: 'loc-a', name: 'A', type: 'land', landUse: 'pasture', areaHectares: 4.047 }; // ~10 ac
const LOC_B = { id: 'loc-b', name: 'B', type: 'land', landUse: 'pasture', areaHectares: 4.047 };
const CLS = { id: 'ac1', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };

function baseAnimals(n = 10) {
  const animals = Array.from({ length: n }, (_, i) => ({
    id: `a${i}`, classId: 'ac1', archived: false, status: 'active',
  }));
  const memberships = animals.map(a => ({
    id: `m${a.id}`, animalId: a.id, groupId: 'g1',
    dateJoined: '2026-01-01', dateLeft: null,
  }));
  return { animals, memberships };
}

describe('OI-0256 helpers', () => {
  it('isNoPasturePw / skipsPastureResidual / pastureInferenceWindows', () => {
    expect(isNoPasturePw({ noPasture: true })).toBe(true);
    expect(isNoPasturePwUi({ noPasture: true })).toBe(true);
    expect(skipsPastureResidual({ noPasture: true })).toBe(true);
    expect(skipsPastureResidual({ noPasture: false })).toBe(false);
    const pool = pastureInferenceWindows([
      { id: '1', noPasture: true },
      { id: '2', noPasture: false },
    ]);
    expect(pool.map(p => p.id)).toEqual(['2']);
  });

  it('Lv1 checkbox uses observations.storedFeedOnly label', () => {
    setLocale('en', enLocale.default || enLocale);
    const { container, input, isChecked } = renderStoredFeedOnlyCheckbox({ testId: 't-np' });
    expect(container.textContent).toMatch(/100% Stored Feed|storedFeedOnly/);
    expect(input.getAttribute('data-testid')).toBe('t-np');
    expect(isChecked()).toBe(false);
    input.checked = true;
    expect(isChecked()).toBe(true);
  });
});

describe('OI-0256 Pn1 tan paint', () => {
  it('adds past-block--stored-feed and Pasture 0% · Feed 100% copy', () => {
    const node = renderPastBlock({
      leftPx: 0, widthPx: 100,
      groups: [{ id: 'g1', name: 'Cows' }],
      auds: 0, days: 5, pasturePct: 0, feedPct: 100, dmi: 0, headCount: 10,
      isActive: false, isStripGraze: false, isLinkedSecondary: false,
      storedFeedOnly: true, eventId: 'e1', onClickBlock: () => {},
    });
    expect(node.className).toContain('past-block--stored-feed');
    expect(node.textContent).toContain('Pasture 0%');
    expect(node.textContent).toContain('Feed 100%');
  });
});

describe('OI-0256 Mt1 known Pasture 0', () => {
  it('no_pasture window alone → dmiKnown with dmiKg 0 (not F1 sticky)', () => {
    const { animals, memberships } = baseAnimals();
    const event = { id: 'ev1', dateOut: '2026-05-05' };
    const pw = {
      id: 'pw1', eventId: 'ev1', locationId: 'loc-a',
      dateOpened: '2026-05-01', dateClosed: '2026-05-05', areaPct: 100, noPasture: true,
    };
    const gw = {
      id: 'gw1', eventId: 'ev1', groupId: 'g1', animalClassId: 'ac1',
      dateJoined: '2026-05-01', dateLeft: '2026-05-05', headCount: 10, avgWeightKg: 453.6,
    };
    const m = computeLocationMetrics(LOC_A, {
      windowStart: '2026-05-01',
      windowEnd: '2026-05-05',
      today: '2026-05-05',
      events: [event],
      paddockWindows: [pw],
      groupWindows: [gw],
      memberships,
      animals,
      animalClasses: [CLS],
      animalWeightRecords: [],
      locations: [LOC_A],
      observations: [], // no residual — must still be known 0
      feedEntries: [],
      feedChecks: [],
      feedCheckItems: [],
      batches: [],
      feedTypes: [],
      batchNutritionalProfiles: [],
    });
    expect(m.dmiKnown).toBe(true);
    expect(m.dmiKg).toBe(0);
    expect(m.auds).toBeGreaterThan(0); // solo no_pasture still keeps AUDs; Mx1 omit is mixed-only
    expect(m.npkKnown).toBe(true);
    expect(m.nKg).toBeGreaterThan(0); // still participates in NPK
  });
});

describe('OI-0256 Mx1 mixed event', () => {
  it('omits no_pasture from pasture DMI+AUD; keeps NPK; Mt1 on flagged window', () => {
    const { animals, memberships } = baseAnimals();
    const event = { id: 'ev1', dateOut: '2026-05-05' };
    const pwA = {
      id: 'pw-a', eventId: 'ev1', locationId: 'loc-a',
      dateOpened: '2026-05-01', dateClosed: '2026-05-05', areaPct: 100, noPasture: false,
    };
    const pwB = {
      id: 'pw-b', eventId: 'ev1', locationId: 'loc-b',
      dateOpened: '2026-05-01', dateClosed: '2026-05-05', areaPct: 100, noPasture: true,
    };
    const gw = {
      id: 'gw1', eventId: 'ev1', groupId: 'g1', animalClassId: 'ac1',
      dateJoined: '2026-05-01', dateLeft: '2026-05-05', headCount: 10, avgWeightKg: 453.6,
    };
    const ctxBase = {
      windowStart: '2026-05-01',
      windowEnd: '2026-05-05',
      today: '2026-05-05',
      events: [event],
      paddockWindows: [pwA, pwB],
      groupWindows: [gw],
      memberships,
      animals,
      animalClasses: [CLS],
      animalWeightRecords: [],
      locations: [LOC_A, LOC_B],
      observations: [],
      feedEntries: [],
      feedChecks: [],
      feedCheckItems: [],
      batches: [],
      feedTypes: [],
      batchNutritionalProfiles: [],
    };

    const mA = computeLocationMetrics(LOC_A, ctxBase);
    const mB = computeLocationMetrics(LOC_B, ctxBase);

    // B flagged: known pasture 0, no AUDs, still NPK
    expect(mB.dmiKnown).toBe(true);
    expect(mB.dmiKg).toBe(0);
    expect(mB.auds).toBe(0);
    expect(mB.npkKnown).toBe(true);
    expect(mB.nKg).toBeGreaterThan(0);

    // A grazing: gets full pasture AUDs (B omitted from AUD denom) and pasture DMI
    expect(mA.auds).toBeGreaterThan(0);
    expect(mA.dmiKnown).toBe(true);
    expect(mA.dmiKg).toBeGreaterThan(0);
    // A NPK share is diluted by B still in the pool
    expect(mA.nKg).toBeGreaterThan(0);
    expect(mA.nKg).toBeLessThan(mB.nKg * 2); // both get ~half when equal acres
    expect(Math.abs(mA.nKg - mB.nKg)).toBeLessThan(0.01);
  });
});

describe('OI-0256 Sk1 checkbox i18n wiring smoke', () => {
  it('mounts without throwing', () => {
    document.body.appendChild(el('div', { id: 'root' }));
    const { container } = renderStoredFeedOnlyCheckbox({ checked: true });
    document.getElementById('root').appendChild(container);
    expect(document.querySelector('[data-testid="no-pasture-checkbox"]')).toBeTruthy();
  });
});
