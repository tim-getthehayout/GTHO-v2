/**
 * @file Shared paddock observation card — OI-0100.
 *
 * Pre-graze observation UI reused across:
 *   - move-wizard Step 3 destination pre-graze (saves to event_observations)
 *   - survey draft entry sheet (saves to paddock_observations) — follow-up PR
 *     to migrate; today the survey sheet still has an inline implementation.
 *
 * The card itself does not persist. Callers consume `getValues()` and choose
 * which table to write to. Shape of `getValues()` intentionally matches the
 * superset of `event_observations` and `paddock_observations` so either
 * persistence target works.
 *
 * Contract mirrors `renderPreGrazeFields` so the existing move-wizard
 * `createObservation` call at the consume site works without further changes.
 *
 * Fields per GH-12 spec (SP-9):
 *   - forage height (cm, unit-converted on display)
 *   - forage quality slider (1–100 scale, entity validate's range)
 *   - forage cover % (0–100) with optional bale-ring helper (BRC-1)
 *   - forage condition enum (dry / fair / good / lush — event_observations set)
 *   - bale-ring residue count (rings)
 *   - recovery min/max days
 *   - notes
 *
 * @param {object} opts
 * @param {'event_observations'|'paddock_observations'} opts.saveTo  — caller hint; the card
 *   surfaces the same fields either way but the caller uses this to decide which
 *   target entity to `create()` against.
 * @param {object} [opts.farmSettings]  — farm settings record; used for bale-ring diameter
 *   default + recovery-required badge.
 * @param {number} [opts.paddockAcres]  — optional, enables the BRC-1 auto-fill. When provided
 *   alongside `farmSettings.baleRingResidueDiameterCm`, entering a bale-ring count auto-computes
 *   the forage cover %. cm → ft conversion happens inline here; the BRC-1 calc stays imperial-native.
 * @param {object} [opts.initialValues]  — optional record to pre-populate fields (camelCase).
 * @returns {{ container: HTMLElement, getValues: () => object, validate: () => { valid: boolean, errors: string[] }, saveTo: string }}
 */

import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll } from '../../data/store.js';
import { convert, unitLabel } from '../../utils/units.js';
import { getCalcByName } from '../../utils/calc-registry.js';

function getUnitSystem() {
  const op = getAll('operations')[0];
  return op?.unitSystem || 'imperial';
}

export function renderPaddockCard({ saveTo = 'event_observations', farmSettings = null, paddockAcres = null, initialValues = {} } = {}) {
  const required = farmSettings?.recoveryRequired || false;
  const unitSys = getUnitSystem();
  const heightUnit = unitLabel('length', unitSys);

  const badge = el('span', {
    className: `obs-badge ${required ? 'obs-required' : 'obs-optional'}`,
  }, [required ? t('event.obsRequired') : t('event.obsOptional')]);

  // Pre-populate inputs from initialValues, converting cm → display units where
  // appropriate. Missing keys render as empty inputs.
  const initHeightDisplay = initialValues.forageHeightCm != null
    ? (unitSys === 'imperial'
      ? convert(initialValues.forageHeightCm, 'length', 'toImperial').toFixed(1)
      : String(initialValues.forageHeightCm))
    : '';

  const heightInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    placeholder: '0', step: '0.1', value: initHeightDisplay,
    'data-testid': 'paddock-card-forage-height',
  });

  const qualityInput = el('input', {
    type: 'range', min: '1', max: '100', step: '1',
    value: initialValues.forageQuality ?? 50,
    'data-testid': 'paddock-card-forage-quality',
  });
  const qualityValueEl = el('span', {
    'data-testid': 'paddock-card-forage-quality-value',
    style: { fontSize: '12px', color: 'var(--text2)', marginLeft: '8px' },
  }, [String(qualityInput.value)]);
  qualityInput.addEventListener('input', () => {
    qualityValueEl.textContent = qualityInput.value;
  });

  const coverInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    placeholder: '0', min: '0', max: '100',
    value: initialValues.forageCoverPct ?? '',
    'data-testid': 'paddock-card-forage-cover',
  });

  // Forage condition — VALID_CONDITIONS on both paddock_observations and
  // survey_draft_entries is ['poor','fair','good','excellent']. event_observations
  // uses a different set ('dry'/'fair'/'good'/'lush'); that divergence is tracked
  // outside OI-0100 as doc/schema drift to reconcile later.
  const conditionInput = el('select', {
    className: 'auth-select',
    'data-testid': 'paddock-card-forage-condition',
  }, [
    el('option', { value: '' }, ['—']),
    el('option', { value: 'poor' }, [t('event.conditionPoor')]),
    el('option', { value: 'fair' }, [t('event.conditionFair')]),
    el('option', { value: 'good' }, [t('event.conditionGood')]),
    el('option', { value: 'excellent' }, [t('event.conditionExcellent')]),
  ]);
  if (initialValues.forageCondition) conditionInput.value = initialValues.forageCondition;

  // Bale-ring residue count + optional auto-fill of coverInput via BRC-1.
  const baleRingInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    placeholder: '0', min: '0', step: '1',
    value: initialValues.baleRingResidueCount ?? '',
    'data-testid': 'paddock-card-bale-ring',
  });
  // OI-0111: farm_settings stores bale-ring diameter in cm (metric-internal).
  // The BRC-1 calc is imperial-native; convert cm → ft inline at the call site.
  const ringDiameterCm = farmSettings?.baleRingResidueDiameterCm ?? null;
  const ringDiameterFt = ringDiameterCm != null
    ? convert(ringDiameterCm, 'length', 'toImperial') / 12
    : null;
  const brcAvailable = !!(ringDiameterFt && paddockAcres && paddockAcres > 0);
  const brcHelperNote = el('div', {
    'data-testid': 'paddock-card-bale-ring-helper',
    style: { fontSize: '11px', color: 'var(--text2)', marginTop: '2px' },
  }, [brcAvailable ? t('event.baleRingHelperActive') : t('event.baleRingHelperInactive')]);
  if (brcAvailable) {
    baleRingInput.addEventListener('input', () => {
      const count = parseInt(baleRingInput.value, 10);
      if (isNaN(count) || count < 0) return;
      const brc = getCalcByName('BRC-1');
      if (!brc) return;
      const out = brc.fn({ ringCount: count, ringDiameterFt, paddockAcres });
      if (out.computedForageCoverPct != null) {
        coverInput.value = String(out.computedForageCoverPct);
      }
    });
  }

  // Recovery days — only relevant on post-graze-ish workflows, but the shared
  // card exposes them so event_observations can receive the full shape.
  const minDaysInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: initialValues.recoveryMinDays ?? farmSettings?.defaultRecoveryMinDays ?? '',
    'data-testid': 'paddock-card-recovery-min',
  });
  const maxDaysInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: initialValues.recoveryMaxDays ?? farmSettings?.defaultRecoveryMaxDays ?? '',
    'data-testid': 'paddock-card-recovery-max',
  });

  const notesInput = el('textarea', {
    className: 'auth-input',
    'data-testid': 'paddock-card-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  // Textarea .value must be set via property, not attribute (setAttribute doesn't
  // populate it).
  notesInput.value = initialValues.notes || '';

  const container = el('div', {
    className: 'obs-fields paddock-card',
    'data-testid': `paddock-card-${saveTo}`,
  }, [
    el('div', { className: 'obs-fields-header' }, [
      el('span', { className: 'close-open-section-title' }, [t('event.preGrazeObs')]),
      badge,
    ]),
    el('label', { className: 'form-label' }, [`${t('event.forageHeight')} (${heightUnit})`]),
    heightInput,
    el('label', { className: 'form-label' }, [
      t('event.forageQuality'),
      qualityValueEl,
    ]),
    qualityInput,
    el('label', { className: 'form-label' }, [t('event.forageCoverPct')]),
    coverInput,
    el('label', { className: 'form-label' }, [t('event.forageCondition')]),
    conditionInput,
    el('label', { className: 'form-label' }, [t('event.baleRingResidueCount')]),
    baleRingInput,
    brcHelperNote,
    el('label', { className: 'form-label' }, [t('event.recoveryMinDays')]),
    minDaysInput,
    el('label', { className: 'form-label' }, [t('event.recoveryMaxDays')]),
    maxDaysInput,
    el('label', { className: 'form-label' }, [t('event.notes')]),
    notesInput,
  ]);

  return {
    container,
    saveTo,
    getValues() {
      const rawHeight = parseFloat(heightInput.value);
      const heightCm = !isNaN(rawHeight) && rawHeight > 0
        ? (unitSys === 'imperial' ? convert(rawHeight, 'length', 'toMetric') : rawHeight)
        : null;
      const coverPct = parseFloat(coverInput.value);
      const quality = parseInt(qualityInput.value, 10);
      const ringCount = parseInt(baleRingInput.value, 10);
      const minDays = parseInt(minDaysInput.value, 10);
      const maxDays = parseInt(maxDaysInput.value, 10);
      return {
        forageHeightCm: heightCm,
        forageCoverPct: !isNaN(coverPct) ? coverPct : null,
        forageQuality: !isNaN(quality) ? quality : null,
        forageCondition: conditionInput.value || null,
        baleRingResidueCount: !isNaN(ringCount) ? ringCount : null,
        recoveryMinDays: !isNaN(minDays) ? minDays : null,
        recoveryMaxDays: !isNaN(maxDays) ? maxDays : null,
        notes: notesInput.value.trim() || null,
      };
    },
    validate() {
      if (!required) return { valid: true, errors: [] };
      const errors = [];
      if (!heightInput.value) errors.push(t('event.forageHeight'));
      if (!coverInput.value) errors.push(t('event.forageCoverPct'));
      return { valid: errors.length === 0, errors };
    },
  };
}
