/** @file Animals screen — CP-15/CP-16. Groups, Classes, and Individual Animals. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add, update, remove, subscribe } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import * as GroupEntity from '../../entities/group.js';
import * as AnimalClassEntity from '../../entities/animal-class.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as MembershipEntity from '../../entities/animal-group-membership.js';
import { openWeightSheet, renderWeightSheetMarkup } from '../health/weight.js';
import { openBcsSheet, renderBcsSheetMarkup } from '../health/bcs.js';
import { openTreatmentSheet, renderTreatmentSheetMarkup } from '../health/treatment.js';
import { openBreedingSheet, renderBreedingSheetMarkup } from '../health/breeding.js';
import { openHeatSheet, renderHeatSheetMarkup } from '../health/heat.js';

/** Current tab: 'groups' | 'classes' | 'animals' */
let activeTab = 'groups';

/** Current species filter for classes tab */
let speciesFilter = 'all';

/** Animals tab search query */
let searchQuery = '';

/** Animals tab sort: 'tag' | 'class' | 'group' */
let sortColumn = 'tag';

/** Sort direction */
let sortAsc = true;

/** Unsubscribe functions */
let unsubs = [];

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

/**
 * Render the animals screen.
 * @param {HTMLElement} container
 */
export function renderAnimalsScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  const farms = getAll('farms');
  if (!operations.length || !farms.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('animal.title')]));
    container.appendChild(el('p', {}, [t('error.generic')]));
    return;
  }

  const operationId = operations[0].id;
  const farmId = farms[0].id;

  const screenEl = el('div', { 'data-testid': 'animals-screen' }, [
    el('h1', { className: 'screen-heading' }, [t('animal.title')]),

    // Tab strip
    renderTabStrip(container),

    // Tab content
    el('div', { 'data-testid': 'animals-tab-content' }),

    // Group sheet (always in DOM)
    renderGroupSheetMarkup(),

    // Class sheet (always in DOM)
    renderClassSheetMarkup(),

    // Animal sheet (always in DOM)
    renderAnimalSheetMarkup(),

    // Health sheets (CP-33)
    renderWeightSheetMarkup(),
    renderBcsSheetMarkup(),
    renderTreatmentSheetMarkup(),
    renderBreedingSheetMarkup(),
    renderHeatSheetMarkup(),
  ]);

  container.appendChild(screenEl);

  renderTabContent(container, operationId, farmId);

  unsubs.push(subscribe('groups', () => renderTabContent(container, operationId, farmId)));
  unsubs.push(subscribe('animalClasses', () => renderTabContent(container, operationId, farmId)));
  unsubs.push(subscribe('animalGroupMemberships', () => renderTabContent(container, operationId, farmId)));
  unsubs.push(subscribe('animals', () => renderTabContent(container, operationId, farmId)));
  unsubs.push(subscribe('animalWeightRecords', () => renderTabContent(container, operationId, farmId)));
  unsubs.push(subscribe('animalBcsScores', () => renderTabContent(container, operationId, farmId)));
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------

function renderTabStrip(rootContainer) {
  return el('div', { className: 'tab-strip', 'data-testid': 'animals-tab-strip' }, [
    el('button', {
      className: `tab-btn${activeTab === 'groups' ? ' active' : ''}`,
      'data-testid': 'animals-tab-groups',
      onClick: () => { activeTab = 'groups'; rerender(rootContainer); },
    }, [t('animal.groups')]),
    el('button', {
      className: `tab-btn${activeTab === 'classes' ? ' active' : ''}`,
      'data-testid': 'animals-tab-classes',
      onClick: () => { activeTab = 'classes'; rerender(rootContainer); },
    }, [t('animal.classes')]),
    el('button', {
      className: `tab-btn${activeTab === 'animals' ? ' active' : ''}`,
      'data-testid': 'animals-tab-animals',
      onClick: () => { activeTab = 'animals'; rerender(rootContainer); },
    }, [t('animal.individuals')]),
  ]);
}

function renderTabContent(rootContainer, operationId, farmId) {
  const contentEl = rootContainer.querySelector('[data-testid="animals-tab-content"]');
  if (!contentEl) return;
  clear(contentEl);

  if (activeTab === 'groups') {
    contentEl.appendChild(renderGroupsTab(rootContainer, operationId, farmId));
  } else if (activeTab === 'classes') {
    contentEl.appendChild(renderClassesTab(rootContainer, operationId));
  } else {
    contentEl.appendChild(renderAnimalsTab(rootContainer, operationId, farmId));
  }
}

// ---------------------------------------------------------------------------
// Groups tab
// ---------------------------------------------------------------------------

function renderGroupsTab(rootContainer, operationId, farmId) {
  const groups = getAll('groups').filter(g => !g.archived);

  const wrap = el('div', {}, [
    el('div', { className: 'screen-action-bar' }, [
      el('span', {}),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'animals-add-group-btn',
        onClick: () => openGroupSheet(null, operationId, farmId),
      }, [t('animal.addGroup')]),
    ]),
  ]);

  if (!groups.length) {
    wrap.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'animals-group-empty',
    }, [t('animal.groupEmpty')]));
    return wrap;
  }

  const list = el('div', { className: 'grp-list', 'data-testid': 'animals-group-list' });
  for (const group of groups) {
    list.appendChild(renderGroupCard(group, operationId, farmId));
  }
  wrap.appendChild(list);
  return wrap;
}

function renderGroupCard(group, operationId, farmId) {
  // Count current members (dateLeft is null)
  const memberships = getAll('animalGroupMemberships');
  const activeMembers = memberships.filter(m => m.groupId === group.id && !m.dateLeft);
  const headCount = activeMembers.length;

  const nameChildren = [];
  if (group.color) {
    nameChildren.push(el('span', {
      className: 'grp-color-dot',
      style: { background: group.color },
    }));
  }
  nameChildren.push(group.name);

  return el('div', {
    className: 'card grp-card',
    'data-testid': `animals-group-card-${group.id}`,
  }, [
    el('div', { className: 'grp-card-head' }, [
      el('span', { className: 'grp-card-name' }, nameChildren),
      el('span', { className: 'badge badge-green' }, [
        t('animal.headCount', { count: headCount }),
      ]),
    ]),
    el('div', { className: 'grp-card-actions' }, [
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': `animals-group-edit-${group.id}`,
        onClick: () => openGroupSheet(group, operationId, farmId),
      }, [t('action.edit')]),
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': `animals-group-delete-${group.id}`,
        onClick: () => {
          if (window.confirm(t('animal.confirmDeleteGroup'))) {
            remove('groups', group.id, 'groups');
          }
        },
      }, [t('action.delete')]),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Group sheet
// ---------------------------------------------------------------------------

let groupSheet = null;

function renderGroupSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'group-sheet-wrap' }, [
    el('div', {
      className: 'sheet-backdrop',
      onClick: () => groupSheet && groupSheet.close(),
    }),
    el('div', { className: 'sheet-panel', id: 'group-sheet-panel' }),
  ]);
}

function openGroupSheet(existingGroup, operationId, farmId) {
  if (!groupSheet) {
    groupSheet = new Sheet('group-sheet-wrap');
  }

  const panel = document.getElementById('group-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existingGroup;
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('animal.editGroup') : t('animal.createGroup'),
  ]));

  // Name
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.groupName')]));
  inputs.name = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingGroup?.name || '',
    'data-testid': 'group-sheet-name',
  });
  panel.appendChild(inputs.name);

  // Color
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.groupColor')]));
  inputs.color = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingGroup?.color || '',
    placeholder: '#639922',
    'data-testid': 'group-sheet-color',
  });
  panel.appendChild(inputs.color);
  panel.appendChild(el('div', { className: 'form-hint' }, [t('animal.groupColorHint')]));

  // Status
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'group-sheet-status' });
  panel.appendChild(statusEl);

  // Actions
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'group-sheet-save',
      onClick: () => {
        clear(statusEl);
        statusEl.className = 'auth-error';

        const data = {
          operationId,
          farmId,
          name: inputs.name.value.trim(),
          color: inputs.color.value.trim() || null,
        };

        try {
          if (isEdit) {
            update('groups', existingGroup.id, data, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
          } else {
            const record = GroupEntity.create(data);
            add('groups', record, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
          }
          groupSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'group-sheet-cancel',
      onClick: () => groupSheet.close(),
    }, [t('action.cancel')]),
  ]));

  groupSheet.open();
}

// ---------------------------------------------------------------------------
// Classes tab
// ---------------------------------------------------------------------------

function renderClassesTab(rootContainer, operationId) {
  const classes = getAll('animalClasses').filter(c => !c.archived);

  // Gather unique species for filter pills
  const speciesList = [...new Set(classes.map(c => c.species))];

  const wrap = el('div', {});

  // Species filter pills (only if multiple species)
  if (speciesList.length > 1) {
    const pills = el('div', { className: 'filter-pills', 'data-testid': 'animals-class-filter-pills' });
    pills.appendChild(el('button', {
      className: `fp${speciesFilter === 'all' ? ' active' : ''}`,
      'data-testid': 'animals-class-filter-all',
      onClick: () => { speciesFilter = 'all'; rerender(rootContainer); },
    }, [t('animal.filter.all')]));

    for (const sp of speciesList) {
      const labelKey = `animal.species.${sp}`;
      pills.appendChild(el('button', {
        className: `fp${speciesFilter === sp ? ' active' : ''}`,
        'data-testid': `animals-class-filter-${sp}`,
        onClick: () => { speciesFilter = sp; rerender(rootContainer); },
      }, [t(labelKey)]));
    }
    wrap.appendChild(pills);
  }

  // Add class button
  wrap.appendChild(el('div', { className: 'screen-action-bar' }, [
    el('span', {}),
    el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': 'animals-add-class-btn',
      onClick: () => openClassSheet(null, operationId),
    }, [t('animal.addClass')]),
  ]));

  if (!classes.length) {
    wrap.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'animals-class-empty',
    }, [t('animal.classEmpty')]));
    return wrap;
  }

  // Filter classes by species
  const filtered = speciesFilter === 'all' ? classes : classes.filter(c => c.species === speciesFilter);

  // Group by species for display
  const bySpecies = {};
  for (const cls of filtered) {
    if (!bySpecies[cls.species]) bySpecies[cls.species] = [];
    bySpecies[cls.species].push(cls);
  }

  const unitSys = getUnitSystem();
  const listWrap = el('div', { 'data-testid': 'animals-class-list' });

  for (const [species, clsList] of Object.entries(bySpecies)) {
    listWrap.appendChild(el('div', { className: 'species-header' }, [t(`animal.species.${species}`)]));

    const list = el('div', { className: 'cls-list' });
    for (const cls of clsList) {
      const detailParts = [];
      detailParts.push(t(`animal.role.${cls.role}`));
      if (cls.defaultWeightKg != null) {
        detailParts.push(display(cls.defaultWeightKg, 'weight', unitSys, 0));
      }
      if (cls.dmiPct != null) {
        detailParts.push(`${cls.dmiPct}% DMI`);
      }
      if (cls.weaningAgeDays != null) {
        detailParts.push(`${cls.weaningAgeDays}d wean`);
      }

      list.appendChild(el('div', {
        className: 'cls-row',
        'data-testid': `animals-class-${cls.id}`,
      }, [
        el('div', {}, [
          el('div', { className: 'cls-row-name' }, [cls.name]),
          el('div', { className: 'cls-row-detail' }, [detailParts.join(' · ')]),
        ]),
        el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
          el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `animals-class-edit-${cls.id}`,
            onClick: () => openClassSheet(cls, operationId),
          }, [t('action.edit')]),
          el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `animals-class-delete-${cls.id}`,
            onClick: () => {
              if (window.confirm(t('animal.confirmDeleteClass'))) {
                remove('animalClasses', cls.id, 'animal_classes');
              }
            },
          }, [t('action.delete')]),
        ]),
      ]));
    }
    listWrap.appendChild(list);
  }

  wrap.appendChild(listWrap);
  return wrap;
}

// ---------------------------------------------------------------------------
// Class sheet
// ---------------------------------------------------------------------------

let classSheet = null;

function renderClassSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'class-sheet-wrap' }, [
    el('div', {
      className: 'sheet-backdrop',
      onClick: () => classSheet && classSheet.close(),
    }),
    el('div', { className: 'sheet-panel', id: 'class-sheet-panel' }),
  ]);
}

function openClassSheet(existingCls, operationId) {
  if (!classSheet) {
    classSheet = new Sheet('class-sheet-wrap');
  }

  const panel = document.getElementById('class-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existingCls;
  const unitSys = getUnitSystem();
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('animal.editClass') : t('animal.createClass'),
  ]));

  // Name
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.className')]));
  inputs.name = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingCls?.name || '',
    'data-testid': 'class-sheet-name',
  });
  panel.appendChild(inputs.name);

  // Species
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.classSpecies')]));
  inputs.species = el('select', {
    className: 'auth-select',
    'data-testid': 'class-sheet-species',
  }, [
    el('option', { value: 'beef_cattle' }, [t('animal.species.beef_cattle')]),
    el('option', { value: 'dairy_cattle' }, [t('animal.species.dairy_cattle')]),
    el('option', { value: 'sheep' }, [t('animal.species.sheep')]),
    el('option', { value: 'goat' }, [t('animal.species.goat')]),
    el('option', { value: 'other' }, [t('animal.species.other')]),
  ]);
  if (existingCls?.species) inputs.species.value = existingCls.species;
  panel.appendChild(inputs.species);

  // Role
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.classRole')]));
  inputs.role = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingCls?.role || '',
    placeholder: 'cow, heifer, bull, steer, calf...',
    'data-testid': 'class-sheet-role',
  });
  panel.appendChild(inputs.role);

  // Default weight
  const weightLabel = `${t('animal.defaultWeight')} (${unitLabel('weight', unitSys)})`;
  const weightValue = existingCls?.defaultWeightKg != null && unitSys === 'imperial'
    ? convert(existingCls.defaultWeightKg, 'weight', 'toImperial').toFixed(0)
    : (existingCls?.defaultWeightKg ?? '');
  panel.appendChild(el('label', { className: 'form-label' }, [weightLabel]));
  inputs.defaultWeightKg = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: weightValue,
    'data-testid': 'class-sheet-weight',
  });
  panel.appendChild(inputs.defaultWeightKg);

  // DMI %
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.dmiPct')]));
  inputs.dmiPct = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingCls?.dmiPct ?? '',
    'data-testid': 'class-sheet-dmi-pct',
  });
  panel.appendChild(inputs.dmiPct);

  // DMI % Lactating
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.dmiPctLactating')]));
  inputs.dmiPctLactating = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingCls?.dmiPctLactating ?? '',
    'data-testid': 'class-sheet-dmi-pct-lactating',
  });
  panel.appendChild(inputs.dmiPctLactating);

  // Excretion rates
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.excretionN')]));
  inputs.excretionNRate = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingCls?.excretionNRate ?? '',
    'data-testid': 'class-sheet-excretion-n',
  });
  panel.appendChild(inputs.excretionNRate);

  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.excretionP')]));
  inputs.excretionPRate = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingCls?.excretionPRate ?? '',
    'data-testid': 'class-sheet-excretion-p',
  });
  panel.appendChild(inputs.excretionPRate);

  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.excretionK')]));
  inputs.excretionKRate = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingCls?.excretionKRate ?? '',
    'data-testid': 'class-sheet-excretion-k',
  });
  panel.appendChild(inputs.excretionKRate);

  // Weaning age
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.weaningAge')]));
  inputs.weaningAgeDays = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingCls?.weaningAgeDays ?? '',
    'data-testid': 'class-sheet-weaning-age',
  });
  panel.appendChild(inputs.weaningAgeDays);

  // Status
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'class-sheet-status' });
  panel.appendChild(statusEl);

  // Actions
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'class-sheet-save',
      onClick: () => saveClass(existingCls, inputs, operationId, unitSys, statusEl),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'class-sheet-cancel',
      onClick: () => classSheet.close(),
    }, [t('action.cancel')]),
  ]));

  classSheet.open();
}

function saveClass(existingCls, inputs, operationId, unitSys, statusEl) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const parseNum = (input) => {
    const v = input.value;
    return v === '' ? null : parseFloat(v);
  };

  let defaultWeightKg = parseNum(inputs.defaultWeightKg);
  if (defaultWeightKg != null && unitSys === 'imperial') {
    defaultWeightKg = convert(defaultWeightKg, 'weight', 'toMetric');
  }

  const data = {
    operationId,
    name: inputs.name.value.trim(),
    species: inputs.species.value,
    role: inputs.role.value.trim(),
    defaultWeightKg,
    dmiPct: parseNum(inputs.dmiPct),
    dmiPctLactating: parseNum(inputs.dmiPctLactating),
    excretionNRate: parseNum(inputs.excretionNRate),
    excretionPRate: parseNum(inputs.excretionPRate),
    excretionKRate: parseNum(inputs.excretionKRate),
    weaningAgeDays: parseNum(inputs.weaningAgeDays),
  };

  try {
    if (existingCls) {
      update('animalClasses', existingCls.id, data, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
    } else {
      const record = AnimalClassEntity.create(data);
      add('animalClasses', record, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
    }
    classSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}

// ---------------------------------------------------------------------------
// Animals tab (CP-16)
// ---------------------------------------------------------------------------

function renderAnimalsTab(rootContainer, operationId, farmId) {
  const animals = getAll('animals').filter(a => a.active);

  const wrap = el('div', {});

  // Action bar: search + add
  const searchInput = el('input', {
    type: 'text',
    className: 'search-input',
    placeholder: t('animal.searchPlaceholder'),
    value: searchQuery,
    'data-testid': 'animals-search',
    onInput: (e) => { searchQuery = e.target.value; renderAnimalTable(wrap, animals, operationId, farmId, rootContainer); },
  });

  wrap.appendChild(el('div', { className: 'search-bar' }, [
    searchInput,
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': 'animals-add-animal-btn',
      onClick: () => openAnimalSheet(null, operationId, farmId),
    }, [t('animal.addAnimal')]),
  ]));

  // Table container
  wrap.appendChild(el('div', { 'data-testid': 'animals-animal-table-wrap' }));

  // Render table immediately
  renderAnimalTable(wrap, animals, operationId, farmId, rootContainer);

  return wrap;
}

function renderAnimalTable(wrap, allAnimals, operationId, farmId, _rootContainer) {
  const tableWrap = wrap.querySelector('[data-testid="animals-animal-table-wrap"]');
  if (!tableWrap) return;
  clear(tableWrap);

  // Filter by search
  const q = searchQuery.toLowerCase().trim();
  let filtered = allAnimals;
  if (q) {
    filtered = allAnimals.filter(a => {
      const tag = (a.tagNum || '').toLowerCase();
      const name = (a.name || '').toLowerCase();
      const eid = (a.eid || '').toLowerCase();
      return tag.includes(q) || name.includes(q) || eid.includes(q);
    });
  }

  if (!filtered.length) {
    const msg = allAnimals.length ? t('animal.emptyFiltered') : t('animal.empty');
    tableWrap.appendChild(el('p', { className: 'form-hint', 'data-testid': 'animals-animal-empty' }, [msg]));
    return;
  }

  // Build lookup maps
  const classes = getAll('animalClasses');
  const classMap = {};
  for (const c of classes) classMap[c.id] = c;

  const groups = getAll('groups');
  const groupMap = {};
  for (const g of groups) groupMap[g.id] = g;

  const memberships = getAll('animalGroupMemberships');
  const currentGroupMap = {};
  for (const m of memberships) {
    if (!m.dateLeft) currentGroupMap[m.animalId] = m.groupId;
  }

  // Latest weight and BCS per animal (CP-33)
  const unitSys = getUnitSystem();
  const allWeights = getAll('animalWeightRecords');
  const latestWeightMap = {};
  for (const w of allWeights) {
    if (!latestWeightMap[w.animalId] || w.recordedAt > latestWeightMap[w.animalId].recordedAt) {
      latestWeightMap[w.animalId] = w;
    }
  }
  const allBcs = getAll('animalBcsScores');
  const latestBcsMap = {};
  for (const b of allBcs) {
    if (!latestBcsMap[b.animalId] || b.scoredAt > latestBcsMap[b.animalId].scoredAt) {
      latestBcsMap[b.animalId] = b;
    }
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortColumn === 'tag') {
      cmp = (a.tagNum || '').localeCompare(b.tagNum || '', undefined, { numeric: true });
    } else if (sortColumn === 'class') {
      const ca = classMap[a.classId]?.name || '';
      const cb = classMap[b.classId]?.name || '';
      cmp = ca.localeCompare(cb);
    } else if (sortColumn === 'group') {
      const ga = groupMap[currentGroupMap[a.id]]?.name || '';
      const gb = groupMap[currentGroupMap[b.id]]?.name || '';
      cmp = ga.localeCompare(gb);
    }
    return sortAsc ? cmp : -cmp;
  });

  const sortArrow = (col) => {
    if (sortColumn !== col) return '';
    return sortAsc ? ' \u25B2' : ' \u25BC';
  };

  const handleSort = (col, rootContainer) => {
    if (sortColumn === col) {
      sortAsc = !sortAsc;
    } else {
      sortColumn = col;
      sortAsc = true;
    }
    rerender(rootContainer);
  };

  // We need rootContainer for sort clicks — get it from the ancestors
  // Since _rootContainer could be stale, we use the wrap's parent
  const getRootContainer = () => {
    let node = tableWrap;
    while (node && !node.querySelector('[data-testid="animals-screen"]')) {
      node = node.parentElement;
    }
    return node?.parentElement || null;
  };

  const table = el('table', { className: 'animal-table', 'data-testid': 'animals-animal-table' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {
          'data-testid': 'animals-sort-tag',
          onClick: () => handleSort('tag', getRootContainer()),
        }, [t('animal.sortTag') + sortArrow('tag')]),
        el('th', {
          'data-testid': 'animals-sort-class',
          onClick: () => handleSort('class', getRootContainer()),
        }, [t('animal.sortClass') + sortArrow('class')]),
        el('th', {
          'data-testid': 'animals-sort-group',
          onClick: () => handleSort('group', getRootContainer()),
        }, [t('animal.sortGroup') + sortArrow('group')]),
        el('th', {}, [t('animal.sex')]),
        el('th', {}, ['']),
      ]),
    ]),
    el('tbody', {}, sorted.map(animal => {
      const cls = classMap[animal.classId];
      const grpId = currentGroupMap[animal.id];
      const grp = grpId ? groupMap[grpId] : null;
      const displayName = animal.tagNum || animal.name || animal.eid || animal.id.slice(0, 8);

      const latestWeight = latestWeightMap[animal.id];
      const latestBcs = latestBcsMap[animal.id];
      const weightDisplay = latestWeight
        ? display(latestWeight.weightKg, 'weight', unitSys, 0)
        : t('health.noWeight');
      const bcsDisplay = latestBcs ? `BCS ${latestBcs.score}` : t('health.noBcs');

      return el('tr', { 'data-testid': `animals-animal-row-${animal.id}` }, [
        el('td', {}, [
          el('div', { style: { fontWeight: '500' } }, [displayName]),
          el('div', { className: 'ft-row-detail' }, [`${weightDisplay} · ${bcsDisplay}`]),
        ]),
        el('td', {}, [cls ? cls.name : t('animal.noClass')]),
        el('td', {}, [grp ? grp.name : t('animal.noGroup')]),
        el('td', {}, [animal.sex === 'male' ? t('animal.sexMale') : t('animal.sexFemale')]),
        el('td', {}, [
          el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
            el('button', {
              className: 'btn btn-outline btn-xs',
              'data-testid': `animals-animal-edit-${animal.id}`,
              onClick: () => openAnimalSheet(animal, operationId, farmId),
            }, [t('action.edit')]),
            el('button', {
              className: 'btn btn-outline btn-xs',
              'data-testid': `animals-animal-delete-${animal.id}`,
              onClick: () => {
                if (window.confirm(t('animal.confirmDelete'))) {
                  remove('animals', animal.id, 'animals');
                }
              },
            }, [t('action.delete')]),
            el('button', {
              className: 'btn btn-outline btn-xs',
              'data-testid': `animals-animal-weight-${animal.id}`,
              onClick: () => openWeightSheet(animal, operationId),
            }, [t('health.recordWeight')]),
            el('button', {
              className: 'btn btn-outline btn-xs',
              'data-testid': `animals-animal-bcs-${animal.id}`,
              onClick: () => openBcsSheet(animal, operationId),
            }, [t('health.recordBcs')]),
            el('button', {
              className: 'btn btn-outline btn-xs',
              'data-testid': `animals-animal-treatment-${animal.id}`,
              onClick: () => openTreatmentSheet(animal, operationId),
            }, [t('health.recordTreatment')]),
            el('button', {
              className: 'btn btn-outline btn-xs',
              'data-testid': `animals-animal-breeding-${animal.id}`,
              onClick: () => openBreedingSheet(animal, operationId),
            }, [t('health.recordBreeding')]),
            el('button', {
              className: 'btn btn-outline btn-xs',
              'data-testid': `animals-animal-heat-${animal.id}`,
              onClick: () => openHeatSheet(animal, operationId),
            }, [t('health.recordHeat')]),
          ]),
        ]),
      ]);
    })),
  ]);

  tableWrap.appendChild(el('div', { className: 'animal-table-wrap' }, [table]));
}

// ---------------------------------------------------------------------------
// Animal sheet (create / edit)
// ---------------------------------------------------------------------------

let animalSheet = null;

function renderAnimalSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'animal-sheet-wrap' }, [
    el('div', {
      className: 'sheet-backdrop',
      onClick: () => animalSheet && animalSheet.close(),
    }),
    el('div', { className: 'sheet-panel', id: 'animal-sheet-panel' }),
  ]);
}

function openAnimalSheet(existingAnimal, operationId, farmId) {
  if (!animalSheet) {
    animalSheet = new Sheet('animal-sheet-wrap');
  }

  const panel = document.getElementById('animal-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existingAnimal;
  const inputs = {};

  const classes = getAll('animalClasses').filter(c => !c.archived);
  const groups = getAll('groups').filter(g => !g.archived);

  // Find current group for existing animal
  let currentGroupId = '';
  if (isEdit) {
    const memberships = getAll('animalGroupMemberships');
    const active = memberships.find(m => m.animalId === existingAnimal.id && !m.dateLeft);
    if (active) currentGroupId = active.groupId;
  }

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('animal.editAnimal') : t('animal.createAnimal'),
  ]));

  // Tag #
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.tagNum')]));
  inputs.tagNum = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingAnimal?.tagNum || '',
    'data-testid': 'animal-sheet-tag',
  });
  panel.appendChild(inputs.tagNum);

  // Name
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.animalName')]));
  inputs.name = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingAnimal?.name || '',
    'data-testid': 'animal-sheet-name',
  });
  panel.appendChild(inputs.name);

  // EID
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.eid')]));
  inputs.eid = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingAnimal?.eid || '',
    'data-testid': 'animal-sheet-eid',
  });
  panel.appendChild(inputs.eid);

  // Sex toggle
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.sex')]));
  const sexState = { value: existingAnimal?.sex || 'female' };
  const sexRow = el('div', { className: 'btn-row', 'data-testid': 'animal-sheet-sex' });
  const renderSexButtons = () => {
    clear(sexRow);
    sexRow.appendChild(el('button', {
      className: `btn btn-sm ${sexState.value === 'female' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'animal-sheet-sex-female',
      onClick: () => { sexState.value = 'female'; renderSexButtons(); },
    }, [t('animal.sexFemale')]));
    sexRow.appendChild(el('button', {
      className: `btn btn-sm ${sexState.value === 'male' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'animal-sheet-sex-male',
      onClick: () => { sexState.value = 'male'; renderSexButtons(); },
    }, [t('animal.sexMale')]));
  };
  renderSexButtons();
  panel.appendChild(sexRow);

  // Class
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.class')]));
  inputs.classId = el('select', {
    className: 'auth-select',
    'data-testid': 'animal-sheet-class',
  }, [
    el('option', { value: '' }, [t('animal.noClass')]),
    ...classes.map(c => el('option', { value: c.id }, [c.name])),
  ]);
  if (existingAnimal?.classId) inputs.classId.value = existingAnimal.classId;
  panel.appendChild(inputs.classId);

  // Group
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.group')]));
  inputs.groupId = el('select', {
    className: 'auth-select',
    'data-testid': 'animal-sheet-group',
  }, [
    el('option', { value: '' }, [t('animal.noGroup')]),
    ...groups.map(g => el('option', { value: g.id }, [g.name])),
  ]);
  inputs.groupId.value = currentGroupId;
  panel.appendChild(inputs.groupId);

  // Birth date
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.birthDate')]));
  inputs.birthDate = el('input', {
    type: 'date',
    className: 'auth-input',
    value: existingAnimal?.birthDate || '',
    'data-testid': 'animal-sheet-birth-date',
  });
  panel.appendChild(inputs.birthDate);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('animal.notes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input',
    value: existingAnimal?.notes || '',
    'data-testid': 'animal-sheet-notes',
    style: { minHeight: '60px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  // Status
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'animal-sheet-status' });
  panel.appendChild(statusEl);

  // Actions
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'animal-sheet-save',
      onClick: () => saveAnimal(existingAnimal, sexState, inputs, operationId, farmId, currentGroupId, statusEl),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'animal-sheet-cancel',
      onClick: () => animalSheet.close(),
    }, [t('action.cancel')]),
  ]));

  animalSheet.open();
}

function saveAnimal(existingAnimal, sexState, inputs, operationId, farmId, previousGroupId, statusEl) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const data = {
    operationId,
    tagNum: inputs.tagNum.value.trim() || null,
    name: inputs.name.value.trim() || null,
    eid: inputs.eid.value.trim() || null,
    sex: sexState.value,
    classId: inputs.classId.value || null,
    birthDate: inputs.birthDate.value || null,
    notes: inputs.notes.value.trim() || null,
  };

  const newGroupId = inputs.groupId.value || null;
  const todayStr = new Date().toISOString().slice(0, 10);

  try {
    let animalId;
    if (existingAnimal) {
      update('animals', existingAnimal.id, data, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
      animalId = existingAnimal.id;
    } else {
      const record = AnimalEntity.create(data);
      add('animals', record, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
      animalId = record.id;
    }

    // Handle group assignment changes via membership ledger
    if (newGroupId !== previousGroupId) {
      // Close old membership
      if (previousGroupId) {
        const memberships = getAll('animalGroupMemberships');
        const oldMembership = memberships.find(m => m.animalId === animalId && m.groupId === previousGroupId && !m.dateLeft);
        if (oldMembership) {
          update('animalGroupMemberships', oldMembership.id, { dateLeft: todayStr, reason: 'move' },
            MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
        }
      }
      // Open new membership
      if (newGroupId) {
        const newMembership = MembershipEntity.create({
          operationId,
          animalId,
          groupId: newGroupId,
          dateJoined: todayStr,
          reason: previousGroupId ? 'move' : 'initial',
        });
        add('animalGroupMemberships', newMembership, MembershipEntity.validate,
          MembershipEntity.toSupabaseShape, 'animal_group_memberships');
      }
    }

    animalSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}

// ---------------------------------------------------------------------------
// Rerender
// ---------------------------------------------------------------------------

function rerender(container) {
  if (container) {
    clear(container);
    renderAnimalsScreen(container);
  }
}
