/**
 * @file Pre-Graze observation card (OI-0112).
 *
 * Variant A of the three observation cards. Used by:
 *   - Move wizard destination (surface #1)
 *   - Sub-move Open sheet (surface #4)
 *   - Event detail pre-graze panel (surface #7)
 *
 * Contract: `{ container, getValues, validate }`. getValues() returns a
 * subset of paddock_observations columns. Callers persist via
 * createObservation(... type: 'open', source: 'event') for event-originated
 * rows; survey uses renderSurveyCard instead.
 */

import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import {
  getUnitSystem, renderHeader, renderForageStateRow, renderQualitySlider,
  renderConditionChips, renderNotes, heightInputToCm, parseIntOrNull,
} from './_shared.js';

export function renderPreGrazeCard({ farmSettings = null, paddockAcres = null, initialValues = {} } = {}) {
  const required = !!farmSettings?.recoveryRequired;
  const unitSys = getUnitSystem();

  const header = renderHeader('event.preGrazeObs', required);
  const state = renderForageStateRow({ farmSettings, paddockAcres, initialValues, unitSys });
  const quality = renderQualitySlider(initialValues.forageQuality);
  const condition = renderConditionChips(initialValues.forageCondition);
  const notes = renderNotes(initialValues.notes);

  const container = el('div', {
    className: 'obs-fields paddock-card obs-pre-graze-card',
    'data-testid': 'obs-pre-graze-card',
  }, [header, state.container, quality.container, condition.container, notes.container]);

  return {
    container,
    getValues() {
      const coverPct = parseFloat(state.coverInput.value);
      return {
        forageHeightCm: heightInputToCm(state.heightInput.value, unitSys),
        forageCoverPct: !isNaN(coverPct) ? coverPct : null,
        forageQuality: parseIntOrNull(quality.input.value),
        forageCondition: condition.getValue(),
        baleRingResidueCount: parseIntOrNull(state.baleRingInput.value),
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
