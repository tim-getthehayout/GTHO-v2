/** @file Settings screen — farm settings, user prefs, account, sync status, backup */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, update, getSyncAdapter, getOperation, setUnitSystem } from '../../data/store.js';
import { convert, unitLabel } from '../../utils/units.js';
import { canExport, exportOperationBackup, downloadBackup } from '../../data/backup-export.js';
import { validateBackup, getBackupPreview, importOperationBackup } from '../../data/backup-import.js';
import { pushAllToSupabase } from '../../data/push-all.js';
import { validate as validateFarmSetting, toSupabaseShape as fsToSb } from '../../entities/farm-setting.js';
import { validate as validateUserPref, toSupabaseShape as prefToSb } from '../../entities/user-preference.js';
import { FIELD_MODULES, FIELD_MODULES_DEFAULT } from '../field-mode/index.js';
import { getUser } from '../auth/session.js';
import { logout } from '../auth/session.js';
import {
  renderAiBullsSection, renderTreatmentCategoriesSection,
  renderTreatmentTypesSection, renderDoseUnitsSection,
  renderHealthRefSheetMarkups,
} from '../health/reference-tables.js';
import {
  renderProductCategoriesSection, renderProductsSection,
  renderSpreadersSection, renderProductUnitsSection,
  renderAmendmentRefSheetMarkups,
} from '../amendments/reference-tables.js';
import { renderV1ImportButton } from './v1-import.js';
import { openMemberManagementSheet, getCurrentUserRole, getMemberCount, renderMemberSheetMarkup } from './member-management.js';

/**
 * Render the settings screen.
 * @param {HTMLElement} container
 */
export function renderSettingsScreen(container) {
  const farmSettings = getAll('farmSettings')[0];
  const userPrefs = getAll('userPreferences')[0];

  if (!farmSettings || !userPrefs) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('settings.title')]));
    container.appendChild(el('p', {}, [t('error.generic')]));
    return;
  }

  const operationId = getAll('operations')[0]?.id;

  const sections = el('div', { className: 'settings-sections', 'data-testid': 'settings-screen' }, [
    el('h1', { className: 'screen-heading' }, [t('settings.title')]),
    renderUnitSection(container),
    renderFarmSection(farmSettings, container),
    renderPrefSection(userPrefs, container),
    renderFieldModulesCard(container),
    renderMembersSection(operationId),
    // Health reference tables (CP-32)
    renderAiBullsSection(operationId),
    renderTreatmentCategoriesSection(operationId),
    renderTreatmentTypesSection(operationId),
    renderDoseUnitsSection(),
    // Amendment reference tables (CP-38)
    renderProductCategoriesSection(operationId),
    renderProductsSection(operationId),
    renderSpreadersSection(operationId),
    renderProductUnitsSection(),
    renderAccountSection(),
    renderSyncSection(),
    // Sheet markups for health reference tables
    ...renderHealthRefSheetMarkups(),
    ...renderAmendmentRefSheetMarkups(),
    renderMemberSheetMarkup(),
  ]);

  container.appendChild(sections);
}

function renderUnitSection(rootContainer) {
  const current = getOperation()?.unitSystem ?? 'imperial';

  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.unitSystem')]),
    el('div', { className: 'btn-row' }, [
      el('button', {
        className: `btn btn-sm ${current === 'metric' ? 'btn-green' : 'btn-outline'}`,
        'data-testid': 'settings-unit-metric',
        onClick: () => {
          setUnitSystem('metric');
          rerender(rootContainer);
        },
      }, [t('settings.metric')]),
      el('button', {
        className: `btn btn-sm ${current === 'imperial' ? 'btn-green' : 'btn-outline'}`,
        'data-testid': 'settings-unit-imperial',
        onClick: () => {
          setUnitSystem('imperial');
          rerender(rootContainer);
        },
      }, [t('settings.imperial')]),
    ]),
  ]);
}

/**
 * Field descriptor for renderFarmSection (OI-0111).
 *
 * Each entry declares how to convert between stored metric and user-facing
 * display unit on render + save:
 *   - measureType: null for unitless (%, days, score) OR 'weight' / 'length' for `convert()`
 *   - inverted: true for price-per-weight ($/kg ↔ $/lb — divide on display, multiply on save)
 *   - currency: true to compose the label as "label ($/unit)"
 *   - perDay: true to compose the label as "label (unit/AU/day)"
 *   - displayUnit: 'ft' forces length → ft instead of inches (bale-ring diameter)
 *   - unitLabelKey: i18n key for a static unit suffix when measureType is null
 *   - precision: decimals on display; inferred from spec §Precision if omitted
 *
 * Round-trip rule (spec §Precision): `display → save → reload → display`
 * must return the original input at the field's display precision. Stored
 * metric is the full JS float — never rounded or truncated on save.
 */
const FARM_FIELD_DESCRIPTORS = [
  { key: 'defaultAuWeightKg',         labelKey: 'settings.auWeight',         measureType: 'weight',  precision: { metric: 1, imperial: 0 } },
  { key: 'defaultResidualHeightCm',   labelKey: 'settings.residualHeight',   measureType: 'length',  precision: { metric: 1, imperial: 1 } },
  { key: 'defaultUtilizationPct',     labelKey: 'settings.utilizationPct',   measureType: null,      unitLabelKey: 'unit.pct',  precision: { metric: 0, imperial: 0 } },
  { key: 'defaultRecoveryMinDays',    labelKey: 'settings.recoveryMinDays',  measureType: null,      unitLabelKey: 'unit.days', precision: { metric: 0, imperial: 0 } },
  { key: 'defaultRecoveryMaxDays',    labelKey: 'settings.recoveryMaxDays',  measureType: null,      unitLabelKey: 'unit.days', precision: { metric: 0, imperial: 0 } },
  { key: 'nPricePerKg',               labelKey: 'settings.nPrice',           measureType: 'weight',  inverted: true, currency: true, precision: { metric: 4, imperial: 4 } },
  { key: 'pPricePerKg',               labelKey: 'settings.pPrice',           measureType: 'weight',  inverted: true, currency: true, precision: { metric: 4, imperial: 4 } },
  { key: 'kPricePerKg',               labelKey: 'settings.kPrice',           measureType: 'weight',  inverted: true, currency: true, precision: { metric: 4, imperial: 4 } },
  { key: 'defaultManureRateKgPerDay', labelKey: 'settings.manureRate',       measureType: 'weight',  perDay: true,   precision: { metric: 1, imperial: 0 } },
  { key: 'feedDayGoal',               labelKey: 'settings.feedDayGoal',      measureType: null,      unitLabelKey: 'unit.days', precision: { metric: 0, imperial: 0 } },
  { key: 'forageQualityScaleMin',     labelKey: 'settings.forageQualityMin', measureType: null,      unitLabelKey: null, precision: { metric: 0, imperial: 0 } },
  { key: 'forageQualityScaleMax',     labelKey: 'settings.forageQualityMax', measureType: null,      unitLabelKey: null, precision: { metric: 0, imperial: 0 } },
  { key: 'baleRingResidueDiameterCm', labelKey: 'settings.baleRingDiameter', measureType: 'length',  displayUnit: 'ft', precision: { metric: 1, imperial: 1 } },
];

/**
 * Compose the display label for a field: "Base Label (unit)".
 * @param {object} f - descriptor entry
 * @param {'metric'|'imperial'} unitSystem
 */
function composeFieldLabel(f, unitSystem) {
  const base = t(f.labelKey);
  if (f.measureType === null) {
    if (!f.unitLabelKey) return base;
    return `${base} (${t(f.unitLabelKey)})`;
  }
  if (f.currency) {
    // $/kg ↔ $/lb — use the weight unit label.
    const wu = unitLabel('weight', unitSystem);
    return `${base} ($/${wu})`;
  }
  if (f.perDay) {
    const wu = unitLabel('weight', unitSystem);
    return `${base} (${wu}/AU/day)`;
  }
  if (f.displayUnit === 'ft') {
    // Metric side still shows cm; imperial side shows ft.
    return unitSystem === 'imperial'
      ? `${base} (${t('unit.ft')})`
      : `${base} (${unitLabel(f.measureType, unitSystem)})`;
  }
  return `${base} (${unitLabel(f.measureType, unitSystem)})`;
}

/**
 * Convert stored metric → user-facing display value.
 * Returns a Number (or null). Rendering code formats to precision.
 */
function toDisplayValue(storedValue, f, unitSystem) {
  if (storedValue == null) return null;
  if (f.measureType === null) return storedValue;
  if (unitSystem === 'metric') {
    if (f.displayUnit === 'ft') {
      // Stored in cm; display metric still shows cm.
      return storedValue;
    }
    return storedValue;
  }
  // imperial
  if (f.inverted) {
    // $/kg → $/lb: divide stored by factor so e.g. 1.21 $/kg → ~0.5489 $/lb.
    // convert() multiplies by factor for toImperial; we invert that by dividing.
    const factorKgToLbs = convert(1, 'weight', 'toImperial'); // 2.20462
    return storedValue / factorKgToLbs;
  }
  if (f.displayUnit === 'ft') {
    // cm → in → ft.
    return convert(storedValue, f.measureType, 'toImperial') / 12;
  }
  return convert(storedValue, f.measureType, 'toImperial');
}

/**
 * Convert user-facing entered value → stored metric.
 * Returns a Number (full JS float, no rounding — spec §Precision).
 */
function toStoredValue(inputNumber, f, unitSystem) {
  if (inputNumber == null || isNaN(inputNumber)) return null;
  if (f.measureType === null) return inputNumber;
  if (unitSystem === 'metric') return inputNumber;
  // imperial
  if (f.inverted) {
    // $/lb entered → $/kg stored: multiply by factor.
    const factorKgToLbs = convert(1, 'weight', 'toImperial');
    return inputNumber * factorKgToLbs;
  }
  if (f.displayUnit === 'ft') {
    // ft entered → in → cm.
    return convert(inputNumber * 12, f.measureType, 'toMetric');
  }
  return convert(inputNumber, f.measureType, 'toMetric');
}

/**
 * Format a display value to the field's precision. null → ''.
 */
function formatDisplayValue(displayValue, f, unitSystem) {
  if (displayValue == null) return '';
  const decimals = f.precision?.[unitSystem] ?? 1;
  return displayValue.toFixed(decimals);
}

/**
 * Derive the `step` attribute for the input from precision.
 */
function stepForField(f, unitSystem) {
  const decimals = f.precision?.[unitSystem] ?? 1;
  if (decimals <= 0) return '1';
  return (1 / Math.pow(10, decimals)).toString();
}

// Exported for unit tests (OI-0111 round-trip suite).
export const __settingsUnitInternals = {
  FARM_FIELD_DESCRIPTORS,
  composeFieldLabel,
  toDisplayValue,
  toStoredValue,
  formatDisplayValue,
  stepForField,
};

function renderFarmSection(fs, _rootContainer) {
  const unitSystem = getOperation()?.unitSystem ?? 'imperial';

  const inputs = {};

  const fieldEls = FARM_FIELD_DESCRIPTORS.map(f => {
    const displayVal = toDisplayValue(fs[f.key], f, unitSystem);
    const input = el('input', {
      type: 'number',
      className: 'auth-input settings-input',
      value: formatDisplayValue(displayVal, f, unitSystem),
      step: stepForField(f, unitSystem),
      'data-testid': `settings-farm-${f.key}`,
    });
    inputs[f.key] = input;
    return el('div', { className: 'settings-field' }, [
      el('label', { className: 'form-label' }, [composeFieldLabel(f, unitSystem)]),
      input,
    ]);
  });

  const recoveryCheckbox = el('input', {
    type: 'checkbox',
    checked: fs.recoveryRequired ? 'checked' : undefined,
    'data-testid': 'settings-farm-recoveryRequired',
  });
  const recoveryToggle = el('div', { className: 'settings-field' }, [
    el('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } }, [
      recoveryCheckbox,
      t('settings.recoveryRequired'),
    ]),
  ]);

  const statusEl = el('div', { className: 'auth-info', 'data-testid': 'settings-farm-status' });

  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.farmSettings')]),
    recoveryToggle,
    ...fieldEls,
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': 'settings-farm-save',
      onClick: () => {
        const changes = {};
        for (const f of FARM_FIELD_DESCRIPTORS) {
          const raw = inputs[f.key].value;
          if (raw === '') {
            changes[f.key] = null;
            continue;
          }
          const parsed = parseFloat(raw);
          // Full JS float preserved — no rounding on save (spec §Precision).
          changes[f.key] = toStoredValue(parsed, f, unitSystem);
        }
        changes.recoveryRequired = recoveryCheckbox.checked;
        try {
          update('farmSettings', fs.id, changes, validateFarmSetting, fsToSb, 'farm_settings');
          clear(statusEl);
          statusEl.className = 'auth-info';
          statusEl.appendChild(el('span', {}, [t('settings.saved')]));
        } catch (err) {
          clear(statusEl);
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    statusEl,
  ]);
}

function renderPrefSection(prefs, rootContainer) {
  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.userPreferences')]),
    el('div', { className: 'settings-field' }, [
      el('label', { className: 'form-label' }, [t('settings.viewMode')]),
      el('div', { className: 'btn-row' }, [
        el('button', {
          className: `btn btn-sm ${prefs.defaultViewMode === 'detail' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'settings-pref-detail',
          onClick: () => {
            update('userPreferences', prefs.id, { defaultViewMode: 'detail' }, validateUserPref, prefToSb, 'user_preferences');
            rerender(rootContainer);
          },
        }, [t('settings.viewDetail')]),
        el('button', {
          className: `btn btn-sm ${prefs.defaultViewMode === 'field' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'settings-pref-field',
          onClick: () => {
            update('userPreferences', prefs.id, { defaultViewMode: 'field' }, validateUserPref, prefToSb, 'user_preferences');
            rerender(rootContainer);
          },
        }, [t('settings.viewField')]),
      ]),
    ]),
    el('div', { className: 'settings-field' }, [
      el('label', { className: 'form-label' }, [t('settings.homeView')]),
      el('div', { className: 'btn-row' }, [
        el('button', {
          className: `btn btn-sm ${prefs.homeViewMode === 'groups' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'settings-pref-groups',
          onClick: () => {
            update('userPreferences', prefs.id, { homeViewMode: 'groups' }, validateUserPref, prefToSb, 'user_preferences');
            rerender(rootContainer);
          },
        }, [t('settings.homeGroups')]),
        el('button', {
          className: `btn btn-sm ${prefs.homeViewMode === 'locations' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'settings-pref-locations',
          onClick: () => {
            update('userPreferences', prefs.id, { homeViewMode: 'locations' }, validateUserPref, prefToSb, 'user_preferences');
            rerender(rootContainer);
          },
        }, [t('settings.homeLocations')]),
      ]),
    ]),
  ]);
}

function renderFieldModulesCard(rootContainer) {
  const user = getUser();
  const prefs = getAll('userPreferences').find(p => p.userId === user?.id);
  if (!prefs) return el('div');

  const activeKeys = prefs.fieldModeQuickActions || [...FIELD_MODULES_DEFAULT];

  const card = el('div', { className: 'card settings-card', style: { marginBottom: '10px' } });
  card.appendChild(el('h3', { className: 'settings-section-title' }, [t('fieldMode.modulesTitle')]));
  card.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' } }, [t('fieldMode.modulesHint')]));

  for (const mod of FIELD_MODULES) {
    const isOn = activeKeys.includes(mod.key);
    const row = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)' } }, [
      el('div', { style: { fontSize: '13px' } }, [`${mod.icon} ${t(mod.labelKey)}`]),
      el('button', {
        type: 'button',
        style: { padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${isOn ? 'var(--green)' : 'var(--border)'}`, background: isOn ? 'var(--green)' : 'transparent', color: isOn ? 'white' : 'var(--text2)' },
        onClick: () => {
          const newKeys = isOn ? activeKeys.filter(k => k !== mod.key) : [...activeKeys, mod.key];
          update('userPreferences', prefs.id, { fieldModeQuickActions: newKeys }, validateUserPref, prefToSb, 'user_preferences');
          // Re-render the card
          const parent = card.parentElement;
          if (parent) { const newCard = renderFieldModulesCard(rootContainer); card.replaceWith(newCard); }
        },
      }, [isOn ? '\u2713 On' : 'Off']),
    ]);
    card.appendChild(row);
  }

  return card;
}

function renderMembersSection(operationId) {
  const section = el('div', { className: 'card settings-card', 'data-testid': 'settings-members' }, [
    el('h3', { className: 'settings-section-title' }, [t('members.sectionTitle')]),
    el('div', { className: 'member-count-loading' }, [t('members.loading')]),
  ]);

  // Async load: determine role and member count
  (async () => {
    const role = await getCurrentUserRole(operationId);
    const count = await getMemberCount(operationId);
    const inner = section.querySelector('.member-count-loading');
    if (!inner) return;
    clear(section);
    section.appendChild(el('h3', { className: 'settings-section-title' }, [t('members.sectionTitle')]));

    if (role === 'owner' || role === 'admin') {
      section.appendChild(el('button', {
        className: 'btn btn-outline btn-sm',
        'data-testid': 'settings-members-btn',
        onClick: () => openMemberManagementSheet(operationId),
      }, [t('members.manage', { count })]));
    } else {
      section.appendChild(el('span', { className: 'form-hint' }, [
        t('members.countOnly', { count }),
      ]));
    }
  })();

  return section;
}

function renderAccountSection() {
  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.account')]),
    el('button', {
      className: 'btn btn-red btn-sm',
      'data-testid': 'settings-logout',
      onClick: () => logout(),
    }, [t('auth.logout')]),
  ]);
}

function renderSyncSection() {
  const adapter = getSyncAdapter();
  let status;
  try {
    status = adapter ? adapter.getStatus() : 'offline';
  } catch {
    status = 'offline';
  }

  const statusLabels = {
    idle: t('settings.syncIdle'),
    syncing: t('settings.syncSyncing'),
    error: t('settings.syncError'),
    offline: t('settings.syncOffline'),
  };

  const operation = getOperation();
  const opName = operation ? operation.name : '';

  // Export backup button (§20.3)
  const exportBtn = el('button', {
    className: 'btn btn-outline btn-sm',
    'data-testid': 'settings-export-backup-btn',
    onClick: () => handleExportClick(opName, operation),
  }, [t('settings.exportBackup')]);

  // Import backup button (§20.3)
  const fileInput = el('input', {
    type: 'file',
    accept: '.json',
    style: { display: 'none' },
    'data-testid': 'settings-import-file-input',
    onChange: (e) => handleImportFileSelect(e, operation),
  });

  const importBtn = el('button', {
    className: 'btn btn-outline btn-sm',
    'data-testid': 'settings-import-backup-btn',
    onClick: () => {
      const check = canExport(); // same gate as export
      if (!check.ok) {
        showExportToast(t('settings.exportSyncPending'));
        return;
      }
      fileInput.click();
    },
  }, [t('settings.importBackup')]);

  // v1 import button (CP-57 — §1.7)
  const sheetMount = el('div', { id: 'export-sheet-mount' });
  const v1ImportBtn = renderV1ImportButton(sheetMount, operation);

  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.syncAndData')]),
    el('div', { className: 'sync-status', 'data-testid': 'settings-sync-status' }, [
      el('span', { className: `sync-dot sync-${status}` }),
      el('span', {}, [statusLabels[status] || status]),
    ]),
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [exportBtn, importBtn, fileInput, v1ImportBtn]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      style: { marginTop: 'var(--space-3)' },
      'data-testid': 'settings-resync-btn',
      onClick: async (e) => {
        e.target.disabled = true;
        e.target.textContent = t('settings.resyncing');
        const { queued } = await pushAllToSupabase();
        e.target.textContent = t('settings.resyncDone', { count: queued });
        setTimeout(() => {
          e.target.textContent = t('settings.resync');
          e.target.disabled = false;
        }, 3000);
      },
    }, [t('settings.resync')]),
    // Export/import sheets mount here
    sheetMount,
  ]);
}

/**
 * Handle export button click — show confirm, then progress, then download.
 * @param {string} opName
 * @param {object} operation
 */
function handleExportClick(opName, operation) {
  const check = canExport();
  if (!check.ok) {
    showExportToast(t('settings.exportSyncPending'));
    return;
  }

  if (!operation) return;

  // Show confirm sheet
  const mount = document.getElementById('export-sheet-mount');
  if (!mount) return;
  clear(mount);

  const warningText = t('settings.exportPrivacyWarning');
  const confirmText = t('settings.exportConfirmBody').replace('{name}', opName);

  const confirmSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'export-confirm-sheet',
  }, [
    el('p', { style: { marginBottom: 'var(--space-3)' } }, [confirmText]),
    el('p', { style: { fontSize: '0.8125rem', color: 'var(--text2)', marginBottom: 'var(--space-4)' } }, [warningText]),
    el('div', { className: 'btn-row' }, [
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'export-confirm-btn',
        onClick: () => runExport(mount, operation),
      }, [t('settings.exportConfirm')]),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => clear(mount),
      }, [t('action.cancel')]),
    ]),
  ]);

  mount.appendChild(confirmSheet);
}

/**
 * Run the actual export with progress UI.
 * @param {HTMLElement} mount
 * @param {object} operation
 */
async function runExport(mount, operation) {
  clear(mount);

  const progressLabel = el('span', {}, ['0%']);
  const progressBar = el('div', { className: 'export-progress-bar' });
  const progressFill = el('div', { className: 'export-progress-fill' });
  progressBar.appendChild(progressFill);

  const progressSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'export-progress-sheet',
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' } }, [
      el('span', {}, [t('settings.exportingLabel')]),
      progressLabel,
    ]),
    progressBar,
  ]);

  mount.appendChild(progressSheet);

  try {
    const { json, fileName } = await exportOperationBackup(
      operation.id,
      (_table, pct) => {
        progressLabel.textContent = `${pct}%`;
        progressFill.style.width = `${pct}%`;
      }
    );

    downloadBackup(json, fileName);

    clear(mount);
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-green-dark)' },
      'data-testid': 'export-success',
    }, [t('settings.exportSuccess')]));
  } catch (err) {
    clear(mount);
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-red-base)' },
      'data-testid': 'export-error',
    }, [t('settings.exportError')]));
  }
}

/**
 * Show a temporary toast message.
 * @param {string} message
 */
function showExportToast(message) {
  const existing = document.querySelector('[data-testid="export-toast"]');
  if (existing) existing.remove();

  const toast = el('div', {
    className: 'export-toast',
    'data-testid': 'export-toast',
  }, [message]);

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ---------------------------------------------------------------------------
// Import flow (CP-56)
// ---------------------------------------------------------------------------

/**
 * Handle file selection for import.
 * @param {Event} e
 * @param {object} operation
 */
async function handleImportFileSelect(e, operation) {
  const file = e.target.files?.[0];
  if (!file) return;

  const mount = document.getElementById('export-sheet-mount');
  if (!mount) return;
  clear(mount);

  let backup;
  try {
    const text = await file.text();
    backup = JSON.parse(text);
  } catch {
    showExportToast(t('settings.importInvalidJson'));
    return;
  }

  // Step 1: Validate
  const validation = validateBackup(backup);
  if (!validation.valid) {
    showExportToast(validation.error);
    return;
  }

  // Step 3: Preview sheet
  const preview = getBackupPreview(backup);
  const previewSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'import-preview-sheet',
  }, [
    el('h3', { style: { marginBottom: 'var(--space-3)' } }, [t('settings.importPreviewTitle')]),
    el('div', { className: 'import-preview-grid' }, [
      previewRow(t('settings.importTargetOp'), operation?.name || '—'),
      previewRow(t('settings.importExportDate'), preview.exportedAt),
      previewRow(t('settings.importExportedBy'), preview.exportedByEmail),
      previewRow(t('settings.importSchemaVersion'), `v${preview.schemaVersion}`),
      previewRow(t('settings.importFarms'), String(preview.counts.farms || 0)),
      previewRow(t('settings.importEvents'), String(preview.counts.events || 0)),
      previewRow(t('settings.importAnimals'), String(preview.counts.animals || 0)),
      previewRow(t('settings.importBatches'), String(preview.counts.batches || 0)),
      previewRow(t('settings.importTodos'), String(preview.counts.todos || 0)),
    ]),
    el('p', {
      style: { color: 'var(--color-red-base)', fontSize: '0.875rem', marginTop: 'var(--space-4)', fontWeight: '600' },
    }, [t('settings.importDestructiveWarning')]),
    el('p', {
      style: { fontSize: '0.8125rem', color: 'var(--text2)', marginTop: 'var(--space-2)' },
    }, [t('settings.importAutoBackupNote')]),
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [
      el('button', {
        className: 'btn btn-red btn-sm',
        'data-testid': 'import-replace-btn',
        onClick: () => showSecondConfirm(mount, backup, operation),
      }, [t('settings.importReplaceAll')]),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => clear(mount),
      }, [t('action.cancel')]),
    ]),
  ]);

  mount.appendChild(previewSheet);
}

function previewRow(label, value) {
  return el('div', { className: 'import-preview-row' }, [
    el('span', { className: 'import-preview-label' }, [label]),
    el('span', { className: 'import-preview-value' }, [value]),
  ]);
}

/**
 * Show the second-step destructive confirmation (§5.7.3).
 */
function showSecondConfirm(mount, backup, operation) {
  clear(mount);
  mount.appendChild(el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', borderColor: 'var(--color-red-base)' },
    'data-testid': 'import-second-confirm',
  }, [
    el('p', { style: { fontWeight: '600', color: 'var(--color-red-base)' } }, [
      t('settings.importSecondConfirm'),
    ]),
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [
      el('button', {
        className: 'btn btn-red btn-sm',
        'data-testid': 'import-final-confirm-btn',
        onClick: () => runImport(mount, backup, operation),
      }, [t('settings.importYesReplace')]),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => clear(mount),
      }, [t('action.cancel')]),
    ]),
  ]));
}

/**
 * Run the actual import with progress UI (§5.7 step 10).
 */
async function runImport(mount, backup, operation) {
  clear(mount);

  const phaseLabel = el('span', {}, ['Validating']);
  const detailLabel = el('span', { style: { fontSize: '0.8125rem', color: 'var(--text2)' } }, ['']);
  const progressLabel = el('span', {}, ['0%']);
  const progressFill = el('div', { className: 'export-progress-fill' });
  const progressBar = el('div', { className: 'export-progress-bar' }, [progressFill]);

  const progressSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'import-progress-sheet',
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' } }, [
      phaseLabel,
      progressLabel,
    ]),
    detailLabel,
    el('div', { style: { marginTop: 'var(--space-3)' } }, [progressBar]),
  ]);

  mount.appendChild(progressSheet);

  const result = await importOperationBackup(
    backup,
    operation.id,
    (phase, detail, pct) => {
      phaseLabel.textContent = phase;
      detailLabel.textContent = detail;
      progressLabel.textContent = `${pct}%`;
      progressFill.style.width = `${pct}%`;
    }
  );

  clear(mount);

  if (result.success) {
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-green-dark)' },
      'data-testid': 'import-success',
    }, [t('settings.importSuccess')]));
  } else if (result.parityResult && !result.parityResult.pass) {
    // Parity failure — show mismatch report
    const rows = result.parityResult.mismatches.map(m =>
      el('div', { className: 'import-preview-row' }, [
        el('span', { className: 'import-preview-label' }, [m.table]),
        el('span', { className: 'import-preview-value' }, [t('event.parityExpected', { expected: m.expected, actual: m.actual })]),
      ])
    );
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
      'data-testid': 'import-parity-report',
    }, [
      el('p', { style: { color: 'var(--color-red-base)', fontWeight: '600', marginBottom: 'var(--space-3)' } }, [
        t('settings.importParityFailed'),
      ]),
      ...rows,
      el('p', { style: { fontSize: '0.8125rem', color: 'var(--text2)', marginTop: 'var(--space-3)' } }, [
        t('settings.importParityRevert').replace('{filename}', result.autoBackupFileName || ''),
      ]),
    ]));
  } else {
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-red-base)' },
      'data-testid': 'import-error',
    }, [result.error || t('settings.importError')]));
  }
}

function rerender(container) {
  if (container) {
    clear(container);
    renderSettingsScreen(container);
  }
}
