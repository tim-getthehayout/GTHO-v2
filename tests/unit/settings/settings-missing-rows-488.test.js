/** @file #488 — Settings logs which row is missing before the generic message. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as UserPrefEntity from '../../../src/entities/user-preference.js';
import { setLocale, t } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { logger } from '../../../src/utils/logger.js';
import { renderSettingsScreen } from '../../../src/features/settings/index.js';

const OP = '00000000-0000-4000-8000-0000000004a1';
const FARM = '00000000-0000-4000-8000-0000000004b1';

beforeAll(() => setLocale('en', enLocale));

function seed({ farmSettings = true, userPrefs = true } = {}) {
  add('operations', OperationEntity.create({ id: OP, name: 'Op' }), OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }), FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  if (farmSettings) add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }), FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  if (userPrefs) add('userPreferences', UserPrefEntity.create({ userId: 'u', operationId: OP }), UserPrefEntity.validate, UserPrefEntity.toSupabaseShape, 'user_preferences');
}

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderSettingsScreen(container);
  return container;
}

const warned = (spy, message) => spy.mock.calls.filter(([category, msg]) => category === 'settings' && msg === message);

describe('#488 renderSettingsScreen missing-row diagnostics', () => {
  let warn;
  beforeEach(() => { _reset(); localStorage.clear(); document.body.innerHTML = ''; warn = vi.spyOn(logger, 'warn'); });
  afterEach(() => warn.mockRestore());

  it('warns farm_settings row missing for farm and keeps the generic message', () => {
    seed({ farmSettings: false });
    const c = render();
    expect(warned(warn, 'farm_settings row missing for farm')).toEqual([['settings', 'farm_settings row missing for farm', { farms: 1, farmSettings: 0 }]]);
    expect(warned(warn, 'user_preferences row missing')).toEqual([]);
    expect(c.textContent).toContain(t('error.generic'));
    expect(c.querySelector('[data-testid="settings-screen"]')).toBeNull();
  });

  it('warns user_preferences row missing and keeps the generic message', () => {
    seed({ userPrefs: false });
    const c = render();
    expect(warned(warn, 'user_preferences row missing')).toEqual([['settings', 'user_preferences row missing', { operations: 1, userPreferences: 0 }]]);
    expect(warned(warn, 'farm_settings row missing for farm')).toEqual([]);
    expect(c.textContent).toContain(t('error.generic'));
  });

  it('does not warn when both rows exist', () => {
    seed();
    const c = render();
    expect(warned(warn, 'farm_settings row missing for farm')).toEqual([]);
    expect(warned(warn, 'user_preferences row missing')).toEqual([]);
    expect(c.querySelector('[data-testid="settings-screen"]')).not.toBeNull();
  });
});
