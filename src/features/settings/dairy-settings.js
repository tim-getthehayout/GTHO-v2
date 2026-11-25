/**
 * @file #449 Settings → Farm "Dairy" card: Dairy features (Auto/On/Off),
 * milk density (lb per gallon imperial / kg per L metric, > 0) and Milk totals
 * (By pickup / Spread over days since last pickup). Hidden until schema 51 is
 * released (nothing is written before then).
 */
import { el, clear } from '../../ui/dom.js';
import { update, getOperation } from '../../data/store.js';
import { isDairySchemaReleased, RELEASED_SCHEMA_VERSION } from '../../data/schema-release.js';
import { resolveDairySettings, validate as validateFarmSetting, toSupabaseShape as fsToSb } from '../../entities/farm-setting.js';
import { toDisplayValue, toStoredValue } from './unit-descriptor.js';
import { shortUnit } from '../../utils/units.js';

const DENSITY_FIELD = { measureType: 'milkDensity' };

export const DAIRY_MODE_OPTIONS = [['auto', 'Auto (when you have dairy cattle)'], ['on', 'On'], ['off', 'Off']];
export const MILK_TOTALS_OPTIONS = [['per_pickup', 'By pickup'], ['spread_daily', 'Spread over days since last pickup']];

/** Density label: "Milk lb per gallon" (imperial) / "Milk kg per L" (metric). */
export function milkDensityLabel(unitSystem) {
  // Unit names come from the shared helper (OI-0278 lock).
  return unitSystem === 'metric' ? `Milk ${shortUnit('weight', 'metric')} per L` : `Milk ${shortUnit('weight', 'imperial')} per gallon`;
}

function select(options, value, testid) {
  return el('select', { 'data-testid': testid }, options.map(([v, label]) => el('option', { value: v, selected: v === value ? 'selected' : undefined }, [label])));
}

/**
 * @param {object} fs - farm_settings record
 * @returns {HTMLElement|null} null below schema 51
 */
export function renderDairySettingsCard(fs) {
  if (!fs || !isDairySchemaReleased(RELEASED_SCHEMA_VERSION)) return null;
  const unitSystem = getOperation()?.unitSystem ?? 'imperial';
  const current = resolveDairySettings(fs);
  const modeSel = select(DAIRY_MODE_OPTIONS, current.dairyMode, 'settings-dairy-mode');
  const densityShown = toDisplayValue(current.milkKgPerL, DENSITY_FIELD, unitSystem);
  const densityInput = el('input', {
    type: 'number', step: '0.01', min: '0', className: 'auth-input settings-input',
    value: densityShown.toFixed(2), 'data-testid': 'settings-milk-density',
  });
  const totalsSel = select(MILK_TOTALS_OPTIONS, current.milkTotalsMode, 'settings-milk-totals');
  const statusEl = el('div', { className: 'auth-info', 'data-testid': 'settings-dairy-status' });
  const row = (label, input) => el('div', { className: 'settings-field' }, [el('label', { className: 'form-label' }, [label]), input]);
  return el('div', { className: 'card settings-card', 'data-testid': 'settings-dairy' }, [
    el('h3', { className: 'settings-section-title' }, ['Dairy']),
    row('Dairy features', modeSel),
    row(milkDensityLabel(unitSystem), densityInput),
    row('Milk totals', totalsSel),
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': 'settings-dairy-save',
      onClick: () => {
        clear(statusEl);
        const shown = parseFloat(densityInput.value);
        if (!(shown > 0)) {
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [`${milkDensityLabel(unitSystem)} must be greater than 0`]));
          return;
        }
        // Keep the stored factor exact when the shown value is unchanged (8.60 ↔ 1.0305073).
        const milkKgPerL = shown.toFixed(2) === densityShown.toFixed(2)
          ? current.milkKgPerL
          : toStoredValue(shown, DENSITY_FIELD, unitSystem);
        try {
          update('farmSettings', fs.id, { dairyMode: modeSel.value, milkKgPerL, milkTotalsMode: totalsSel.value }, validateFarmSetting, fsToSb, 'farm_settings');
          statusEl.className = 'auth-info';
          statusEl.appendChild(el('span', {}, ['Saved']));
        } catch (err) {
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, ['Save']),
    statusEl,
  ]);
}
