/** @file BCS recording sheet — CP-33. Reusable per V2_UX_FLOWS.md §14.3. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getById, add } from '../../data/store.js';
import * as BcsScoreEntity from '../../entities/animal-bcs-score.js';

let bcsSheet = null;

/**
 * Open the BCS scoring sheet for a specific animal.
 * @param {object} animal — The animal record
 * @param {string} operationId
 */
export function openBcsSheet(animal, operationId) {
  if (!bcsSheet) bcsSheet = new Sheet('bcs-sheet-wrap');
  const panel = document.getElementById('bcs-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const displayName = animal.tagNum || animal.name || animal.eid || animal.id.slice(0, 8);

  // Determine scale from species (A32: cattle 1–9, sheep/goat 1–5)
  const cls = animal.classId ? getById('animalClasses', animal.classId) : null;
  const species = cls?.species || 'beef_cattle';
  const maxScore = (species === 'sheep' || species === 'goat') ? 5 : 9;

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('health.bcsTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-3)' } }, [
    `${displayName} (1–${maxScore})`,
  ]));

  // Score
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.bcsScore')]));
  const scoreInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    min: '1', max: String(maxScore), step: '0.5', value: '',
    'data-testid': 'bcs-sheet-score',
  });
  panel.appendChild(scoreInput);
  panel.appendChild(el('div', { className: 'form-hint' }, [t('health.bcsScaleHint')]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.bcsDate')]));
  const dateInput = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'bcs-sheet-date',
  });
  panel.appendChild(dateInput);

  // Likely cull
  const cullCheckbox = el('input', { type: 'checkbox', 'data-testid': 'bcs-sheet-cull' });
  panel.appendChild(el('label', {
    className: 'form-label',
    style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer', marginTop: 'var(--space-4)' },
  }, [cullCheckbox, t('health.bcsLikelyCull')]));

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.bcsNotes')]));
  const notesInput = el('textarea', {
    className: 'auth-input', value: '',
    'data-testid': 'bcs-sheet-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'bcs-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green', 'data-testid': 'bcs-sheet-save',
      onClick: () => {
        clear(statusEl);
        const score = parseFloat(scoreInput.value);
        if (!score || score < 1 || score > maxScore) {
          statusEl.appendChild(el('span', {}, [t('validation.bcsScoreRange', { max: maxScore })]));
          return;
        }
        try {
          const record = BcsScoreEntity.create({
            operationId,
            animalId: animal.id,
            scoredAt: new Date(dateInput.value + 'T12:00:00Z').toISOString(),
            score,
            likelyCull: cullCheckbox.checked,
            notes: notesInput.value.trim() || null,
          });
          add('animalBcsScores', record, BcsScoreEntity.validate,
            BcsScoreEntity.toSupabaseShape, 'animal_bcs_scores');
          bcsSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline', onClick: () => bcsSheet.close(),
    }, [t('action.cancel')]),
  ]));

  bcsSheet.open();
}

/** Sheet markup — call from parent screen to ensure DOM element exists. */
export function renderBcsSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'bcs-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => bcsSheet && bcsSheet.close() }),
    el('div', { className: 'sheet-panel', id: 'bcs-sheet-panel' }),
  ]);
}
