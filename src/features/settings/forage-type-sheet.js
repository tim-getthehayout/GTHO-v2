/**
 * @file Forage Type edit sheet (OI-0125 / SP-13).
 *
 * Opens in Add mode (`forageType === null`) or Edit mode (existing record).
 * Uses the OI-0111 unit-aware descriptor pattern via `./unit-descriptor.js`.
 *
 * Field set is fixed (all 14 entity columns minus createdAt/updatedAt/id/
 * operationId/archived/isSeeded — the last two are system-controlled). The
 * `name` and `notes` fields fall outside the numeric descriptor flow and are
 * handled inline below. Seeded badge is read-only; editing a seeded row does
 * NOT change `is_seeded` (Tim confirmed — seeded defaults are overridable).
 *
 * Round-trip contract: `dmKgPerCmPerHa` (new `dmYieldDensity` family) and
 * `minResidualHeightCm` (`length` family) must round-trip at display precision.
 * See `tests/unit/forage-types-settings-ui.test.js`.
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { add, update, getOperation } from '../../data/store.js';
import {
  create as createForageType,
  validate as validateForageType,
  toSupabaseShape as ftToSb,
} from '../../entities/forage-type.js';
import {
  composeFieldLabel, toDisplayValue, toStoredValue, formatDisplayValue, stepForField,
} from './unit-descriptor.js';

/**
 * Numeric + unit-aware descriptors. The text fields (`name`, `notes`) and the
 * read-only `isSeeded` badge are rendered separately below.
 */
export const FORAGE_FIELD_DESCRIPTORS = [
  {
    key: 'dmPct', labelKey: 'forageType.dmPct',
    measureType: null, unitLabelKey: 'unit.pct',
    precision: { metric: 0, imperial: 0 },
  },
  {
    key: 'nPerTonneDm', labelKey: 'forageType.nLabel',
    measureType: null, unitLabelKey: 'forageType.kgPerTDm',
    precision: { metric: 1, imperial: 1 },
  },
  {
    key: 'pPerTonneDm', labelKey: 'forageType.pLabel',
    measureType: null, unitLabelKey: 'forageType.kgPerTDm',
    precision: { metric: 1, imperial: 1 },
  },
  {
    key: 'kPerTonneDm', labelKey: 'forageType.kLabel',
    measureType: null, unitLabelKey: 'forageType.kgPerTDm',
    precision: { metric: 1, imperial: 1 },
  },
  {
    key: 'dmKgPerCmPerHa',
    labelKey: 'forageType.dmYieldLabelMetric',
    labelKeyByUnit: {
      imperial: 'forageType.dmYieldLabelImperial',
      metric: 'forageType.dmYieldLabelMetric',
    },
    measureType: 'dmYieldDensity',
    parenUnitType: 'weight', // paren shows just "lbs" / "kg" — base label embeds per-in-per-ac
    precision: { metric: 1, imperial: 0 },
  },
  {
    key: 'minResidualHeightCm', labelKey: 'forageType.minResidual',
    measureType: 'length',
    precision: { metric: 1, imperial: 1 },
  },
  {
    key: 'utilizationPct', labelKey: 'forageType.utilization',
    measureType: null, unitLabelKey: 'unit.pct',
    precision: { metric: 0, imperial: 0 },
  },
];

let forageSheet = null;

/**
 * Static sheet markup — mounted once from `renderSettingsScreen`.
 */
export function renderForageTypeSheetMarkup() {
  return el('div', { id: 'forage-type-sheet-wrap', className: 'sheet-wrap' }, [
    el('div', { className: 'sheet-backdrop' }),
    el('div', { className: 'sheet-panel', id: 'forage-type-sheet-panel' }),
  ]);
}

/**
 * Open the sheet in Add (`forageType === null`) or Edit mode.
 * @param {object|null} forageType - entity record, or null for Add
 * @param {string} operationId
 * @param {() => void} [onSaved] - callback to re-render list after save
 */
export function openForageTypeSheet(forageType, operationId, onSaved) {
  if (!forageSheet) forageSheet = new Sheet('forage-type-sheet-wrap');
  const panel = document.getElementById('forage-type-sheet-panel');
  if (!panel) return;

  const unitSystem = getOperation()?.unitSystem ?? 'imperial';
  const isEdit = !!forageType;
  const record = forageType ?? createForageType({ operationId });

  clear(panel);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    t(isEdit ? 'forageType.editSheetTitle' : 'forageType.addSheetTitle'),
  ]));

  if (record.isSeeded) {
    panel.appendChild(el('div', { className: 'obs-badge', 'data-testid': 'forage-sheet-seeded-badge' }, [
      t('forageType.seededBadge'),
    ]));
  }

  panel.appendChild(el('div', { className: 'form-hint', style: { marginBottom: 'var(--space-3)' } }, [
    t('forageType.editSheetSubtitle'),
  ]));

  // Name (text, required)
  const nameInput = el('input', {
    type: 'text',
    className: 'auth-input settings-input',
    value: record.name ?? '',
    placeholder: t('forageType.namePlaceholder'),
    'data-testid': 'forage-sheet-name',
  });
  panel.appendChild(el('div', { className: 'settings-field' }, [
    el('label', { className: 'form-label' }, [t('forageType.name')]),
    nameInput,
  ]));

  // Numeric descriptors
  const inputs = { name: nameInput };
  for (const f of FORAGE_FIELD_DESCRIPTORS) {
    const displayVal = toDisplayValue(record[f.key], f, unitSystem);
    const input = el('input', {
      type: 'number',
      className: 'auth-input settings-input',
      value: formatDisplayValue(displayVal, f, unitSystem),
      step: stepForField(f, unitSystem),
      'data-testid': `forage-sheet-${f.key}`,
    });
    inputs[f.key] = input;
    panel.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'form-label' }, [composeFieldLabel(f, unitSystem)]),
      input,
    ]));
  }

  // Notes (textarea)
  const notesInput = el('textarea', {
    className: 'auth-input settings-input',
    placeholder: t('forageType.notesPlaceholder'),
    rows: '3',
    'data-testid': 'forage-sheet-notes',
  });
  notesInput.value = record.notes ?? '';
  inputs.notes = notesInput;
  panel.appendChild(el('div', { className: 'settings-field' }, [
    el('label', { className: 'form-label' }, [t('forageType.notes')]),
    notesInput,
  ]));

  const statusEl = el('div', { className: 'auth-info', 'data-testid': 'forage-sheet-status' });

  const actionsRow = el('div', { className: 'btn-row', style: { marginTop: 'var(--space-3)' } }, [
    el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': 'forage-sheet-cancel',
      onClick: () => forageSheet.close(),
    }, [t('action.cancel')]),
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': 'forage-sheet-save',
      onClick: () => {
        const rawName = (nameInput.value ?? '').trim();
        if (!rawName) {
          clear(statusEl);
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [t('forageType.nameRequired')]));
          return;
        }
        const changes = { name: rawName, notes: notesInput.value.trim() || null };
        for (const f of FORAGE_FIELD_DESCRIPTORS) {
          const raw = inputs[f.key].value;
          if (raw === '') { changes[f.key] = null; continue; }
          const parsed = parseFloat(raw);
          changes[f.key] = toStoredValue(parsed, f, unitSystem);
        }
        try {
          if (isEdit) {
            update('forageTypes', record.id, changes, validateForageType, ftToSb, 'forage_types');
          } else {
            const fresh = createForageType({ ...changes, operationId, isSeeded: false });
            add('forageTypes', fresh, validateForageType, ftToSb, 'forage_types');
          }
          clear(statusEl);
          statusEl.className = 'auth-info';
          statusEl.appendChild(el('span', {}, [t('forageType.saved')]));
          if (onSaved) onSaved();
          forageSheet.close();
        } catch (err) {
          clear(statusEl);
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
  ]);

  panel.appendChild(actionsRow);
  panel.appendChild(statusEl);

  forageSheet.open();
}
