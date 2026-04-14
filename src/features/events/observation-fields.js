/**
 * @file Observation field helpers — OI-0040/OI-0041.
 * Renders pre-graze and post-graze observation input fields.
 * Used by close.js, move-wizard.js, submove.js.
 */

import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll } from '../../data/store.js';
import { convert, unitLabel } from '../../utils/units.js';

/**
 * Get the current farm_settings including recovery_required.
 * @returns {object|null}
 */
export function getFarmSettings() {
  return getAll('farmSettings')[0] || null;
}

/**
 * Get the current unit system.
 * @returns {string} 'imperial' or 'metric'
 */
function getUnitSystem() {
  const op = getAll('operations')[0];
  return op?.unitSystem || 'imperial';
}

/**
 * Render pre-graze (open) observation fields: forage height, forage cover %.
 * @param {object} farmSettings
 * @returns {{ container: HTMLElement, getValues(): object }}
 */
export function renderPreGrazeFields(farmSettings) {
  const required = farmSettings?.recoveryRequired || false;
  const unitSys = getUnitSystem();
  const heightUnit = unitLabel('length', unitSys);

  const badge = el('span', {
    className: `obs-badge ${required ? 'obs-required' : 'obs-optional'}`,
  }, [required ? t('event.obsRequired') : t('event.obsOptional')]);

  const heightInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    placeholder: '0', step: '0.1',
    'data-testid': 'obs-forage-height',
  });

  const coverInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    placeholder: '0', min: '0', max: '100',
    'data-testid': 'obs-forage-cover',
  });

  const container = el('div', { className: 'obs-fields', 'data-testid': 'obs-pre-graze' }, [
    el('div', { className: 'obs-fields-header' }, [
      el('span', { className: 'close-open-section-title' }, [t('event.preGrazeObs')]),
      badge,
    ]),
    el('label', { className: 'form-label' }, [`${t('event.forageHeight')} (${heightUnit})`]),
    heightInput,
    el('label', { className: 'form-label' }, [t('event.forageCoverPct')]),
    coverInput,
  ]);

  return {
    container,
    getValues() {
      const rawHeight = parseFloat(heightInput.value);
      const heightCm = !isNaN(rawHeight) && rawHeight > 0
        ? (unitSys === 'imperial' ? convert(rawHeight, 'length', 'toMetric') : rawHeight)
        : null;
      const coverPct = parseFloat(coverInput.value);
      return {
        forageHeightCm: heightCm,
        forageCoverPct: !isNaN(coverPct) ? coverPct : null,
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

/**
 * Render post-graze (close) observation fields: residual height, recovery min/max days.
 * @param {object} farmSettings
 * @returns {{ container: HTMLElement, getValues(): object }}
 */
export function renderPostGrazeFields(farmSettings) {
  const required = farmSettings?.recoveryRequired || false;
  const unitSys = getUnitSystem();
  const heightUnit = unitLabel('length', unitSys);

  const defaultResidual = farmSettings?.defaultResidualHeightCm || null;
  const defaultResidualDisplay = defaultResidual != null
    ? (unitSys === 'imperial' ? convert(defaultResidual, 'length', 'toImperial').toFixed(1) : defaultResidual)
    : '';

  const badge = el('span', {
    className: `obs-badge ${required ? 'obs-required' : 'obs-optional'}`,
  }, [required ? t('event.obsRequired') : t('event.obsOptional')]);

  const residualInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: defaultResidualDisplay,
    step: '0.1',
    'data-testid': 'obs-residual-height',
  });

  const minDaysInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: farmSettings?.defaultRecoveryMinDays ?? '',
    'data-testid': 'obs-recovery-min',
  });

  const maxDaysInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: farmSettings?.defaultRecoveryMaxDays ?? '',
    'data-testid': 'obs-recovery-max',
  });

  const container = el('div', { className: 'obs-fields', 'data-testid': 'obs-post-graze' }, [
    el('div', { className: 'obs-fields-header' }, [
      el('span', { className: 'close-open-section-title' }, [t('event.postGrazeObs')]),
      badge,
    ]),
    el('label', { className: 'form-label' }, [`${t('event.residualHeight')} (${heightUnit})`]),
    residualInput,
    el('label', { className: 'form-label' }, [t('event.recoveryMinDays')]),
    minDaysInput,
    el('label', { className: 'form-label' }, [t('event.recoveryMaxDays')]),
    maxDaysInput,
  ]);

  return {
    container,
    getValues() {
      const rawResidual = parseFloat(residualInput.value);
      const residualCm = !isNaN(rawResidual) && rawResidual > 0
        ? (unitSys === 'imperial' ? convert(rawResidual, 'length', 'toMetric') : rawResidual)
        : null;
      const minDays = parseInt(minDaysInput.value, 10);
      const maxDays = parseInt(maxDaysInput.value, 10);
      return {
        residualHeightCm: residualCm,
        recoveryMinDays: !isNaN(minDays) ? minDays : null,
        recoveryMaxDays: !isNaN(maxDays) ? maxDays : null,
      };
    },
    validate() {
      if (!required) return { valid: true, errors: [] };
      const errors = [];
      if (!residualInput.value) errors.push(t('event.residualHeight'));
      if (!minDaysInput.value) errors.push(t('event.recoveryMinDays'));
      if (!maxDaysInput.value) errors.push(t('event.recoveryMaxDays'));
      return { valid: errors.length === 0, errors };
    },
  };
}
