/** @file Onboarding wizard — first-run setup: operation, farm, species, seed data */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { add, getAll } from '../../data/store.js';
import { getUser } from '../auth/session.js';
import { create as createOperation, validate as validateOperation, toSupabaseShape as opToSb } from '../../entities/operation.js';
import { create as createFarm, validate as validateFarm, toSupabaseShape as farmToSb } from '../../entities/farm.js';
import { create as createFarmSetting, validate as validateFarmSetting, toSupabaseShape as fsToSb } from '../../entities/farm-setting.js';
import { create as createOpMember, validate as validateOpMember, toSupabaseShape as memberToSb } from '../../entities/operation-member.js';
import { create as createUserPref, validate as validateUserPref, toSupabaseShape as prefToSb } from '../../entities/user-preference.js';
import { create as createAnimalClass, validate as validateAnimalClass, toSupabaseShape as classToSb } from '../../entities/animal-class.js';
import { create as createTreatmentCat, validate as validateTreatmentCat, toSupabaseShape as treatCatToSb } from '../../entities/treatment-category.js';
import { create as createInputProductCat, validate as validateInputProductCat, toSupabaseShape as prodCatToSb } from '../../entities/input-product-category.js';
import { create as createForageType, validate as validateForageType, toSupabaseShape as forageToSb } from '../../entities/forage-type.js';
import { create as createDoseUnit, validate as validateDoseUnit, toSupabaseShape as doseUnitToSb } from '../../entities/dose-unit.js';
import { create as createInputProductUnit, validate as validateInputProductUnit, toSupabaseShape as prodUnitToSb } from '../../entities/input-product-unit.js';
import {
  ANIMAL_CLASSES_BY_SPECIES,
  DEFAULT_TREATMENT_CATEGORIES,
  DEFAULT_INPUT_PRODUCT_CATEGORIES,
  DEFAULT_DOSE_UNITS,
  DEFAULT_INPUT_PRODUCT_UNITS,
  DEFAULT_FORAGE_TYPES,
} from './seed-data.js';

/**
 * Check if onboarding is needed (no operations exist for this user).
 * @returns {boolean}
 */
export function needsOnboarding() {
  return getAll('operations').length === 0;
}

/**
 * Render the onboarding wizard.
 * @param {HTMLElement} container
 * @param {Function} onComplete - Called when onboarding finishes
 */
export function renderOnboarding(container, onComplete) {
  let step = 1;
  const data = {
    operationName: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    unitSystem: 'imperial',
    farmName: '',
    farmArea: '',
    species: [],
  };

  function render() {
    clear(container);
    const wizard = el('div', { className: 'onboarding', 'data-testid': 'onboarding-wizard' }, [
      renderDots(),
      renderStep(),
    ]);
    container.appendChild(wizard);
  }

  function renderDots() {
    const dots = [];
    for (let i = 1; i <= 4; i++) {
      dots.push(el('span', {
        className: `wizard-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`,
        'data-testid': `onboarding-dot-${i}`,
      }));
    }
    return el('div', { className: 'wizard-dots' }, dots);
  }

  function renderStep() {
    if (step === 1) return renderStep1();
    if (step === 2) return renderStep2();
    if (step === 3) return renderStep3();
    return renderStep4();
  }

  function renderStep1() {
    const nameInput = el('input', {
      type: 'text',
      className: 'auth-input',
      placeholder: t('onboarding.operationName'),
      value: data.operationName,
      'data-testid': 'onboarding-operation-name',
    });

    const tzInput = el('input', {
      type: 'text',
      className: 'auth-input',
      placeholder: t('onboarding.timezone'),
      value: data.timezone,
      'data-testid': 'onboarding-timezone',
    });

    return el('div', { className: 'wizard-step' }, [
      el('h2', { className: 'wizard-step-title' }, [t('onboarding.step1Title')]),
      el('label', { className: 'form-label' }, [t('onboarding.operationName')]),
      nameInput,
      el('label', { className: 'form-label' }, [t('onboarding.timezone')]),
      tzInput,
      el('label', { className: 'form-label' }, [t('settings.unitSystem')]),
      el('div', { className: 'btn-row' }, [
        el('button', {
          className: `btn btn-sm ${data.unitSystem === 'imperial' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'onboarding-unit-imperial',
          onClick: () => { data.unitSystem = 'imperial'; render(); },
        }, [t('settings.imperial')]),
        el('button', {
          className: `btn btn-sm ${data.unitSystem === 'metric' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'onboarding-unit-metric',
          onClick: () => { data.unitSystem = 'metric'; render(); },
        }, [t('settings.metric')]),
      ]),
      el('div', { className: 'btn-row wizard-actions' }, [
        el('button', {
          className: 'btn btn-green',
          'data-testid': 'onboarding-next-1',
          onClick: () => {
            data.operationName = nameInput.value.trim();
            data.timezone = tzInput.value.trim() || 'UTC';
            if (!data.operationName) return;
            step = 2;
            render();
          },
        }, [t('action.next')]),
      ]),
    ]);
  }

  function renderStep2() {
    const nameInput = el('input', {
      type: 'text',
      className: 'auth-input',
      placeholder: t('onboarding.farmName'),
      value: data.farmName,
      'data-testid': 'onboarding-farm-name',
    });

    const areaInput = el('input', {
      type: 'number',
      className: 'auth-input',
      placeholder: t('onboarding.farmArea'),
      value: data.farmArea,
      'data-testid': 'onboarding-farm-area',
    });

    return el('div', { className: 'wizard-step' }, [
      el('h2', { className: 'wizard-step-title' }, [t('onboarding.step2Title')]),
      el('label', { className: 'form-label' }, [t('onboarding.farmName')]),
      nameInput,
      el('label', { className: 'form-label' }, [t('onboarding.farmArea')]),
      areaInput,
      el('p', { className: 'form-hint' }, [t('onboarding.farmAreaOptional')]),
      el('div', { className: 'btn-row wizard-actions' }, [
        el('button', {
          className: 'btn btn-outline',
          'data-testid': 'onboarding-back-2',
          onClick: () => { step = 1; render(); },
        }, [t('action.back')]),
        el('button', {
          className: 'btn btn-green',
          'data-testid': 'onboarding-next-2',
          onClick: () => {
            data.farmName = nameInput.value.trim();
            data.farmArea = areaInput.value;
            if (!data.farmName) return;
            step = 3;
            render();
          },
        }, [t('action.next')]),
      ]),
    ]);
  }

  function renderStep3() {
    const speciesOptions = [
      { key: 'beef_cattle', label: t('onboarding.beefCattle') },
      { key: 'dairy_cattle', label: t('onboarding.dairyCattle') },
      { key: 'sheep', label: t('onboarding.sheep') },
      { key: 'goat', label: t('onboarding.goat') },
    ];

    const errorEl = el('div', { className: 'auth-error', 'data-testid': 'onboarding-species-error' });

    const toggles = speciesOptions.map(opt => {
      const isSelected = data.species.includes(opt.key);
      return el('button', {
        type: 'button',
        className: `species-toggle${isSelected ? ' selected' : ''}`,
        'data-testid': `onboarding-species-${opt.key}`,
        onClick: () => {
          if (data.species.includes(opt.key)) {
            data.species = data.species.filter(s => s !== opt.key);
          } else {
            data.species.push(opt.key);
          }
          render();
        },
      }, [opt.label]);
    });

    return el('div', { className: 'wizard-step' }, [
      el('h2', { className: 'wizard-step-title' }, [t('onboarding.step3Title')]),
      el('p', { className: 'form-hint' }, [t('onboarding.step3Desc')]),
      el('div', { className: 'species-grid', 'data-testid': 'onboarding-species-grid' }, toggles),
      errorEl,
      el('div', { className: 'btn-row wizard-actions' }, [
        el('button', {
          className: 'btn btn-outline',
          'data-testid': 'onboarding-back-3',
          onClick: () => { step = 2; render(); },
        }, [t('action.back')]),
        el('button', {
          className: 'btn btn-green',
          'data-testid': 'onboarding-next-3',
          onClick: () => {
            clear(errorEl);
            if (data.species.length === 0) {
              errorEl.appendChild(el('span', {}, [t('onboarding.noSpecies')]));
              return;
            }
            step = 4;
            render();
          },
        }, [t('action.next')]),
      ]),
    ]);
  }

  function renderStep4() {
    const classCount = data.species.reduce((sum, s) => sum + (ANIMAL_CLASSES_BY_SPECIES[s]?.length || 0), 0);
    const speciesLabels = {
      beef_cattle: t('onboarding.beefCattle'),
      dairy_cattle: t('onboarding.dairyCattle'),
      sheep: t('onboarding.sheep'),
      goat: t('onboarding.goat'),
    };

    const statusEl = el('div', { className: 'auth-info', 'data-testid': 'onboarding-status' });

    return el('div', { className: 'wizard-step' }, [
      el('h2', { className: 'wizard-step-title' }, [t('onboarding.step4Title')]),
      el('p', { className: 'form-hint' }, [t('onboarding.step4Desc')]),
      el('div', { className: 'card review-card' }, [
        el('div', { className: 'review-row' }, [
          el('span', { className: 'review-label' }, [t('onboarding.operationLabel')]),
          el('span', { className: 'review-value' }, [data.operationName]),
        ]),
        el('div', { className: 'review-row' }, [
          el('span', { className: 'review-label' }, [t('settings.unitSystem')]),
          el('span', { className: 'review-value' }, [data.unitSystem === 'metric' ? t('settings.metric') : t('settings.imperial')]),
        ]),
        el('div', { className: 'review-row' }, [
          el('span', { className: 'review-label' }, [t('onboarding.farmLabel')]),
          el('span', { className: 'review-value' }, [data.farmName]),
        ]),
        el('div', { className: 'review-row' }, [
          el('span', { className: 'review-label' }, [t('onboarding.speciesLabel')]),
          el('span', { className: 'review-value' }, [data.species.map(s => speciesLabels[s]).join(', ')]),
        ]),
        el('div', { className: 'review-row' }, [
          el('span', { className: 'review-label' }),
          el('span', { className: 'review-value form-hint' }, [t('onboarding.classesWillSeed', { count: classCount })]),
        ]),
      ]),
      statusEl,
      el('div', { className: 'btn-row wizard-actions' }, [
        el('button', {
          className: 'btn btn-outline',
          'data-testid': 'onboarding-back-4',
          onClick: () => { step = 3; render(); },
        }, [t('action.back')]),
        el('button', {
          className: 'btn btn-green',
          'data-testid': 'onboarding-confirm',
          onClick: async (e) => {
            e.target.disabled = true;
            statusEl.textContent = t('onboarding.creating');
            await executeOnboarding(data);
            onComplete();
          },
        }, [t('action.confirm')]),
      ]),
    ]);
  }

  render();
}

/**
 * Execute the onboarding save sequence.
 * Creates all required records in the store.
 */
async function executeOnboarding(data) {
  const user = getUser();
  const userId = user?.id ?? crypto.randomUUID();

  // 1. Create operation
  const operation = createOperation({
    name: data.operationName,
    timezone: data.timezone,
    unitSystem: data.unitSystem,
  });
  add('operations', operation, validateOperation, opToSb, 'operations');

  // 2. Create farm
  const farm = createFarm({
    operationId: operation.id,
    name: data.farmName,
    areaHectares: data.farmArea ? parseFloat(data.farmArea) : null,
  });
  add('farms', farm, validateFarm, farmToSb, 'farms');

  // 3. Create farm_settings with defaults
  const farmSettings = createFarmSetting({
    farmId: farm.id,
    operationId: operation.id,
  });
  add('farmSettings', farmSettings, validateFarmSetting, fsToSb, 'farm_settings');

  // 4. Create operation_member (current user as owner)
  const member = createOpMember({
    operationId: operation.id,
    userId: userId,
    displayName: user?.email?.split('@')[0] || 'Owner',
    email: user?.email || '',
    role: 'owner',
    acceptedAt: new Date().toISOString(),
  });
  add('operationMembers', member, validateOpMember, memberToSb, 'operation_members');

  // 5. Create user_preferences with defaults
  const prefs = createUserPref({
    operationId: operation.id,
    userId: userId,
  });
  add('userPreferences', prefs, validateUserPref, prefToSb, 'user_preferences');

  // 6. Seed animal_classes based on species selection
  for (const species of data.species) {
    const classes = ANIMAL_CLASSES_BY_SPECIES[species] || [];
    for (const cls of classes) {
      const animalClass = createAnimalClass({
        operationId: operation.id,
        name: cls.name,
        species: species,
        role: cls.role,
        defaultWeightKg: cls.defaultWeightKg,
        dmiPct: cls.dmiPct,
        dmiPctLactating: cls.dmiPctLactating,
        excretionNRate: cls.excretionNRate,
        excretionPRate: cls.excretionPRate,
        excretionKRate: cls.excretionKRate,
        weaningAgeDays: cls.weaningAgeDays,
      });
      add('animalClasses', animalClass, validateAnimalClass, classToSb, 'animal_classes');
    }
  }

  // 7. Seed default treatment_categories
  for (const name of DEFAULT_TREATMENT_CATEGORIES) {
    add('treatmentCategories', createTreatmentCat({
      operationId: operation.id,
      name,
      isDefault: true,
    }), validateTreatmentCat, treatCatToSb, 'treatment_categories');
  }

  // 8. Seed default input_product_categories
  for (const name of DEFAULT_INPUT_PRODUCT_CATEGORIES) {
    add('inputProductCategories', createInputProductCat({
      operationId: operation.id,
      name,
      isDefault: true,
    }), validateInputProductCat, prodCatToSb, 'input_product_categories');
  }

  // 9. Seed default forage_types
  for (const ft of DEFAULT_FORAGE_TYPES) {
    add('forageTypes', createForageType({
      operationId: operation.id,
      name: ft.name,
      dmPct: ft.dmPct,
      dmKgPerCmPerHa: ft.dmKgPerCmPerHa,
      minResidualHeightCm: ft.minResidualHeightCm,
      utilizationPct: ft.utilizationPct,
      isSeeded: true,
    }), validateForageType, forageToSb, 'forage_types');
  }

  // 10. Seed default dose_units (shared — no operation_id)
  if (getAll('doseUnits').length === 0) {
    for (const name of DEFAULT_DOSE_UNITS) {
      add('doseUnits', createDoseUnit({ name }), validateDoseUnit, doseUnitToSb, 'dose_units');
    }
  }

  // 11. Seed default input_product_units (shared — no operation_id)
  if (getAll('inputProductUnits').length === 0) {
    for (const name of DEFAULT_INPUT_PRODUCT_UNITS) {
      add('inputProductUnits', createInputProductUnit({ name }), validateInputProductUnit, prodUnitToSb, 'input_product_units');
    }
  }
}
