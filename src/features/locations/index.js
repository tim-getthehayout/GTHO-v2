/** @file Locations screen — CP-14. Location & forage type CRUD with filter pills. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe, getVisibleLocations, getActiveFarmId } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import * as LocationEntity from '../../entities/location.js';
import * as ForageTypeEntity from '../../entities/forage-type.js';

/** Current filter state */
let activeFilter = 'all';

/** Unsubscribe functions for reactive updates */
let unsubs = [];

/**
 * Render the full locations screen.
 * @param {HTMLElement} container
 */
export function renderLocationsScreen(container) {
  // Clean up previous subscriptions
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  const farms = getAll('farms');
  if (!operations.length || !farms.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('location.title')]));
    container.appendChild(el('p', {}, [t('error.generic')]));
    return;
  }

  const operationId = operations[0].id;
  const farmId = farms[0].id;

  // Build screen
  const screenEl = el('div', { 'data-testid': 'locations-screen' }, [
    // Header bar
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('location.title')]),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'locations-add-btn',
        onClick: () => openLocationSheet(null, operationId, farmId, container),
      }, [t('location.addNew')]),
    ]),

    // Filter pills
    renderFilterPills(container),

    // Location list
    el('div', { 'data-testid': 'locations-list' }),

    // Forage types section
    el('div', { className: 'section-divider' }, [
      el('div', { className: 'screen-action-bar' }, [
        el('h2', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('location.forageTypes')]),
        el('button', {
          className: 'btn btn-outline btn-sm',
          'data-testid': 'locations-add-forage-type-btn',
          onClick: () => openForageTypeSheet(null, operationId, container),
        }, [t('location.addForageType')]),
      ]),
      el('div', { 'data-testid': 'locations-forage-type-list' }),
    ]),

    // Location sheet (always in DOM)
    renderLocationSheetMarkup(),

    // Forage type sheet (always in DOM)
    renderForageTypeSheetMarkup(),
  ]);

  container.appendChild(screenEl);

  // Initial render of lists
  renderLocationList(container);
  renderForageTypeList(container);

  // Subscribe for reactive updates
  unsubs.push(subscribe('locations', () => renderLocationList(container)));
  unsubs.push(subscribe('forageTypes', () => {
    renderForageTypeList(container);
    renderLocationList(container); // forage type name may appear on location cards
  }));
}

// ---------------------------------------------------------------------------
// Filter pills
// ---------------------------------------------------------------------------

function renderFilterPills(rootContainer) {
  const filters = [
    { key: 'all', label: t('location.filter.all') },
    { key: 'pasture', label: t('location.filter.pasture') },
    { key: 'mixed_use', label: t('location.filter.mixedUse') },
    { key: 'crop', label: t('location.filter.crop') },
    { key: 'confinement', label: t('location.filter.confinement') },
  ];

  return el('div', { className: 'filter-pills', 'data-testid': 'locations-filter-pills' },
    filters.map(f =>
      el('button', {
        className: `fp${activeFilter === f.key ? ' active' : ''}`,
        'data-testid': `locations-filter-${f.key}`,
        onClick: () => {
          activeFilter = f.key;
          rerender(rootContainer);
        },
      }, [f.label])
    )
  );
}

// ---------------------------------------------------------------------------
// Location list
// ---------------------------------------------------------------------------

function filterLocations(locations) {
  const active = locations.filter(l => !l.archived);
  if (activeFilter === 'all') return active;
  if (activeFilter === 'confinement') return active.filter(l => l.type === 'confinement');
  // pasture, mixed_use, crop — all are type='land' with matching land_use
  return active.filter(l => l.type === 'land' && l.landUse === activeFilter);
}

function renderLocationList(rootContainer) {
  const listEl = rootContainer.querySelector('[data-testid="locations-list"]');
  if (!listEl) return;
  clear(listEl);

  const locations = getVisibleLocations();
  const filtered = filterLocations(locations);
  const operations = getAll('operations');
  const farms = getAll('farms');
  const operationId = operations[0]?.id;
  const farmId = farms[0]?.id;

  if (!filtered.length) {
    const msg = locations.length ? t('location.emptyFiltered') : t('location.empty');
    listEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'locations-empty' }, [msg]));
    return;
  }

  const list = el('div', { className: 'loc-list' });
  for (const loc of filtered) {
    list.appendChild(renderLocationCard(loc, operationId, farmId, rootContainer));
  }
  listEl.appendChild(list);
}

function renderLocationCard(loc, operationId, farmId, rootContainer) {
  const unitSys = getUnitSystem();
  const badge = getTypeBadge(loc);
  const detailParts = [];

  if (loc.type === 'land' && loc.areaHectares != null) {
    detailParts.push(display(loc.areaHectares, 'area', unitSys, 1));
  }
  if (loc.fieldCode) {
    detailParts.push(loc.fieldCode);
  }
  if (loc.forageTypeId) {
    const ft = getById('forageTypes', loc.forageTypeId);
    if (ft) detailParts.push(ft.name);
  }
  if (loc.type === 'confinement' && loc.capturePercent != null) {
    detailParts.push(`${loc.capturePercent}% ${t('location.capturePercent').toLowerCase()}`);
  }

  return el('div', {
    className: 'card loc-card',
    'data-testid': `locations-card-${loc.id}`,
  }, [
    el('div', { className: 'loc-card-head' }, [
      el('span', { className: 'loc-card-name' }, [loc.name]),
      badge,
    ]),
    detailParts.length
      ? el('div', { className: 'loc-card-detail' }, [detailParts.join(' · ')])
      : null,
    el('div', { className: 'loc-card-actions' }, [
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': `locations-edit-${loc.id}`,
        onClick: () => openLocationSheet(loc, operationId, farmId, rootContainer),
      }, [t('action.edit')]),
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': `locations-delete-${loc.id}`,
        onClick: () => {
          if (window.confirm(t('location.confirmDelete'))) {
            remove('locations', loc.id, 'locations');
          }
        },
      }, [t('action.delete')]),
    ]),
  ].filter(Boolean));
}

function getTypeBadge(loc) {
  if (loc.type === 'confinement') {
    return el('span', { className: 'badge badge-amber' }, [t('location.type.confinement')]);
  }
  // land types
  const badgeMap = {
    pasture: { cls: 'badge-green', label: t('location.landUse.pasture') },
    mixed_use: { cls: 'badge-teal', label: t('location.landUse.mixedUse') },
    crop: { cls: 'badge-purple', label: t('location.landUse.crop') },
  };
  const b = badgeMap[loc.landUse] || { cls: 'badge-green', label: t('location.type.land') };
  return el('span', { className: `badge ${b.cls}` }, [b.label]);
}

// ---------------------------------------------------------------------------
// Location sheet (create / edit)
// ---------------------------------------------------------------------------

let locationSheet = null;

function renderLocationSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'location-sheet-wrap' }, [
    el('div', {
      className: 'sheet-backdrop',
      onClick: () => locationSheet && locationSheet.close(),
    }),
    el('div', { className: 'sheet-panel', id: 'location-sheet-panel' }),
  ]);
}

function openLocationSheet(existingLoc, operationId, farmId, rootContainer) {
  if (!locationSheet) {
    locationSheet = new Sheet('location-sheet-wrap');
  }

  const panel = document.getElementById('location-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existingLoc;
  const unitSys = getUnitSystem();
  const forageTypes = getAll('forageTypes').filter(ft => !ft.archived);

  // Form state
  const inputs = {};

  // Title
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('location.editTitle') : t('location.createTitle'),
  ]));

  // Name
  panel.appendChild(el('label', { className: 'form-label' }, [t('location.name')]));
  inputs.name = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingLoc?.name || '',
    'data-testid': 'location-sheet-name',
  });
  panel.appendChild(inputs.name);

  // Type toggle
  panel.appendChild(el('label', { className: 'form-label' }, [t('location.type.land') + ' / ' + t('location.type.confinement')]));
  const typeState = { value: existingLoc?.type || 'land' };
  const typeRow = el('div', { className: 'btn-row', 'data-testid': 'location-sheet-type' });
  const renderTypeButtons = () => {
    clear(typeRow);
    typeRow.appendChild(el('button', {
      className: `btn btn-sm ${typeState.value === 'land' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'location-sheet-type-land',
      onClick: () => { typeState.value = 'land'; renderTypeButtons(); updateConditionalFields(); },
    }, [t('location.type.land')]));
    typeRow.appendChild(el('button', {
      className: `btn btn-sm ${typeState.value === 'confinement' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'location-sheet-type-confinement',
      onClick: () => { typeState.value = 'confinement'; renderTypeButtons(); updateConditionalFields(); },
    }, [t('location.type.confinement')]));
  };
  renderTypeButtons();
  panel.appendChild(typeRow);

  // Conditional fields container
  const conditionalEl = el('div', { 'data-testid': 'location-sheet-conditional' });
  panel.appendChild(conditionalEl);

  // Land use select
  inputs.landUse = el('select', {
    className: 'auth-select',
    'data-testid': 'location-sheet-land-use',
  }, [
    el('option', { value: 'pasture' }, [t('location.landUse.pasture')]),
    el('option', { value: 'mixed_use' }, [t('location.landUse.mixedUse')]),
    el('option', { value: 'crop' }, [t('location.landUse.crop')]),
  ]);
  if (existingLoc?.landUse) inputs.landUse.value = existingLoc.landUse;

  // Area
  const areaLabel = `${t('location.area')} (${unitLabel('area', unitSys)})`;
  const areaValue = existingLoc?.areaHectares != null && unitSys === 'imperial'
    ? convert(existingLoc.areaHectares, 'area', 'toImperial').toFixed(2)
    : (existingLoc?.areaHectares ?? '');
  inputs.area = el('input', {
    type: 'number',
    className: 'auth-input',
    value: areaValue,
    'data-testid': 'location-sheet-area',
  });

  // Field code
  inputs.fieldCode = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingLoc?.fieldCode || '',
    'data-testid': 'location-sheet-field-code',
  });

  // Soil type
  inputs.soilType = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingLoc?.soilType || '',
    'data-testid': 'location-sheet-soil-type',
  });

  // Forage type select
  inputs.forageTypeId = el('select', {
    className: 'auth-select',
    'data-testid': 'location-sheet-forage-type',
  }, [
    el('option', { value: '' }, [t('location.noForageType')]),
    ...forageTypes.map(ft =>
      el('option', { value: ft.id }, [ft.name])
    ),
  ]);
  if (existingLoc?.forageTypeId) inputs.forageTypeId.value = existingLoc.forageTypeId;

  // Capture percent
  inputs.capturePercent = el('input', {
    type: 'number',
    className: 'auth-input',
    value: existingLoc?.capturePercent ?? 100,
    'data-testid': 'location-sheet-capture-percent',
  });

  function updateConditionalFields() {
    clear(conditionalEl);
    if (typeState.value === 'land') {
      conditionalEl.appendChild(el('label', { className: 'form-label' }, [t('location.landUse.label')]));
      conditionalEl.appendChild(inputs.landUse);
      conditionalEl.appendChild(el('label', { className: 'form-label' }, [areaLabel]));
      conditionalEl.appendChild(inputs.area);
      conditionalEl.appendChild(el('label', { className: 'form-label' }, [t('location.soilType')]));
      conditionalEl.appendChild(inputs.soilType);
      conditionalEl.appendChild(el('label', { className: 'form-label' }, [t('location.forageType')]));
      conditionalEl.appendChild(inputs.forageTypeId);
    } else {
      conditionalEl.appendChild(el('label', { className: 'form-label' }, [t('location.capturePercent')]));
      conditionalEl.appendChild(inputs.capturePercent);
      conditionalEl.appendChild(el('div', { className: 'form-hint' }, [t('location.captureHint')]));
    }
    // Common: field code
    conditionalEl.appendChild(el('label', { className: 'form-label' }, [t('location.fieldCode')]));
    conditionalEl.appendChild(inputs.fieldCode);
  }

  updateConditionalFields();

  // Status element
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'location-sheet-status' });
  panel.appendChild(statusEl);

  // Action buttons
  const actions = el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'location-sheet-save',
      onClick: () => saveLocation(existingLoc, typeState, inputs, operationId, farmId, unitSys, statusEl, rootContainer),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'location-sheet-cancel',
      onClick: () => locationSheet.close(),
    }, [t('action.cancel')]),
  ]);
  panel.appendChild(actions);

  locationSheet.open();
}

function saveLocation(existingLoc, typeState, inputs, operationId, farmId, unitSys, statusEl, _rootContainer) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const type = typeState.value;
  const name = inputs.name.value.trim();

  // Convert area back to metric if imperial
  let areaHectares = null;
  if (type === 'land' && inputs.area.value !== '') {
    const areaVal = parseFloat(inputs.area.value);
    areaHectares = unitSys === 'imperial' ? convert(areaVal, 'area', 'toMetric') : areaVal;
  }

  const data = {
    operationId,
    farmId,
    name,
    type,
    landUse: type === 'land' ? inputs.landUse.value : null,
    areaHectares,
    fieldCode: inputs.fieldCode.value.trim() || null,
    soilType: type === 'land' ? (inputs.soilType.value.trim() || null) : null,
    forageTypeId: type === 'land' ? (inputs.forageTypeId.value || null) : null,
    capturePercent: type === 'confinement' && inputs.capturePercent.value !== ''
      ? parseFloat(inputs.capturePercent.value) : null,
    archived: false,
  };

  try {
    if (existingLoc) {
      update('locations', existingLoc.id, data, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    } else {
      const record = LocationEntity.create(data);
      add('locations', record, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    }
    locationSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}

// ---------------------------------------------------------------------------
// Forage type list
// ---------------------------------------------------------------------------

function renderForageTypeList(rootContainer) {
  const listEl = rootContainer.querySelector('[data-testid="locations-forage-type-list"]');
  if (!listEl) return;
  clear(listEl);

  const forageTypes = getAll('forageTypes').filter(ft => !ft.archived);
  const operations = getAll('operations');
  const operationId = operations[0]?.id;

  if (!forageTypes.length) {
    listEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'locations-forage-type-empty' }, [t('location.forageTypeEmpty')]));
    return;
  }

  const unitSys = getUnitSystem();
  const list = el('div', { className: 'ft-list' });
  for (const ft of forageTypes) {
    const detailParts = [];
    if (ft.utilizationPct != null) detailParts.push(`${ft.utilizationPct}% util`);
    if (ft.minResidualHeightCm != null) {
      detailParts.push(display(ft.minResidualHeightCm, 'length', unitSys, 1) + ' residual');
    }
    if (ft.dmPct != null) detailParts.push(`${ft.dmPct}% DM`);

    list.appendChild(el('div', {
      className: 'ft-row',
      'data-testid': `locations-forage-type-${ft.id}`,
    }, [
      el('div', {}, [
        el('div', { className: 'ft-row-name' }, [ft.name]),
        detailParts.length
          ? el('div', { className: 'ft-row-detail' }, [detailParts.join(' · ')])
          : null,
      ].filter(Boolean)),
      el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `locations-forage-type-edit-${ft.id}`,
          onClick: () => openForageTypeSheet(ft, operationId, rootContainer),
        }, [t('action.edit')]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `locations-forage-type-delete-${ft.id}`,
          onClick: () => {
            remove('forageTypes', ft.id, 'forage_types');
          },
        }, [t('action.delete')]),
      ]),
    ]));
  }
  listEl.appendChild(list);
}

// ---------------------------------------------------------------------------
// Forage type sheet (create / edit)
// ---------------------------------------------------------------------------

let forageTypeSheet = null;

function renderForageTypeSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'forage-type-sheet-wrap' }, [
    el('div', {
      className: 'sheet-backdrop',
      onClick: () => forageTypeSheet && forageTypeSheet.close(),
    }),
    el('div', { className: 'sheet-panel', id: 'forage-type-sheet-panel' }),
  ]);
}

function openForageTypeSheet(existingFt, operationId, _rootContainer) {
  if (!forageTypeSheet) {
    forageTypeSheet = new Sheet('forage-type-sheet-wrap');
  }

  const panel = document.getElementById('forage-type-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existingFt;
  const unitSys = getUnitSystem();
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('location.editForageType') : t('location.createForageType'),
  ]));

  // Name
  panel.appendChild(el('label', { className: 'form-label' }, [t('location.forageTypeName')]));
  inputs.name = el('input', {
    type: 'text',
    className: 'auth-input',
    value: existingFt?.name || '',
    'data-testid': 'forage-type-sheet-name',
  });
  panel.appendChild(inputs.name);

  // DM %
  panel.appendChild(el('label', { className: 'form-label' }, [t('location.dmPct')]));
  inputs.dmPct = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingFt?.dmPct ?? '',
    'data-testid': 'forage-type-sheet-dm-pct',
  });
  panel.appendChild(inputs.dmPct);

  // Utilization %
  panel.appendChild(el('label', { className: 'form-label' }, [t('location.utilizationPct')]));
  inputs.utilizationPct = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingFt?.utilizationPct ?? '',
    'data-testid': 'forage-type-sheet-utilization-pct',
  });
  panel.appendChild(inputs.utilizationPct);

  // Min residual height
  const heightLabel = `${t('location.minResidualHeight')} (${unitLabel('length', unitSys)})`;
  const heightValue = existingFt?.minResidualHeightCm != null && unitSys === 'imperial'
    ? convert(existingFt.minResidualHeightCm, 'length', 'toImperial').toFixed(2)
    : (existingFt?.minResidualHeightCm ?? '');
  panel.appendChild(el('label', { className: 'form-label' }, [heightLabel]));
  inputs.minResidualHeightCm = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: heightValue,
    'data-testid': 'forage-type-sheet-min-residual',
  });
  panel.appendChild(inputs.minResidualHeightCm);

  // DM kg/cm/ha
  panel.appendChild(el('label', { className: 'form-label' }, [t('location.dmKgPerCmPerHa')]));
  inputs.dmKgPerCmPerHa = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: existingFt?.dmKgPerCmPerHa ?? '',
    'data-testid': 'forage-type-sheet-dm-yield',
  });
  panel.appendChild(inputs.dmKgPerCmPerHa);

  // NPK per tonne DM
  panel.appendChild(el('label', { className: 'form-label' }, [t('location.npk')]));
  const npkRow = el('div', { style: { display: 'flex', gap: 'var(--space-3)' } });
  inputs.nPerTonneDm = el('input', {
    type: 'number', className: 'auth-input settings-input', placeholder: 'N',
    value: existingFt?.nPerTonneDm ?? '', 'data-testid': 'forage-type-sheet-n',
  });
  inputs.pPerTonneDm = el('input', {
    type: 'number', className: 'auth-input settings-input', placeholder: 'P',
    value: existingFt?.pPerTonneDm ?? '', 'data-testid': 'forage-type-sheet-p',
  });
  inputs.kPerTonneDm = el('input', {
    type: 'number', className: 'auth-input settings-input', placeholder: 'K',
    value: existingFt?.kPerTonneDm ?? '', 'data-testid': 'forage-type-sheet-k',
  });
  npkRow.appendChild(inputs.nPerTonneDm);
  npkRow.appendChild(inputs.pPerTonneDm);
  npkRow.appendChild(inputs.kPerTonneDm);
  panel.appendChild(npkRow);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('location.notes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input',
    value: existingFt?.notes || '',
    'data-testid': 'forage-type-sheet-notes',
    style: { minHeight: '60px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  // Status
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'forage-type-sheet-status' });
  panel.appendChild(statusEl);

  // Actions
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'forage-type-sheet-save',
      onClick: () => saveForageType(existingFt, inputs, operationId, unitSys, statusEl),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'forage-type-sheet-cancel',
      onClick: () => forageTypeSheet.close(),
    }, [t('action.cancel')]),
  ]));

  forageTypeSheet.open();
}

function saveForageType(existingFt, inputs, operationId, unitSys, statusEl) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const parseNum = (input) => {
    const v = input.value;
    return v === '' ? null : parseFloat(v);
  };

  let minResidualHeightCm = parseNum(inputs.minResidualHeightCm);
  if (minResidualHeightCm != null && unitSys === 'imperial') {
    minResidualHeightCm = convert(minResidualHeightCm, 'length', 'toMetric');
  }

  const data = {
    operationId,
    name: inputs.name.value.trim(),
    dmPct: parseNum(inputs.dmPct),
    utilizationPct: parseNum(inputs.utilizationPct),
    minResidualHeightCm,
    dmKgPerCmPerHa: parseNum(inputs.dmKgPerCmPerHa),
    nPerTonneDm: parseNum(inputs.nPerTonneDm),
    pPerTonneDm: parseNum(inputs.pPerTonneDm),
    kPerTonneDm: parseNum(inputs.kPerTonneDm),
    notes: inputs.notes.value.trim() || null,
  };

  try {
    if (existingFt) {
      update('forageTypes', existingFt.id, data, ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
    } else {
      const record = ForageTypeEntity.create(data);
      add('forageTypes', record, ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
    }
    forageTypeSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}

// ---------------------------------------------------------------------------
// Rerender helper
// ---------------------------------------------------------------------------

function rerender(container) {
  if (container) {
    clear(container);
    renderLocationsScreen(container);
  }
}
