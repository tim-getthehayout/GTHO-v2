/** @file Survey screen — CP-31. Survey create, draft entries, commit to observations. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { unitLabel } from '../../utils/units.js';
import * as SurveyEntity from '../../entities/survey.js';
import * as DraftEntryEntity from '../../entities/survey-draft-entry.js';
import * as ObservationEntity from '../../entities/paddock-observation.js';

let unsubs = [];

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderSurveysScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('survey.title')]));
    return;
  }

  const operationId = operations[0].id;

  const screenEl = el('div', { 'data-testid': 'surveys-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('survey.title')]),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'surveys-create-btn',
        onClick: () => openCreateSurveySheet(operationId),
      }, [t('survey.createSurvey')]),
    ]),
    el('div', { 'data-testid': 'surveys-list' }),

    // Create survey sheet
    el('div', { className: 'sheet-wrap', id: 'create-survey-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => createSurveySheet && createSurveySheet.close() }),
      el('div', { className: 'sheet-panel', id: 'create-survey-sheet-panel' }),
    ]),

    // Draft entry sheet
    el('div', { className: 'sheet-wrap', id: 'draft-entry-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => draftEntrySheet && draftEntrySheet.close() }),
      el('div', { className: 'sheet-panel', id: 'draft-entry-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderSurveyList(container, operationId);

  unsubs.push(subscribe('surveys', () => renderSurveyList(container, operationId)));
  unsubs.push(subscribe('surveyDraftEntries', () => renderSurveyList(container, operationId)));
}

// ---------------------------------------------------------------------------
// Survey list
// ---------------------------------------------------------------------------

function renderSurveyList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="surveys-list"]');
  if (!listEl) return;
  clear(listEl);

  const surveys = getAll('surveys');
  if (!surveys.length) {
    listEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'surveys-empty' }, [t('survey.empty')]));
    return;
  }

  const sorted = [...surveys].sort((a, b) => (b.surveyDate || '').localeCompare(a.surveyDate || ''));
  const list = el('div', { className: 'event-list' });

  for (const survey of sorted) {
    const entries = getAll('surveyDraftEntries').filter(e => e.surveyId === survey.id);
    const isDraft = survey.status === 'draft';

    list.appendChild(el('div', {
      className: 'card',
      style: { padding: '14px 16px', marginBottom: 'var(--space-3)' },
      'data-testid': `surveys-card-${survey.id}`,
    }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', {}, [
          el('div', { style: { fontWeight: '600', fontSize: '15px' } }, [
            survey.surveyDate + ` (${survey.type})`,
          ]),
          el('div', { className: 'form-hint' }, [
            `${entries.length} entries`,
          ]),
        ]),
        el('span', {
          className: `badge ${isDraft ? 'badge-amber' : 'badge-green'}`,
        }, [isDraft ? t('survey.status.draft') : t('survey.status.committed')]),
      ]),

      // Actions for drafts
      isDraft ? el('div', { className: 'btn-row', style: { marginTop: 'var(--space-3)' } }, [
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `surveys-add-entry-${survey.id}`,
          onClick: () => openDraftEntrySheet(survey, null, operationId),
        }, [t('survey.addEntry')]),
        el('button', {
          className: 'btn btn-green btn-xs',
          'data-testid': `surveys-finish-${survey.id}`,
          onClick: () => commitSurvey(survey, operationId),
        }, [t('survey.finishSurvey')]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `surveys-delete-${survey.id}`,
          onClick: () => {
            if (window.confirm(t('survey.confirmDelete'))) {
              // Delete entries first
              for (const e of entries) remove('surveyDraftEntries', e.id, 'survey_draft_entries');
              remove('surveys', survey.id, 'surveys');
            }
          },
        }, [t('action.delete')]),
      ]) : null,

      // Show entries
      entries.length ? el('div', { style: { marginTop: 'var(--space-3)' } },
        entries.map(entry => {
          const loc = getById('locations', entry.locationId);
          const locName = loc ? loc.name : '?';
          const details = [];
          if (entry.forageHeightCm != null) details.push(`${entry.forageHeightCm} cm`);
          if (entry.forageCoverPct != null) details.push(`${entry.forageCoverPct}% cover`);
          if (entry.forageCondition) details.push(entry.forageCondition);

          return el('div', {
            className: 'ft-row',
            'data-testid': `surveys-entry-${entry.id}`,
          }, [
            el('div', {}, [
              el('div', { className: 'ft-row-name' }, [locName]),
              details.length ? el('div', { className: 'ft-row-detail' }, [details.join(' · ')]) : null,
            ].filter(Boolean)),
            isDraft ? el('button', {
              className: 'btn btn-outline btn-xs',
              onClick: () => openDraftEntrySheet(survey, entry, operationId),
            }, [t('action.edit')]) : null,
          ].filter(Boolean));
        })
      ) : null,
    ].filter(Boolean)));
  }

  listEl.appendChild(list);
}

// ---------------------------------------------------------------------------
// Create survey sheet
// ---------------------------------------------------------------------------

let createSurveySheet = null;

function openCreateSurveySheet(operationId) {
  if (!createSurveySheet) {
    createSurveySheet = new Sheet('create-survey-sheet-wrap');
  }

  const panel = document.getElementById('create-survey-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};
  const typeState = { value: 'bulk' };

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('survey.createSurvey')]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.surveyDate')]));
  inputs.date = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'create-survey-date',
  });
  panel.appendChild(inputs.date);

  // Type
  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.selectType')]));
  const typeRow = el('div', { className: 'btn-row' });
  const renderTypeButtons = () => {
    clear(typeRow);
    typeRow.appendChild(el('button', {
      className: `btn btn-sm ${typeState.value === 'bulk' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'create-survey-type-bulk',
      onClick: () => { typeState.value = 'bulk'; renderTypeButtons(); },
    }, [t('survey.typeBulk')]));
    typeRow.appendChild(el('button', {
      className: `btn btn-sm ${typeState.value === 'single' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'create-survey-type-single',
      onClick: () => { typeState.value = 'single'; renderTypeButtons(); },
    }, [t('survey.typeSingle')]));
  };
  renderTypeButtons();
  panel.appendChild(typeRow);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'create-survey-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'create-survey-save',
      onClick: () => {
        clear(statusEl);
        try {
          const survey = SurveyEntity.create({
            operationId,
            surveyDate: inputs.date.value,
            type: typeState.value,
          });
          add('surveys', survey, SurveyEntity.validate, SurveyEntity.toSupabaseShape, 'surveys');

          // For bulk surveys, auto-create draft entries for all land locations
          if (typeState.value === 'bulk') {
            const locations = getAll('locations').filter(l => !l.archived && l.type === 'land');
            for (const loc of locations) {
              const entry = DraftEntryEntity.create({ surveyId: survey.id, locationId: loc.id });
              add('surveyDraftEntries', entry, DraftEntryEntity.validate,
                DraftEntryEntity.toSupabaseShape, 'survey_draft_entries');
            }
          }

          createSurveySheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'create-survey-cancel',
      onClick: () => createSurveySheet.close(),
    }, [t('action.cancel')]),
  ]));

  createSurveySheet.open();
}

// ---------------------------------------------------------------------------
// Draft entry sheet
// ---------------------------------------------------------------------------

let draftEntrySheet = null;

function openDraftEntrySheet(survey, existingEntry, _operationId) {
  if (!draftEntrySheet) {
    draftEntrySheet = new Sheet('draft-entry-sheet-wrap');
  }

  const panel = document.getElementById('draft-entry-sheet-panel');
  if (!panel) return;
  clear(panel);

  const unitSys = getUnitSystem();
  const inputs = {};
  const isEdit = !!existingEntry;

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('survey.editSurvey') : t('survey.addEntry'),
  ]));

  // Location picker (for new entries on single surveys)
  if (!isEdit) {
    const locations = getAll('locations').filter(l => !l.archived && l.type === 'land');
    panel.appendChild(el('label', { className: 'form-label' }, [t('event.selectLocation')]));
    inputs.locationId = el('select', {
      className: 'auth-select', 'data-testid': 'draft-entry-location',
    }, locations.map(l => el('option', { value: l.id }, [l.name])));
    panel.appendChild(inputs.locationId);
  } else {
    const loc = getById('locations', existingEntry.locationId);
    panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-3)' } }, [
      loc ? loc.name : '',
    ]));
  }

  // Forage height
  const heightLabel = `${t('survey.forageHeight')} (${unitLabel('length', unitSys)})`;
  panel.appendChild(el('label', { className: 'form-label' }, [heightLabel]));
  inputs.forageHeightCm = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existingEntry?.forageHeightCm ?? '',
    'data-testid': 'draft-entry-height',
  });
  panel.appendChild(inputs.forageHeightCm);

  // Forage cover %
  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.forageCover')]));
  inputs.forageCoverPct = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existingEntry?.forageCoverPct ?? '',
    'data-testid': 'draft-entry-cover',
  });
  panel.appendChild(inputs.forageCoverPct);

  // Forage quality (numeric slider-like input)
  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.forageQuality')]));
  inputs.forageQuality = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existingEntry?.forageQuality ?? '',
    'data-testid': 'draft-entry-quality',
  });
  panel.appendChild(inputs.forageQuality);

  // Forage condition
  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.forageCondition')]));
  inputs.forageCondition = el('select', {
    className: 'auth-select', 'data-testid': 'draft-entry-condition',
  }, [
    el('option', { value: '' }, ['—']),
    el('option', { value: 'poor' }, [t('survey.conditionPoor')]),
    el('option', { value: 'fair' }, [t('survey.conditionFair')]),
    el('option', { value: 'good' }, [t('survey.conditionGood')]),
    el('option', { value: 'excellent' }, [t('survey.conditionExcellent')]),
  ]);
  if (existingEntry?.forageCondition) inputs.forageCondition.value = existingEntry.forageCondition;
  panel.appendChild(inputs.forageCondition);

  // Bale ring residue
  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.baleRingResidue')]));
  inputs.baleRingResidueCount = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existingEntry?.baleRingResidueCount ?? '',
    'data-testid': 'draft-entry-residue',
  });
  panel.appendChild(inputs.baleRingResidueCount);

  // Recovery days
  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.recoveryMin')]));
  inputs.recoveryMinDays = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existingEntry?.recoveryMinDays ?? '',
    'data-testid': 'draft-entry-recovery-min',
  });
  panel.appendChild(inputs.recoveryMinDays);

  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.recoveryMax')]));
  inputs.recoveryMaxDays = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existingEntry?.recoveryMaxDays ?? '',
    'data-testid': 'draft-entry-recovery-max',
  });
  panel.appendChild(inputs.recoveryMaxDays);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('survey.notes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input', value: existingEntry?.notes || '',
    'data-testid': 'draft-entry-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'draft-entry-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'draft-entry-save',
      onClick: () => saveDraftEntry(survey, existingEntry, inputs, statusEl),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'draft-entry-cancel',
      onClick: () => draftEntrySheet.close(),
    }, [t('action.cancel')]),
  ]));

  draftEntrySheet.open();
}

function saveDraftEntry(survey, existingEntry, inputs, statusEl) {
  clear(statusEl);
  const parseNum = (input) => {
    const v = input.value;
    return v === '' ? null : parseFloat(v);
  };

  const data = {
    surveyId: survey.id,
    locationId: existingEntry ? existingEntry.locationId : inputs.locationId.value,
    forageHeightCm: parseNum(inputs.forageHeightCm),
    forageCoverPct: parseNum(inputs.forageCoverPct),
    forageQuality: parseNum(inputs.forageQuality),
    forageCondition: inputs.forageCondition.value || null,
    baleRingResidueCount: parseNum(inputs.baleRingResidueCount),
    recoveryMinDays: parseNum(inputs.recoveryMinDays),
    recoveryMaxDays: parseNum(inputs.recoveryMaxDays),
    notes: inputs.notes.value.trim() || null,
  };

  try {
    if (existingEntry) {
      update('surveyDraftEntries', existingEntry.id, data,
        DraftEntryEntity.validate, DraftEntryEntity.toSupabaseShape, 'survey_draft_entries');
    } else {
      const entry = DraftEntryEntity.create(data);
      add('surveyDraftEntries', entry, DraftEntryEntity.validate,
        DraftEntryEntity.toSupabaseShape, 'survey_draft_entries');
    }
    draftEntrySheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}

// ---------------------------------------------------------------------------
// Commit survey → paddock observations
// ---------------------------------------------------------------------------

function commitSurvey(survey, operationId) {
  if (!window.confirm(t('survey.finishConfirm'))) return;

  const entries = getAll('surveyDraftEntries').filter(e => e.surveyId === survey.id);
  const now = new Date().toISOString();

  for (const entry of entries) {
    // Create paddock observation from draft entry
    const obs = ObservationEntity.create({
      operationId,
      locationId: entry.locationId,
      observedAt: survey.surveyDate ? new Date(survey.surveyDate + 'T12:00:00Z').toISOString() : now,
      type: 'open',
      source: 'survey',
      sourceId: survey.id,
      forageHeightCm: entry.forageHeightCm,
      forageCoverPct: entry.forageCoverPct,
      forageQuality: entry.forageQuality,
      forageCondition: entry.forageCondition,
      baleRingResidueCount: entry.baleRingResidueCount,
      recoveryMinDays: entry.recoveryMinDays,
      recoveryMaxDays: entry.recoveryMaxDays,
      notes: entry.notes,
    });
    add('paddockObservations', obs, ObservationEntity.validate,
      ObservationEntity.toSupabaseShape, 'paddock_observations');
  }

  // Mark survey as committed
  update('surveys', survey.id, { status: 'committed' },
    SurveyEntity.validate, SurveyEntity.toSupabaseShape, 'surveys');
}
