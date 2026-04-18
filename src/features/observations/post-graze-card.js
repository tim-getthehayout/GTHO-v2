/**
 * @file Post-Graze observation card (OI-0112).
 *
 * Variant B. Used by:
 *   - Move wizard source / close section (surface #2)
 *   - Close Event sheet (surface #3)
 *   - Sub-move Close sheet (surface #5)
 *   - Event detail post-graze panel (surface #7)
 *
 * Fields: Residual Height · Recovery Window (Min–Max days) · Notes.
 * Notes is a new capability — no post-graze surface collected notes before OI-0112.
 * Post-graze validate() is always optional (the required pill never renders here).
 */

import { el } from '../../ui/dom.js';
import {
  getUnitSystem, renderHeader, renderResidualHeight, renderRecoveryWindow, renderNotes,
  heightInputToCm, parseIntOrNull,
} from './_shared.js';

export function renderPostGrazeCard({ farmSettings = null, initialValues = {} } = {}) {
  const unitSys = getUnitSystem();

  // Seed recovery defaults from farm settings when the caller doesn't pass them.
  const initMin = initialValues.recoveryMinDays ?? farmSettings?.defaultRecoveryMinDays ?? null;
  const initMax = initialValues.recoveryMaxDays ?? farmSettings?.defaultRecoveryMaxDays ?? null;
  const initResidualCm = initialValues.residualHeightCm
    ?? initialValues.postGrazeHeightCm
    ?? farmSettings?.defaultResidualHeightCm
    ?? null;

  const header = renderHeader('event.postGrazeObs', false);
  const residual = renderResidualHeight(initResidualCm, unitSys);
  const recovery = renderRecoveryWindow(initMin, initMax);
  const notes = renderNotes(initialValues.notes);

  const container = el('div', {
    className: 'obs-fields obs-post-graze-card',
    'data-testid': 'obs-post-graze-card',
  }, [header, residual.container, recovery.container, notes.container]);

  return {
    container,
    getValues() {
      return {
        residualHeightCm: heightInputToCm(residual.input.value, unitSys),
        recoveryMinDays: parseIntOrNull(recovery.minInput.value),
        recoveryMaxDays: parseIntOrNull(recovery.maxInput.value),
        notes: notes.input.value.trim() || null,
      };
    },
    validate() {
      return { valid: true, errors: [] };
    },
  };
}
