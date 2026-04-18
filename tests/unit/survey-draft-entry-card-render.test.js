/**
 * @file Regression — Survey draft-entry sheet actually renders the survey card
 * in the live DOM (OI-0112 surface #6).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000cc';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  // The surveys module renders its sheet markup via renderSurveysScreen; we
  // short-circuit by adding the draft-entry sheet wrap directly so
  // openDraftEntrySheet can find its panel.
  document.body.appendChild(Object.assign(document.createElement('div'), {
    innerHTML: '<div class="sheet-wrap" id="draft-entry-sheet-wrap"><div class="sheet-backdrop"></div><div class="sheet-panel" id="draft-entry-sheet-panel"></div></div>',
  }));
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM,
    name: 'North 40', type: 'land', landUse: 'pasture', areaHectares: 8,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
});

describe('Survey draft-entry sheet renders the survey card (OI-0112 regression)', () => {
  it('renderSurveysScreen → new-entry sheet shows obs-survey-card', async () => {
    // The draft-entry open function is module-internal — exercise it via the
    // list rendering. We invoke renderSurveysScreen and then programmatically
    // click the "add entry" path for a single-mode survey.
    const { renderSurveysScreen } = await import('../../src/features/surveys/index.js');
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderSurveysScreen(container);
    // Seed a survey + open the draft-entry sheet via the list action.
    const SurveyEntity = await import('../../src/entities/survey.js');
    add('surveys', SurveyEntity.create({
      id: '00000000-0000-0000-0000-000000000099',
      operationId: OP, surveyDate: '2026-04-18', type: 'single', status: 'draft',
    }), SurveyEntity.validate, SurveyEntity.toSupabaseShape, 'surveys');
    // Re-render after store update.
    container.innerHTML = '';
    renderSurveysScreen(container);
    const addBtn = container.querySelector('[data-testid="surveys-add-entry-00000000-0000-0000-0000-000000000099"]');
    expect(addBtn, 'add-entry button should render').toBeTruthy();
    addBtn.click();
    const panel = document.getElementById('draft-entry-sheet-panel');
    const card = panel.querySelector('[data-testid="obs-survey-card"]');
    expect(card, 'obs-survey-card should render inside draft-entry sheet').toBeTruthy();
    expect(card.querySelector('[data-testid="obs-card-forage-height"]')).toBeTruthy();
    expect(card.querySelector('[data-testid="obs-card-recovery-min"]')).toBeTruthy();
    expect(card.querySelector('[data-testid="obs-card-notes"]')).toBeTruthy();
  });
});
