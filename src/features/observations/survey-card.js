/**
 * @file Survey observation card (OI-0112).
 *
 * Variant C. Used by Individual Survey + Bulk Survey Entry (surface #6).
 *
 * Shape: pre-graze fields (height, cover, bale rings, quality, condition)
 * + recovery window + notes. A survey is a readiness assessment — pre-graze
 * fields answer "what's growing here now" and recovery days answer "when
 * do we expect to come back." The combo is the readiness decision.
 */

import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import {
  getUnitSystem, renderHeader, renderForageStateRow, renderQualitySlider,
  renderConditionChips, renderRecoveryWindow, renderNotes,
  heightInputToCm, parseIntOrNull,
} from './_shared.js';

export function renderSurveyCard({ farmSettings = null, paddockAcres = null, initialValues = {} } = {}) {
  const required = !!farmSettings?.recoveryRequired;
  const unitSys = getUnitSystem();

  const header = renderHeader('event.surveyObs', required);
  const state = renderForageStateRow({ farmSettings, paddockAcres, initialValues, unitSys });
  const quality = renderQualitySlider(initialValues.forageQuality);
  const condition = renderConditionChips(initialValues.forageCondition);
  const recovery = renderRecoveryWindow(
    initialValues.recoveryMinDays ?? farmSettings?.defaultRecoveryMinDays ?? null,
    initialValues.recoveryMaxDays ?? farmSettings?.defaultRecoveryMaxDays ?? null,
  );
  const notes = renderNotes(initialValues.notes);

  const container = el('div', {
    className: 'obs-fields obs-survey-card',
    'data-testid': 'obs-survey-card',
  }, [header, state.container, quality.container, condition.container, recovery.container, notes.container]);

  return {
    container,
    // OI-0114 NC-1: late-bind paddockAcres after a location is picked.
    setPaddockAcres: state.setPaddockAcres,
    getValues() {
      const coverPct = parseFloat(state.coverInput.value);
      return {
        forageHeightCm: heightInputToCm(state.heightInput.value, unitSys),
        forageCoverPct: !isNaN(coverPct) ? coverPct : null,
        forageQuality: parseIntOrNull(quality.input.value),
        forageCondition: condition.getValue(),
        baleRingResidueCount: parseIntOrNull(state.baleRingInput.value),
        recoveryMinDays: parseIntOrNull(recovery.minInput.value),
        recoveryMaxDays: parseIntOrNull(recovery.maxInput.value),
        notes: notes.input.value.trim() || null,
      };
    },
    validate() {
      if (!required) return { valid: true, errors: [] };
      const errors = [];
      if (!state.heightInput.value) errors.push(t('event.forageHeight'));
      if (!state.coverInput.value) errors.push(t('event.forageCover'));
      return { valid: errors.length === 0, errors };
    },
  };
}
