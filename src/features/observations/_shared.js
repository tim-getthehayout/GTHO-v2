/**
 * @file Shared sub-renderers for the three observation card variants (OI-0112).
 *
 * Extracts the visual building blocks used by renderPreGrazeCard,
 * renderPostGrazeCard, and renderSurveyCard. The three public components are
 * thin compositions; this file is the source of truth for field behavior so
 * variants cannot drift.
 *
 * Design reference:
 *   /sessions/happy-dreamy-keller/mnt/App Migration Project/pre-graze-box-mockup.html
 */

import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll } from '../../data/store.js';
import { convert, unitLabel } from '../../utils/units.js';
import { getCalcByName } from '../../utils/calc-registry.js';

// Canonical forage-condition values stored in paddock_observations.forage_condition.
export const CONDITION_VALUES = ['poor', 'fair', 'good', 'excellent'];

/**
 * Read the operation's unit system; fallback to imperial.
 */
export function getUnitSystem() {
  const op = getAll('operations')[0];
  return op?.unitSystem || 'imperial';
}

/**
 * Card header: title + Optional/Required pill.
 */
export function renderHeader(titleKey, required) {
  const badge = el('span', {
    className: `obs-badge ${required ? 'obs-required' : 'obs-optional'}`,
    'data-testid': 'obs-card-badge',
  }, [required ? t('event.obsRequired') : t('event.obsOptional')]);
  return el('div', { className: 'obs-fields-header' }, [
    el('span', { className: 'close-open-section-title' }, [t(titleKey)]),
    badge,
  ]);
}

/**
 * Convert a length value in the given unit system back to cm (metric storage).
 */
export function heightInputToCm(rawStr, unitSys) {
  const raw = parseFloat(rawStr);
  if (isNaN(raw) || raw <= 0) return null;
  return unitSys === 'imperial' ? convert(raw, 'length', 'toMetric') : raw;
}

/**
 * Format a stored cm value for display in the user's unit system.
 */
export function cmToDisplay(cm, unitSys) {
  if (cm == null) return '';
  if (unitSys === 'imperial') return convert(cm, 'length', 'toImperial').toFixed(1);
  return String(cm);
}

/**
 * Compact top row for pre-graze / survey:
 *   Forage Height (unit) · Forage Cover (%) · Residual Bale Rings
 *
 * The bale-ring input auto-computes `coverInput.value` via BRC-1 when
 * the helper is active. `setPaddockAcres(newAcres)` on the returned
 * object lets callers late-bind acres after construction (e.g. the
 * sub-move Open sheet doesn't know which paddock is picked yet at
 * render time — OI-0114 NC-1).
 *
 * @param {object} opts
 * @param {object|null} opts.farmSettings
 * @param {number|null} opts.paddockAcres
 * @param {object}       opts.initialValues
 * @param {string}       opts.unitSys
 * @returns {{
 *   container: HTMLElement,
 *   heightInput: HTMLInputElement,
 *   coverInput: HTMLInputElement,
 *   baleRingInput: HTMLInputElement,
 *   brcAvailable: boolean,
 *   setPaddockAcres: (newAcres: number|null) => void,
 * }}
 */
export function renderForageStateRow({ farmSettings, paddockAcres, initialValues, unitSys }) {
  const heightUnit = unitLabel('length', unitSys);

  const heightInput = el('input', {
    type: 'number', className: 'obs-compact-input',
    placeholder: '0', step: '0.1',
    value: cmToDisplay(initialValues.forageHeightCm, unitSys),
    'data-testid': 'obs-card-forage-height',
  });

  const coverInput = el('input', {
    type: 'number', className: 'obs-compact-input',
    placeholder: '0', min: '0', max: '100', step: '1',
    value: initialValues.forageCoverPct ?? '',
    'data-testid': 'obs-card-forage-cover',
  });

  const baleRingInput = el('input', {
    type: 'number', className: 'obs-compact-input',
    placeholder: '0', min: '0', step: '1',
    value: initialValues.baleRingResidueCount ?? '',
    'data-testid': 'obs-card-bale-ring',
  });

  // OI-0111: farm_settings stores diameter in cm; BRC-1 is imperial-native.
  const ringDiameterCm = farmSettings?.baleRingResidueDiameterCm ?? null;
  const ringDiameterFt = ringDiameterCm != null
    ? convert(ringDiameterCm, 'length', 'toImperial') / 12
    : null;

  // OI-0114 NC-1: mutable state so late-bound paddockAcres can flip the
  // helper active without re-rendering the whole card.
  const state = {
    paddockAcres: paddockAcres && paddockAcres > 0 ? paddockAcres : null,
  };
  const isBrcAvailable = () => !!(ringDiameterFt && state.paddockAcres && state.paddockAcres > 0);

  const previewChip = el('span', {
    className: 'obs-brc-preview',
    'data-testid': 'obs-card-brc-preview',
    style: {
      fontSize: '11px', marginLeft: '6px', padding: '2px 6px',
      borderRadius: '10px',
    },
  }, ['']);

  const helperNote = el('div', {
    'data-testid': 'obs-card-bale-ring-helper',
    style: { fontSize: '11px', color: 'var(--text2)', marginTop: '2px', gridColumn: '1 / -1' },
  }, ['']);

  function refreshHelperAppearance() {
    const active = isBrcAvailable();
    previewChip.style.background = active ? 'var(--color-green-pale, #E8F5E9)' : 'var(--color-surface, #eee)';
    previewChip.style.color = active ? 'var(--color-green-dark)' : 'var(--text3)';
    helperNote.textContent = active
      ? t('event.baleRingHelperDetail', { d: ringDiameterFt.toFixed(1), a: Number(state.paddockAcres).toFixed(2) })
      : t('event.baleRingHelperInactive');
  }
  refreshHelperAppearance();

  function runBrcFromCurrentInput() {
    if (!isBrcAvailable()) return;
    const count = parseInt(baleRingInput.value, 10);
    if (isNaN(count) || count < 0) { previewChip.textContent = ''; return; }
    const brc = getCalcByName('BRC-1');
    if (!brc) return;
    const out = brc.fn({ ringCount: count, ringDiameterFt, paddockAcres: state.paddockAcres });
    if (out.computedForageCoverPct != null) {
      coverInput.value = String(out.computedForageCoverPct);
      previewChip.textContent = t('event.baleRingCoverPreview', { pct: out.computedForageCoverPct });
    }
  }

  // OI-0114 NC-1: listener is now always attached. No-op when BRC isn't
  // available; active as soon as `setPaddockAcres` brings it online.
  baleRingInput.addEventListener('input', runBrcFromCurrentInput);

  const topRow = el('div', {
    className: 'obs-top-row',
    style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '6px' },
  }, [
    el('div', {}, [
      el('div', { className: 'obs-compact-label' }, [`${t('event.forageHeight')} (${heightUnit})`]),
      heightInput,
    ]),
    el('div', {}, [
      el('div', { className: 'obs-compact-label' }, [`${t('event.forageCover')} (%)`]),
      coverInput,
    ]),
    el('div', {}, [
      el('div', { className: 'obs-compact-label' }, [
        t('event.residualBaleRings'),
        el('div', { style: { fontSize: '10px', color: 'var(--text3)', fontWeight: '400' } }, [t('event.forageCoverCalculator')]),
      ]),
      el('div', { style: { display: 'flex', alignItems: 'center' } }, [baleRingInput, previewChip]),
    ]),
    helperNote,
  ]);

  return {
    container: topRow,
    heightInput,
    coverInput,
    baleRingInput,
    get brcAvailable() { return isBrcAvailable(); },
    setPaddockAcres(newAcres) {
      state.paddockAcres = newAcres && newAcres > 0 ? newAcres : null;
      refreshHelperAppearance();
      // If a ring count is already populated, running the calc now makes
      // the cover field update in place without another keystroke.
      runBrcFromCurrentInput();
    },
  };
}

/**
 * Relative forage quality — 1–100 range slider with anchor labels + color-graded track
 * + live numeric readout beside the label.
 */
export function renderQualitySlider(initialValue) {
  const input = el('input', {
    type: 'range', min: '1', max: '100', step: '1',
    value: initialValue ?? 50,
    className: 'obs-quality-slider',
    'data-testid': 'obs-card-forage-quality',
    style: {
      width: '100%',
      background: 'linear-gradient(to right, var(--color-red-base, #d32f2f) 0%, var(--color-amber-base, #f9a825) 50%, var(--color-green-base, #43a047) 100%)',
      height: '6px', borderRadius: '3px', WebkitAppearance: 'none',
    },
  });
  const valueEl = el('span', {
    'data-testid': 'obs-card-forage-quality-value',
    style: { fontSize: '12px', color: 'var(--text2)', marginLeft: '8px', minWidth: '28px', display: 'inline-block' },
  }, [String(input.value)]);
  input.addEventListener('input', () => { valueEl.textContent = input.value; });

  const anchorRow = el('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text3)', marginTop: '2px' },
  }, [
    el('span', {}, [t('event.conditionPoor')]),
    el('span', {}, [t('event.conditionFair')]),
    el('span', {}, [t('event.conditionGood')]),
    el('span', {}, [t('event.conditionExcellent')]),
  ]);

  const container = el('div', { className: 'obs-quality-row', style: { marginBottom: '10px' } }, [
    el('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center' } }, [
      t('event.relativeForageQuality'),
      valueEl,
    ]),
    input,
    anchorRow,
  ]);

  return { container, input };
}

/**
 * Condition chips — single-select, reclick to deselect.
 * Returns { container, getValue } — getValue returns the selected DB value
 * (one of CONDITION_VALUES) or null.
 */
export function renderConditionChips(initialValue) {
  let active = CONDITION_VALUES.includes(initialValue) ? initialValue : null;
  const chipEls = {};

  function rerender() {
    for (const v of CONDITION_VALUES) {
      const isActive = active === v;
      chipEls[v].style.background = isActive ? 'var(--color-green-base, #43a047)' : 'transparent';
      chipEls[v].style.color = isActive ? '#fff' : 'var(--text1)';
      chipEls[v].style.borderColor = isActive ? 'var(--color-green-base, #43a047)' : 'var(--border)';
      chipEls[v].dataset.active = isActive ? 'true' : 'false';
    }
  }

  const row = el('div', {
    className: 'obs-condition-chips',
    style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' },
  });
  const labelKeys = { poor: 'event.conditionPoor', fair: 'event.conditionFair', good: 'event.conditionGood', excellent: 'event.conditionExcellent' };
  for (const v of CONDITION_VALUES) {
    const chip = el('button', {
      type: 'button',
      className: 'obs-condition-chip',
      'data-testid': `obs-card-condition-${v}`,
      'data-value': v,
      style: {
        padding: '6px 8px', fontSize: '12px', fontWeight: '500',
        border: '1px solid var(--border)', borderRadius: '14px',
        cursor: 'pointer', background: 'transparent',
      },
      onClick: () => {
        active = active === v ? null : v;
        rerender();
      },
    }, [t(labelKeys[v])]);
    chipEls[v] = chip;
    row.appendChild(chip);
  }
  rerender();

  const container = el('div', { style: { marginBottom: '10px' } }, [
    el('label', { className: 'form-label' }, [t('event.forageCondition')]),
    row,
  ]);

  return {
    container,
    getValue() { return active; },
  };
}

/**
 * Recovery window — "[Min] – [Max] days" on a single row.
 */
export function renderRecoveryWindow(initialMin, initialMax) {
  const minInput = el('input', {
    type: 'number', className: 'obs-compact-input',
    min: '0', step: '1',
    value: initialMin ?? '',
    'data-testid': 'obs-card-recovery-min',
  });
  const maxInput = el('input', {
    type: 'number', className: 'obs-compact-input',
    min: '0', step: '1',
    value: initialMax ?? '',
    'data-testid': 'obs-card-recovery-max',
  });
  const container = el('div', { style: { marginBottom: '10px' } }, [
    el('label', { className: 'form-label' }, [t('event.recoveryWindow')]),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      minInput,
      el('span', { style: { color: 'var(--text2)' } }, ['\u2013']),
      maxInput,
      el('span', { style: { color: 'var(--text2)', fontSize: '12px' } }, [t('event.recoveryWindowDays')]),
    ]),
  ]);
  return { container, minInput, maxInput };
}

/**
 * Residual height single-field row for post-graze.
 */
export function renderResidualHeight(initialCm, unitSys) {
  const heightUnit = unitLabel('length', unitSys);
  const input = el('input', {
    type: 'number', className: 'obs-compact-input',
    placeholder: '0', step: '0.1',
    value: cmToDisplay(initialCm, unitSys),
    'data-testid': 'obs-card-residual-height',
  });
  const container = el('div', { style: { marginBottom: '10px' } }, [
    el('label', { className: 'form-label' }, [`${t('event.residualHeight')} (${heightUnit})`]),
    input,
  ]);
  return { container, input };
}

/**
 * Notes textarea.
 */
export function renderNotes(initialValue) {
  const input = el('textarea', {
    className: 'auth-input',
    'data-testid': 'obs-card-notes',
    style: { minHeight: '56px', resize: 'vertical', width: '100%' },
  });
  input.value = initialValue || '';
  const container = el('div', { style: { marginBottom: '10px' } }, [
    el('label', { className: 'form-label' }, [t('event.notes')]),
    input,
  ]);
  return { container, input };
}

/**
 * Small parsing helpers the public cards reuse in getValues().
 */
export function parseIntOrNull(str) {
  const v = parseInt(str, 10);
  return isNaN(v) ? null : v;
}
