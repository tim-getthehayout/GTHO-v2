/** @file Harvest flow — v1 parity tile-based UI. Single openHarvestSheet used from all entry points. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, subscribe } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, display, unitLabel } from '../../utils/units.js';
import { navigate } from '../../ui/router.js';
import * as HarvestEventEntity from '../../entities/harvest-event.js';
import * as HarvestEventFieldEntity from '../../entities/harvest-event-field.js';
import * as BatchEntity from '../../entities/batch.js';

let unsubs = [];
let harvestSheet = null;

// ─── Harvest event list screen (#/harvest route) ────────────────────────

export function renderHarvestScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('harvest.title')]));
    return;
  }
  const operationId = operations[0].id;

  const screenEl = el('div', { 'data-testid': 'harvest-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('harvest.title')]),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'harvest-add-btn',
        onClick: () => openHarvestSheet(operationId),
      }, [t('harvest.recordHarvest')]),
    ]),
    el('div', { 'data-testid': 'harvest-list' }),
  ]);

  container.appendChild(screenEl);
  renderHarvestList(container, operationId);
  unsubs.push(subscribe('harvestEvents', () => renderHarvestList(container, operationId)));
  unsubs.push(subscribe('harvestEventFields', () => renderHarvestList(container, operationId)));
}

function renderHarvestList(rootContainer, _operationId) {
  const listEl = rootContainer.querySelector('[data-testid="harvest-list"]');
  if (!listEl) return;
  clear(listEl);

  const events = getAll('harvestEvents');
  if (!events.length) {
    listEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'harvest-empty' }, [t('harvest.empty')]));
    return;
  }

  const sorted = [...events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const feedTypes = getAll('feedTypes');
  const locations = getAll('locations');

  for (const evt of sorted) {
    const fields = getAll('harvestEventFields').filter(f => f.harvestEventId === evt.id);
    const fieldSummary = fields.map(f => {
      const loc = locations.find(l => l.id === f.locationId);
      const ft = feedTypes.find(x => x.id === f.feedTypeId);
      return `${loc ? loc.name : '?'}: ${f.quantity} ${ft ? ft.unit : ''}`;
    }).join(', ');

    listEl.appendChild(el('div', {
      className: 'card', style: { padding: '12px 14px', marginBottom: 'var(--space-3)' },
      'data-testid': `harvest-event-${evt.id}`,
    }, [
      el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [evt.date || '?']),
      el('div', { className: 'ft-row-detail' }, [fieldSummary || t('harvest.noFields')]),
      evt.notes ? el('div', { className: 'form-hint' }, [evt.notes]) : null,
    ].filter(Boolean)));
  }
}

// ─── Batch ID generation ────────────────────────────────────────────────

function generateBatchId(locationId, feedTypeId, date) {
  const loc = locationId ? getById('locations', locationId) : null;
  const ft = feedTypeId ? getById('feedTypes', feedTypeId) : null;
  const farm = loc?.farmId ? getById('farms', loc.farmId) : null;
  const farmPart = farm ? farm.name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() : 'UNK';
  const fieldPart = loc?.fieldCode
    ? loc.fieldCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : (loc ? loc.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() : 'FLD');
  const cutPart = ft?.cuttingNumber != null ? String(ft.cuttingNumber) : '?';
  const datePart = date ? date.replace(/-/g, '') : '';
  return [farmPart, fieldPart, cutPart, datePart].join('-');
}

// ─── Tile-based harvest sheet (v1 parity) ───────────────────────────────

function ensureHarvestSheetDOM() {
  if (document.getElementById('harvest-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'harvest-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => harvestSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'harvest-sheet-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

/**
 * Open the tile-based harvest sheet.
 * @param {string} operationId
 * @param {object} [options]
 * @param {boolean} [options.fieldMode] — show field picker step first
 * @param {string|null} [options.preSelectedLocationId] — pre-fill first field row
 */
export function openHarvestSheet(operationId, options = {}) {
  ensureHarvestSheetDOM();
  if (!harvestSheet) harvestSheet = new Sheet('harvest-sheet-wrap');
  const panel = document.getElementById('harvest-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const { fieldMode = false, preSelectedLocationId = null } = options;

  if (fieldMode) {
    renderFieldPicker(panel, operationId, (selectedLocId) => {
      clear(panel);
      panel.appendChild(el('div', { className: 'sheet-handle' }));
      renderTileGrid(panel, operationId, selectedLocId);
    });
  } else {
    renderTileGrid(panel, operationId, preSelectedLocationId);
  }

  harvestSheet.open();
}

// ─── Step 1: Field Picker (field mode only) ─────────────────────────────

function renderFieldPicker(panel, operationId, onSelect) {
  const unitSys = getUnitSystem();
  const farms = getAll('farms');
  const isMultiFarm = farms.length > 1;
  let farmFilter = 'all';
  let typeFilter = 'all';
  let search = '';

  panel.appendChild(el('div', { style: { fontSize: '17px', fontWeight: '600', marginBottom: '4px' } }, [t('harvest.pickField')]));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' } }, [t('harvest.pickFieldHint')]));

  const contentEl = el('div');
  panel.appendChild(contentEl);

  function render() {
    clear(contentEl);

    // Farm filter pills
    if (isMultiFarm) {
      const farmRow = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' } });
      for (const [val, label] of [['all', 'All farms'], ...farms.map(f => [f.id, f.name])]) {
        const isActive = farmFilter === val;
        farmRow.appendChild(el('button', {
          type: 'button',
          style: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${isActive ? 'var(--teal)' : 'var(--border2)'}`, background: isActive ? 'var(--teal)' : 'transparent', color: isActive ? 'white' : 'var(--text2)' },
          onClick: () => { farmFilter = val; render(); },
        }, [label]));
      }
      contentEl.appendChild(farmRow);
    }

    // Type filter pills
    const typeRow = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' } });
    for (const [val, label] of [['all', 'All crop & mixed-use'], ['crop', 'Crop'], ['mixed-use', 'Mixed-Use']]) {
      const isActive = typeFilter === val;
      typeRow.appendChild(el('button', {
        type: 'button',
        style: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${isActive ? 'var(--green)' : 'var(--border2)'}`, background: isActive ? 'var(--green)' : 'transparent', color: isActive ? 'white' : 'var(--text2)' },
        onClick: () => { typeFilter = val; render(); },
      }, [label]));
    }
    contentEl.appendChild(typeRow);

    // Search
    const searchInput = el('input', { type: 'text', placeholder: 'Search fields...', value: search, style: { width: '100%', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', marginBottom: '10px', background: 'var(--bg2)', color: 'var(--text)' } });
    searchInput.addEventListener('input', () => { search = searchInput.value; render(); });
    contentEl.appendChild(searchInput);

    // Field cards
    let locs = getAll('locations').filter(l => !l.archived && l.type === 'land' && (l.landUse === 'crop' || l.landUse === 'mixed-use'));
    if (farmFilter !== 'all') locs = locs.filter(l => l.farmId === farmFilter);
    if (typeFilter !== 'all') locs = locs.filter(l => l.landUse === typeFilter);
    if (search) { const q = search.toLowerCase(); locs = locs.filter(l => (l.name || '').toLowerCase().includes(q) || (l.fieldCode || '').toLowerCase().includes(q)); }

    if (!locs.length) {
      contentEl.appendChild(el('div', { style: { padding: '16px', textAlign: 'center', background: 'var(--bg2)', borderRadius: 'var(--radius)' } }, [
        el('div', { style: { fontSize: '13px', color: 'var(--text2)' } }, ['No crop or mixed-use fields set up. Edit a pasture and set its land use to Crop or Mixed-Use.']),
      ]));
      return;
    }

    for (const loc of locs) {
      const areaVal = loc.areaHa ? convert(loc.areaHa, 'area', 'toImperial').toFixed(1) : '';
      const areaUnit = unitSys === 'imperial' ? 'ac' : 'ha';
      const farm = loc.farmId ? getById('farms', loc.farmId) : null;
      contentEl.appendChild(el('div', {
        style: { padding: '12px', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: '6px' },
        onClick: () => onSelect(loc.id),
      }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
          el('div', { style: { fontSize: '20px' } }, ['\uD83D\uDE9C']),
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [`${loc.name} \u00B7 ${areaVal} ${areaUnit}`]),
            el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${loc.landUse}${farm ? ` \u00B7 ${farm.name}` : ''}${loc.fieldCode ? ` \u00B7 ${loc.fieldCode}` : ''}`]),
          ]),
        ]),
      ]));
    }
  }

  render();
}

// ─── Step 2: Tile Grid ──────────────────────────────────────────────────

function renderTileGrid(panel, operationId, preSelectedLocationId) {
  const unitSys = getUnitSystem();
  const wUnit = unitSys === 'imperial' ? 'lbs' : 'kg';
  const todayStr = new Date().toISOString().slice(0, 10);
  const feedTypes = getAll('feedTypes').filter(ft => ft.harvestActive !== false && !ft.archived);
  const allLocations = getAll('locations').filter(l => !l.archived && l.type === 'land' && (l.landUse === 'crop' || l.landUse === 'mixed-use'));

  // State
  const tiles = []; // { feedTypeId, fieldRows: [{ landId, quantity, weightPerUnitKg, batchId, batchIdDirty, notes }] }

  // Header fields
  const dateInput = el('input', { type: 'date', value: todayStr });
  const notesInput = el('input', { type: 'text', placeholder: 'e.g. Good yield' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Harvest date *']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Event notes (optional)']), notesInput]),
  ]));

  // Feed types link
  panel.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', marginTop: '10px' } }, [
    el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [t('harvest.feedTypesLink')]),
    el('button', { className: 'btn btn-outline btn-xs', style: { flexShrink: '0', whiteSpace: 'nowrap' }, onClick: () => {
      // Try to open feed types sheet from locations module
      navigate('#/locations'); harvestSheet.close();
    } }, ['\u2699\uFE0F Feed types']),
  ]));

  // Tile section label
  panel.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '600', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' } }, [t('harvest.selectType')]));

  const tileGridEl = el('div');
  const tileDetailsEl = el('div');
  const statusEl = el('div', { className: 'auth-error' });

  panel.appendChild(tileGridEl);
  panel.appendChild(tileDetailsEl);
  panel.appendChild(statusEl);

  function renderTiles() {
    clear(tileGridEl);

    if (!feedTypes.length) {
      tileGridEl.appendChild(el('div', { style: { padding: '16px', textAlign: 'center', background: 'var(--bg2)', borderRadius: 'var(--radius)', marginBottom: '12px' } }, [
        el('div', { style: { fontSize: '22px', marginBottom: '6px' } }, ['\uD83C\uDF3E']),
        el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text2)', marginBottom: '4px' } }, [t('harvest.noTypesActive')]),
        el('div', { style: { fontSize: '12px', color: 'var(--text3)' } }, [t('harvest.noTypesHint')]),
      ]));
      return;
    }

    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '8px', marginBottom: '14px' } });
    for (const ft of feedTypes) {
      const isSelected = tiles.some(t2 => t2.feedTypeId === ft.id);
      const subLabel = (ft.cuttingNumber != null ? `C${ft.cuttingNumber} \u00B7 ` : '') + (ft.unit || '');
      grid.appendChild(el('button', {
        type: 'button',
        style: { padding: '10px 8px', borderRadius: 'var(--radius)', border: `2px solid ${isSelected ? 'var(--green)' : 'var(--border2)'}`, background: isSelected ? 'var(--green)' : 'var(--bg2)', color: isSelected ? 'white' : 'var(--text)', cursor: 'pointer', textAlign: 'left', lineHeight: '1.3' },
        onClick: () => {
          const idx = tiles.findIndex(t2 => t2.feedTypeId === ft.id);
          if (idx >= 0) tiles.splice(idx, 1);
          else {
            const row = makeFieldRow(ft.id, preSelectedLocationId, dateInput.value);
            tiles.push({ feedTypeId: ft.id, fieldRows: [row] });
          }
          renderTiles();
          renderDetails();
        },
      }, [
        el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [ft.name]),
        subLabel ? el('div', { style: { fontSize: '11px', opacity: '0.8', marginTop: '2px' } }, [subLabel]) : null,
      ].filter(Boolean)));
    }
    tileGridEl.appendChild(grid);
  }

  function makeFieldRow(feedTypeId, locId, date) {
    const row = { landId: locId || null, quantity: null, weightPerUnitKg: null, batchId: null, batchIdDirty: false, notes: null };
    if (locId && date) row.batchId = generateBatchId(locId, feedTypeId, date);
    return row;
  }

  function renderDetails() {
    clear(tileDetailsEl);
    for (const tile of tiles) {
      const ft = getById('feedTypes', tile.feedTypeId);
      if (!ft) continue;
      const tileLabel = `\u25BC ${ft.name}${ft.cuttingNumber != null ? ` \u2014 C${ft.cuttingNumber}` : ''}`;
      const defaultWeightDisplay = ft.defaultWeightKg ? Math.round(convert(ft.defaultWeightKg, 'weight', 'toImperial')) : '';

      const tileContainer = el('div', { style: { border: '1.5px solid var(--green)', borderRadius: 'var(--radius)', padding: '12px', marginBottom: '12px', background: 'var(--bg)' } });
      tileContainer.appendChild(el('div', { style: { fontSize: '12px', fontWeight: '700', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' } }, [tileLabel]));

      for (let i = 0; i < tile.fieldRows.length; i++) {
        const row = tile.fieldRows[i];
        const rowEl = el('div', { style: { background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '10px', marginBottom: '8px', position: 'relative' } });

        // Header: Field N + remove button
        rowEl.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, [
          el('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text2)' } }, [`Field ${i + 1}`]),
          el('button', { type: 'button', style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '18px', padding: '0' }, onClick: () => { tile.fieldRows.splice(i, 1); if (!tile.fieldRows.length) tiles.splice(tiles.indexOf(tile), 1); renderTiles(); renderDetails(); } }, ['\u00D7']),
        ]));

        // Weight per bale (prominent)
        const weightInput = el('input', { type: 'number', min: '0', step: '1', placeholder: String(defaultWeightDisplay), value: row.weightPerUnitKg ? Math.round(convert(row.weightPerUnitKg, 'weight', 'toImperial')) : '', style: { fontSize: '18px', fontWeight: '600', height: '44px' } });
        weightInput.addEventListener('change', () => {
          const val = parseFloat(weightInput.value);
          row.weightPerUnitKg = !isNaN(val) ? (unitSys === 'imperial' ? convert(val, 'weight', 'toMetric') : val) : null;
        });
        rowEl.appendChild(el('div', { className: 'field', style: { marginBottom: '8px' } }, [el('label', { style: { fontSize: '12px', fontWeight: '600' } }, [`Weight / bale (${wUnit})`]), weightInput]));

        // Field + bale count
        const fieldSelect = el('select', { className: 'auth-select' }, [
          el('option', { value: '' }, ['\u2014 pick field \u2014']),
          ...allLocations.map(l => el('option', { value: l.id, selected: row.landId === l.id }, [`${l.name}${l.fieldCode ? ` [${l.fieldCode}]` : ''}`])),
        ]);
        fieldSelect.addEventListener('change', () => {
          row.landId = fieldSelect.value || null;
          if (!row.batchIdDirty) { row.batchId = generateBatchId(row.landId, tile.feedTypeId, dateInput.value); batchInput.value = row.batchId || ''; }
        });
        const qtyInput = el('input', { type: 'number', min: '0', step: '1', placeholder: '0', value: row.quantity ?? '' });
        qtyInput.addEventListener('change', () => { row.quantity = parseInt(qtyInput.value, 10) || null; });
        rowEl.appendChild(el('div', { className: 'two' }, [
          el('div', { className: 'field' }, [el('label', {}, ['Field']), fieldSelect]),
          el('div', { className: 'field' }, [el('label', {}, [t('harvest.baleCount')]), qtyInput]),
        ]));

        // Batch ID
        const batchInput = el('input', { type: 'text', value: row.batchId || '', placeholder: 'Set field + date first' });
        batchInput.addEventListener('input', () => { row.batchId = batchInput.value; row.batchIdDirty = true; });
        rowEl.appendChild(el('div', { className: 'field' }, [
          el('label', {}, [t('harvest.batchId'), ' ', el('span', { style: { fontWeight: '400', fontSize: '10px', color: 'var(--text3)' } }, [t('harvest.batchIdHint')])]),
          batchInput,
        ]));

        // Notes
        const notesRowInput = el('input', { type: 'text', placeholder: '', value: row.notes || '' });
        notesRowInput.addEventListener('change', () => { row.notes = notesRowInput.value.trim() || null; });
        rowEl.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes (optional)']), notesRowInput]));

        tileContainer.appendChild(rowEl);
      }

      // Add field button
      tileContainer.appendChild(el('button', { className: 'btn btn-outline btn-sm', style: { width: '100%', marginTop: '2px' }, onClick: () => { tile.fieldRows.push(makeFieldRow(tile.feedTypeId, null, dateInput.value)); renderDetails(); } }, [t('harvest.addFieldRow')]));

      tileDetailsEl.appendChild(tileContainer);
    }
  }

  // Date change → update batch IDs
  dateInput.addEventListener('change', () => {
    for (const tile of tiles) {
      for (const row of tile.fieldRows) {
        if (!row.batchIdDirty && row.landId) row.batchId = generateBatchId(row.landId, tile.feedTypeId, dateInput.value);
      }
    }
    renderDetails();
  });

  renderTiles();
  renderDetails();

  // Save button
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      if (!dateInput.value) { statusEl.appendChild(el('span', {}, ['Date is required'])); return; }
      if (!tiles.length) { statusEl.appendChild(el('span', {}, ['Select at least one harvest type'])); return; }
      const validRows = [];
      for (const tile of tiles) {
        for (const row of tile.fieldRows) {
          if (!row.landId || !row.quantity || row.quantity <= 0) continue;
          validRows.push({ ...row, feedTypeId: tile.feedTypeId });
        }
      }
      if (!validRows.length) { statusEl.appendChild(el('span', {}, ['Each tile needs at least one field row with field + bale count'])); return; }

      try {
        const harvestEvent = HarvestEventEntity.create({ operationId, date: dateInput.value, notes: notesInput.value.trim() || null });
        add('harvestEvents', harvestEvent, HarvestEventEntity.validate, HarvestEventEntity.toSupabaseShape, 'harvest_events');

        for (const row of validRows) {
          const ft = getById('feedTypes', row.feedTypeId);
          const batchName = [ft ? ft.name : 'Harvest', dateInput.value].join(' ');
          const batch = BatchEntity.create({
            operationId, feedTypeId: row.feedTypeId, name: batchName, source: 'harvest',
            quantity: row.quantity, remaining: row.quantity, unit: ft ? ft.unit : 'unit',
            weightPerUnitKg: row.weightPerUnitKg, dmPct: null, purchaseDate: dateInput.value,
          });
          add('batches', batch, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');

          const hef = HarvestEventFieldEntity.create({
            operationId, harvestEventId: harvestEvent.id, locationId: row.landId,
            feedTypeId: row.feedTypeId, quantity: row.quantity, weightPerUnitKg: row.weightPerUnitKg,
            dmPct: null, cuttingNumber: ft?.cuttingNumber ?? null, batchId: batch.id,
          });
          add('harvestEventFields', hef, HarvestEventFieldEntity.validate, HarvestEventFieldEntity.toSupabaseShape, 'harvest_event_fields');
        }

        harvestSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => harvestSheet.close() }, [t('action.cancel')]),
  ]));
}
