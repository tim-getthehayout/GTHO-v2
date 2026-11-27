/** @file Settings screen — farm settings, user prefs, account, sync status, backup */

import { el, clear } from '../../ui/dom.js';
import { showExportToast } from '../../ui/toast.js';
import { t } from '../../i18n/i18n.js';
import { getAll, update, getSyncAdapter, getOperation, setUnitSystem } from '../../data/store.js';
import {
  composeFieldLabel, toDisplayValue, toStoredValue, formatDisplayValue, stepForField,
} from './unit-descriptor.js';
import { renderForageTypesSection, renderForageTypeSheetMarkup } from './forage-types-section.js';
import { canExport, exportOperationBackup, downloadBackup } from '../../data/backup-export.js';
import { validateBackup, getBackupPreview, importOperationBackup } from '../../data/backup-import.js';
import { withResyncLock, planResync, applyResync, resyncSkippedExport } from '../../data/push-all.js';
import { pullAllRemote } from '../../data/pull-remote.js';
import { logger } from '../../utils/logger.js';
import { validate as validateFarmSetting, toSupabaseShape as fsToSb } from '../../entities/farm-setting.js';
import {
  arePregCheckSettingsReleased,
  updateFarmPregCheckSettings,
  validatePregCheckThresholds,
  PREG_CHECK_SPECIES_SECTIONS,
  areReturnToCycleSettingsReleased,
  updateFarmReturnToCycleSettings,
  validateReturnToCycleDays,
  RETURN_TO_CYCLE_SPECIES_SECTIONS,
} from './preg-check-settings.js';
import { validate as validateUserPref, toSupabaseShape as prefToSb } from '../../entities/user-preference.js';
import { availableFieldModules, resolveFieldModuleKeys } from '../field-mode/index.js';
import { renderDairySettingsCard } from './dairy-settings.js';
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
import { areFarmSeasonSettingsReleased } from './farm-season-settings.js';
import {
  isArchivedMetricsSettingReleased, INCLUDE_ARCHIVED_LABEL, INCLUDE_ARCHIVED_HINT, INCLUDE_ARCHIVED_HELD_NOTE,
} from './report-preferences.js';
import {
  resolveFarmSeason, validateFarmSeason, formatFarmSeason, MONTH_SHORT,
} from '../../calcs/farm-season.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { renderToolsSection } from './tools-section.js';
import { openMemberManagementSheet, getCurrentUserRole, getMemberCount, renderMemberSheetMarkup } from './member-management.js';

/**
 * Render the settings screen.
 * @param {HTMLElement} container
 */
export function renderSettingsScreen(container) {
  const farmSettings = getAll('farmSettings')[0];
  const userPrefs = getAll('userPreferences')[0];

  if (!farmSettings || !userPrefs) {
    // #488: say which row is missing (the generic message hid a lost farm_settings insert).
    if (!farmSettings) logger.warn('settings', 'farm_settings row missing for farm', { farms: getAll('farms').length, farmSettings: 0 });
    if (!userPrefs) logger.warn('settings', 'user_preferences row missing', { operations: getAll('operations').length, userPreferences: 0 });
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('settings.title')]));
    container.appendChild(el('p', {}, [t('error.generic')]));
    return;
  }

  const operationId = getAll('operations')[0]?.id;

  const sections = el('div', { className: 'settings-sections', 'data-testid': 'settings-screen' }, [
    el('h1', { className: 'screen-heading' }, [t('settings.title')]),
    renderUnitSection(container),
    renderFarmSection(farmSettings, container),
    renderDairySettingsCard(farmSettings), // #449: null until schema 51 is released
    renderPregCheckSettingsSection(farmSettings, container),
    renderReturnToCycleSettingsSection(farmSettings, container),
    renderPrefSection(userPrefs, container),
    // OI-0125 / SP-13: Forage Types card sits between Farm Settings and Field
    // Mode (v1 ordering: Farms → Forage Types → Field Mode → Farm Settings).
    renderForageTypesSection(operationId),
    renderFieldModulesCard(container),
    renderMembersSection(operationId),
    // Health reference tables (CP-32)
    renderAiBullsSection(operationId),
    renderTreatmentCategoriesSection(operationId),
    renderTreatmentTypesSection(operationId),
    renderDoseUnitsSection(operationId),
    // Amendment reference tables (CP-38)
    renderProductCategoriesSection(operationId),
    renderProductsSection(operationId),
    renderSpreadersSection(operationId),
    renderProductUnitsSection(operationId),
    // OI-0132 Class B: Tools section (currently: backfill calving records).
    renderToolsSection(operationId),
    renderAccountSection(),
    renderSyncSection(),
    // Sheet markups for health reference tables
    ...renderHealthRefSheetMarkups(),
    ...renderAmendmentRefSheetMarkups(),
    renderMemberSheetMarkup(),
    renderForageTypeSheetMarkup(),
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

// Exported for unit tests (OI-0111 round-trip suite). Helpers now live in
// `./unit-descriptor.js` (extracted for OI-0125 / SP-13 reuse).
// Exported for unit tests (#476 backup UI fixes).
export const __backupUiInternals = {
  handleImportFileSelect: (...args) => handleImportFileSelect(...args),
  runExport: (...args) => runExport(...args),
};

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

  // #402: farm season default (start/end month-day). Same columns as the
  // Rotation calendar "Farm default…" editor. Hidden until schema 49 is released.
  const season = renderFarmSeasonFields(fs);

  // OI-0251 Ap: include archived locations in metrics (same column as the
  // Report preferences dialog). Absent/unset = on; editable once 54 is released.
  const archivedReleased = isArchivedMetricsSettingReleased();
  const archivedCheckbox = el('input', {
    type: 'checkbox',
    checked: fs.includeArchivedLocationsInMetrics !== false ? 'checked' : undefined,
    disabled: archivedReleased ? undefined : 'disabled',
    'data-testid': 'settings-farm-includeArchivedLocationsInMetrics',
  });
  const archivedToggle = el('div', { className: 'settings-field', 'data-testid': 'settings-farm-archived-metrics' }, [
    el('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } }, [
      archivedCheckbox,
      INCLUDE_ARCHIVED_LABEL,
    ]),
    el('div', { className: 'form-hint' }, [archivedReleased ? INCLUDE_ARCHIVED_HINT : INCLUDE_ARCHIVED_HELD_NOTE]),
  ]);

  const statusEl = el('div', { className: 'auth-info', 'data-testid': 'settings-farm-status' });

  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.farmSettings')]),
    recoveryToggle,
    ...fieldEls,
    ...(season ? [season.el] : []),
    archivedToggle,
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
        if (archivedReleased) changes.includeArchivedLocationsInMetrics = archivedCheckbox.checked;
        if (season) {
          const check = validateFarmSeason(season.values(), getLocalTodayStr());
          if (!check.valid) {
            clear(statusEl);
            statusEl.className = 'auth-error';
            statusEl.appendChild(el('span', {}, [check.errors.join('; ')]));
            return;
          }
          Object.assign(changes, check.normalized);
        }
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

/** #402: season start/end month + day inputs for the Farm Settings card (null until 049 released). */
function renderFarmSeasonFields(fs) {
  if (!areFarmSeasonSettingsReleased() || !fs?.id) return null;
  const current = resolveFarmSeason(fs);
  const monthSelect = (value, key) => el('select', {
    className: 'auth-input settings-input',
    'data-testid': `settings-farm-${key}`,
  }, MONTH_SHORT.map((m, i) => el('option', { value: String(i + 1), selected: i + 1 === value }, [m])));
  const dayInput = (value, key) => el('input', {
    type: 'number', min: '1', max: '31', step: '1',
    className: 'auth-input settings-input',
    value: String(value),
    'data-testid': `settings-farm-${key}`,
  });
  const inputs = {
    seasonStartMonth: monthSelect(current.startMonth, 'seasonStartMonth'),
    seasonStartDay: dayInput(current.startDay, 'seasonStartDay'),
    seasonEndMonth: monthSelect(current.endMonth, 'seasonEndMonth'),
    seasonEndDay: dayInput(current.endDay, 'seasonEndDay'),
  };
  const values = () => Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, input.value]));
  const label = el('div', {
    style: { fontSize: '12px', color: 'var(--text2)' },
    'data-testid': 'settings-farm-season-label',
  });
  const refresh = () => {
    clear(label);
    const today = getLocalTodayStr();
    const check = validateFarmSeason(values(), today);
    if (!check.valid) {
      label.appendChild(document.createTextNode(check.errors.join('; ')));
      return;
    }
    const n = check.normalized;
    label.appendChild(document.createTextNode(`This farm's season: ${formatFarmSeason({
      startMonth: n.seasonStartMonth, startDay: n.seasonStartDay, endMonth: n.seasonEndMonth, endDay: n.seasonEndDay,
    }, today)}`));
  };
  Object.values(inputs).forEach(input => {
    input.addEventListener('change', refresh);
    input.addEventListener('input', refresh);
  });
  refresh();
  const row = (labelText, month, day) => el('div', { className: 'settings-field' }, [
    el('label', { className: 'form-label' }, [labelText]),
    el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [month, day]),
  ]);
  return {
    el: el('div', { 'data-testid': 'settings-farm-season' }, [
      row(t('settings.seasonStart') || 'Season start', inputs.seasonStartMonth, inputs.seasonStartDay),
      row(t('settings.seasonEnd') || 'Season end', inputs.seasonEndMonth, inputs.seasonEndDay),
      label,
    ]),
    values,
  };
}

/** Ps-farm0: Farm Settings editors for per-species preg-check thresholds (same helper as Animals). Pg0: hidden until schema 47. */
function renderPregCheckSettingsSection(fs, rootContainer) {
  if (!arePregCheckSettingsReleased()) return el('div');

  const inputs = {};
  const fieldEls = [];
  const defaults = {
    pregCheckMinDaysSinceExposureCattle: 35,
    pregCheckMinDaysPostCalvingCattle: 45,
    pregCheckMinDaysSinceExposureSheep: 25,
    pregCheckMinDaysPostCalvingSheep: 30,
    pregCheckMinDaysSinceExposureGoat: 25,
    pregCheckMinDaysPostCalvingGoat: 30,
  };
  for (const section of PREG_CHECK_SPECIES_SECTIONS) {
    fieldEls.push(el('div', {
      style: { fontSize: '13px', fontWeight: '600', margin: '10px 0 4px' },
    }, [section.label]));
    for (const [key, labelKey, fallback] of [
      [section.exposureKey, 'settings.pregCheckMinDaysSinceExposure', 'Min days since exposure'],
      [section.postKey, 'settings.pregCheckMinDaysPostPartum', 'Min days post-partum'],
    ]) {
      const current = fs[key];
      const value = Number.isFinite(current) ? String(current) : String(defaults[key]);
      const input = el('input', {
        type: 'number', min: '0', max: '365', step: '1',
        className: 'auth-input settings-input',
        value,
        'data-testid': `settings-farm-${key}`,
      });
      inputs[key] = input;
      fieldEls.push(el('div', { className: 'settings-field' }, [
        el('label', { className: 'form-label' }, [t(labelKey) || fallback]),
        input,
      ]));
    }
  }

  const statusEl = el('div', { className: 'auth-info', 'data-testid': 'settings-preg-check-status' });
  return el('div', { className: 'card settings-card', 'data-testid': 'settings-preg-check-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.pregCheckSettings') || 'Preg check settings']),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' } }, [
      t('animal.pregCheckCombineAnd') || 'Combine rule: AND (farm-wide)',
    ]),
    ...fieldEls,
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': 'settings-preg-check-save',
      onClick: () => {
        const values = {};
        for (const key of Object.keys(inputs)) values[key] = inputs[key].value;
        const check = validatePregCheckThresholds(values);
        clear(statusEl);
        if (!check.valid) {
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [check.errors.join('; ')]));
          return;
        }
        try {
          updateFarmPregCheckSettings(fs.id, check.normalized);
          statusEl.className = 'auth-info';
          statusEl.appendChild(el('span', {}, [t('settings.saved')]));
          rerender(rootContainer);
        } catch (err) {
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    statusEl,
  ]);
}


/** Return-to-cycle editors (due-band earliest). Hidden until schema 48 released. */
function renderReturnToCycleSettingsSection(fs, rootContainer) {
  if (!areReturnToCycleSettingsReleased()) return el('div');

  const inputs = {};
  const fieldEls = [];
  for (const section of RETURN_TO_CYCLE_SPECIES_SECTIONS) {
    const current = fs[section.key];
    const value = Number.isFinite(current) ? String(current) : String(section.defaultDays);
    const input = el('input', {
      type: 'number', min: '0', max: '365', step: '1',
      className: 'auth-input settings-input',
      value,
      'data-testid': `settings-farm-${section.key}`,
    });
    inputs[section.key] = input;
    fieldEls.push(el('div', { className: 'settings-field' }, [
      el('label', { className: 'form-label' }, [
        `${section.label}: ${t('settings.returnToCycleDays') || 'Return-to-cycle days'}`,
      ]),
      input,
    ]));
  }

  const statusEl = el('div', { className: 'auth-info', 'data-testid': 'settings-return-to-cycle-status' });
  return el('div', { className: 'card settings-card', 'data-testid': 'settings-return-to-cycle-card' }, [
    el('h3', { className: 'settings-section-title' }, [
      t('settings.returnToCycleSection') || 'Return to cycle (due band)',
    ]),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' } }, [
      t('settings.returnToCycleDays') || 'Return-to-cycle days',
    ]),
    ...fieldEls,
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': 'settings-return-to-cycle-save',
      onClick: () => {
        const values = {};
        for (const key of Object.keys(inputs)) values[key] = inputs[key].value;
        const check = validateReturnToCycleDays(values);
        clear(statusEl);
        if (!check.valid) {
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [check.errors.join('; ')]));
          return;
        }
        try {
          updateFarmReturnToCycleSettings(fs.id, check.normalized);
          statusEl.className = 'auth-info';
          statusEl.appendChild(el('span', {}, [t('settings.saved')]));
          rerender(rootContainer);
        } catch (err) {
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

  // #449: dairy modules only while dairy is visible; never-customised users get them by default.
  const activeKeys = resolveFieldModuleKeys(prefs.fieldModeQuickActions || null);

  const card = el('div', { className: 'card settings-card', style: { marginBottom: '10px' } });
  card.appendChild(el('h3', { className: 'settings-section-title' }, [t('fieldMode.modulesTitle')]));
  card.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' } }, [t('fieldMode.modulesHint')]));

  for (const mod of availableFieldModules()) {
    const isOn = activeKeys.includes(mod.key);
    const row = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)' } }, [
      el('div', { style: { fontSize: '13px' } }, [`${mod.icon} ${t(mod.labelKey)}`]),
      el('button', {
        type: 'button',
        style: { padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${isOn ? 'var(--green)' : 'var(--border)'}`, background: isOn ? 'var(--green)' : 'transparent', color: isOn ? 'white' : 'var(--text2)' },
        onClick: () => {
          // Toggle against the saved list so hidden dairy tiles a user chose are kept.
          const baseKeys = prefs.fieldModeQuickActions || activeKeys;
          const newKeys = isOn ? baseKeys.filter(k => k !== mod.key) : [...baseKeys.filter(k => k !== mod.key), mod.key];
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
    signedOut: t('settings.syncSignedOut'),
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
      onClick: (e) => handleResyncClick(e.currentTarget || e.target),
    }, [t('settings.resync')]),
    // Export/import sheets mount here
    sheetMount,
  ]);
}

/**
 * "Resync to server": plan from this device's unconfirmed work only, show
 * the counts, and send only after the user confirms. The flush lock is held
 * only while reading and sending, never while the sheet waits for a tap: at
 * Send the plan is rebuilt under the lock (fresh queue, dead letters, marks
 * and server stamps) and the sheet is shown again if the counts changed. A
 * sheet that is removed (navigation, a new Resync) counts as Cancel. Then the
 * awaited result and a normal pull.
 * @param {HTMLButtonElement} button
 */
export async function handleResyncClick(button) {
  const mount = document.getElementById('export-sheet-mount');
  if (!mount || button?.disabled) return;
  if (button) button.disabled = true;
  clear(mount);
  mount.appendChild(resyncCard('resync-progress', [el('p', {}, [t('settings.resyncChecking')])]));
  try {
    let plan = await withResyncLock(() => planResync());
    let outcome = null;
    while (!outcome) {
      if (!plan || plan.ok === false) {
        showResyncMessage(mount, resyncRefusal(plan || {}));
        return;
      }
      if (!(await confirmResync(mount, plan.counts))) {
        clear(mount);
        return;
      }
      clear(mount);
      mount.appendChild(resyncCard('resync-progress', [el('p', {}, [t('settings.resyncSending')])]));
      const shown = plan.counts;
      const step = await withResyncLock(async () => {
        const fresh = await planResync();
        if (!fresh.ok || !sameResyncCounts(fresh.counts, shown)) return { plan: fresh };
        return { outcome: await applyResync(fresh) };
      });
      if (step?.outcome) outcome = step.outcome;
      else plan = step?.plan || step;
    }
    showResyncResult(mount, outcome);
    await pullAllRemote();
  } catch (error) {
    logger.warn('resync', 'Resync did not finish', { error: error?.message });
    showResyncMessage(mount, t('settings.resyncFailed'));
  } finally {
    if (button) button.disabled = false;
  }
}

function sameResyncCounts(a, b) {
  return ['send', 'skip', 'existing', 'gone', 'cantCompare'].every(key => (a?.[key] || 0) === (b?.[key] || 0));
}

/** Singular or plural string: `key` is the plural, `${key}One` the singular. */
function tCount(key, count) {
  return t(count === 1 ? `${key}One` : key, { count });
}

function resyncRefusal(refused) {
  if (refused.reason === 'offline') return t('settings.resyncOffline');
  if (refused.reason === 'signedOut') return t('settings.resyncSignedOut');
  if (refused.reason === 'readFailed') return t('settings.resyncReadFailed', { table: refused.table });
  return t('settings.resyncUnavailable');
}

function resyncCard(testId, children) {
  return el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': testId,
  }, children);
}

function showResyncMessage(mount, message) {
  clear(mount);
  mount.appendChild(resyncCard('resync-message', [
    el('p', { style: { marginBottom: 'var(--space-3)' } }, [message]),
    el('div', { className: 'btn-row' }, [
      el('button', { className: 'btn btn-outline btn-sm', 'data-testid': 'resync-ok-btn', onClick: () => clear(mount) }, [t('settings.resyncOk')]),
    ]),
  ]));
}

/**
 * The confirm sheet. Resolves true only on "Send N changes"; false on
 * Cancel or OK, or when the sheet is removed from the page.
 * @returns {Promise<boolean>}
 */
function confirmResync(mount, counts) {
  return new Promise(resolve => {
    clear(mount);
    let observer = null;
    const settle = (value) => {
      observer?.disconnect();
      resolve(value);
    };
    const lines = [
      el('p', { 'data-testid': 'resync-count-send' }, [tCount('settings.resyncCountSend', counts.send)]),
      el('p', { 'data-testid': 'resync-count-skip' }, [tCount('settings.resyncCountSkip', counts.skip)]),
    ];
    if (counts.existing > 0) lines.push(el('p', { 'data-testid': 'resync-count-existing' }, [tCount('settings.resyncCountExisting', counts.existing)]));
    if (counts.gone > 0) lines.push(el('p', { 'data-testid': 'resync-count-gone' }, [tCount('settings.resyncCountGone', counts.gone)]));
    if (counts.cantCompare > 0) lines.push(el('p', { 'data-testid': 'resync-count-cant-compare' }, [tCount('settings.resyncCountCantCompare', counts.cantCompare)]));
    const buttons = counts.send > 0
      ? [
        el('button', { className: 'btn btn-outline btn-sm', 'data-testid': 'resync-cancel-btn', onClick: () => settle(false) }, [t('action.cancel')]),
        el('button', { className: 'btn btn-green btn-sm', 'data-testid': 'resync-send-btn', onClick: () => settle(true) }, [tCount('settings.resyncSendButton', counts.send)]),
      ]
      : [el('button', { className: 'btn btn-outline btn-sm', 'data-testid': 'resync-ok-btn', onClick: () => settle(false) }, [t('settings.resyncOk')])];
    const sheet = resyncCard('resync-confirm-sheet', [
      el('h4', { style: { marginBottom: 'var(--space-3)' } }, [t('settings.resyncTitle')]),
      ...lines,
      el('div', { className: 'btn-row', style: { marginTop: 'var(--space-3)' } }, buttons),
    ]);
    mount.appendChild(sheet);
    // Leaving the screen (or starting another Resync) removes the sheet: Cancel.
    const Observer = globalThis.MutationObserver;
    if (typeof Observer === 'function') {
      observer = new Observer(() => { if (!sheet.isConnected) settle(false); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  });
}

function showResyncResult(mount, outcome) {
  clear(mount);
  const lines = [el('p', { 'data-testid': 'resync-result' }, [t('settings.resyncResult', { sent: outcome.sent, skipped: outcome.skipped, failed: outcome.failed })])];
  if (outcome.gone > 0) lines.push(el('p', { 'data-testid': 'resync-result-gone' }, [t('settings.resyncResultGone', { count: outcome.gone })]));
  if (outcome.cantCompare > 0) lines.push(el('p', { 'data-testid': 'resync-result-cant-compare' }, [t('settings.resyncResultCantCompare', { count: outcome.cantCompare })]));
  if (outcome.waiting > 0) lines.push(el('p', { 'data-testid': 'resync-result-waiting' }, [t('settings.resyncResultWaiting', { count: outcome.waiting })]));
  const buttons = [];
  if (outcome.skipped > 0) {
    buttons.push(el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': 'resync-export-skipped-btn',
      onClick: () => downloadBackup(resyncSkippedExport(), `gtho-resync-skipped-${new Date().toISOString().slice(0, 10)}.json`),
    }, [t('settings.resyncExportSkipped')]));
  }
  buttons.push(el('button', { className: 'btn btn-outline btn-sm', 'data-testid': 'resync-ok-btn', onClick: () => clear(mount) }, [t('settings.resyncOk')]));
  mount.appendChild(resyncCard('resync-result-sheet', [
    el('h4', { style: { marginBottom: 'var(--space-3)' } }, [t('settings.resyncTitle')]),
    ...lines,
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-3)' } }, buttons),
  ]));
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
    // #476: log and surface the cause instead of swallowing it.
    logger.error('backup', 'export failed', { error: err?.message || String(err) });
    clear(mount);
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-red-base)' },
      'data-testid': 'export-error',
    }, [err?.message || t('settings.exportError')]));
  }
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
  // #476: reset so picking the same file again (after cancel/error) fires onChange.
  e.target.value = '';
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

  // #476: refuse another operation's file before the preview and both confirms.
  if (!operation?.id || backup.operation_id !== operation.id) {
    showExportToast(t('settings.importWrongOperation'));
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
