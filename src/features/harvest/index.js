/** @file Harvest flow — CP-43. Select location, feed type, quantity/weight/DM%/cutting number per field. Creates harvest_event + harvest_event_fields + batches. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add, subscribe } from '../../data/store.js';
import * as HarvestEventEntity from '../../entities/harvest-event.js';
import * as HarvestEventFieldEntity from '../../entities/harvest-event-field.js';
import * as BatchEntity from '../../entities/batch.js';

let unsubs = [];

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
    el('div', { className: 'sheet-wrap', id: 'harvest-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => harvestSheet && harvestSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'harvest-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderHarvestList(container, operationId);
  unsubs.push(subscribe('harvestEvents', () => renderHarvestList(container, operationId)));
  unsubs.push(subscribe('harvestEventFields', () => renderHarvestList(container, operationId)));
}

function renderHarvestList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="harvest-list"]');
  if (!listEl) return;
  clear(listEl);

  const events = getAll('harvestEvents').filter(e => e.operationId === operationId);
  if (!events.length) {
    listEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'harvest-empty',
    }, [t('harvest.empty')]));
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
      className: 'card',
      style: { padding: '12px 14px', marginBottom: 'var(--space-3)' },
      'data-testid': `harvest-event-${evt.id}`,
    }, [
      el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [evt.date || '?']),
      el('div', { className: 'ft-row-detail' }, [fieldSummary || t('harvest.noFields')]),
      evt.notes ? el('div', { className: 'form-hint' }, [evt.notes]) : el('span', {}),
    ]));
  }
}

let harvestSheet = null;

// Each row entry represents one field: { locationId, feedTypeId, quantity, weightPerUnitKg, dmPct, cuttingNumber }
function openHarvestSheet(operationId) {
  if (!harvestSheet) harvestSheet = new Sheet('harvest-sheet-wrap');
  const panel = document.getElementById('harvest-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const locations = getAll('locations').filter(l => !l.archived && l.type === 'land');
  const feedTypes = getAll('feedTypes').filter(ft => !ft.archived && ft.harvestActive);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('harvest.recordHarvest')]));

  // Header date
  panel.appendChild(el('label', { className: 'form-label' }, [t('harvest.date')]));
  const dateInput = el('input', {
    type: 'date', className: 'auth-input',
    value: todayStr,
    'data-testid': 'harvest-date',
  });
  panel.appendChild(dateInput);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('harvest.notes')]));
  const notesInput = el('textarea', {
    className: 'auth-input',
    value: '',
    'data-testid': 'harvest-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  // Field rows
  panel.appendChild(el('label', { className: 'form-label', style: { marginTop: 'var(--space-4)' } }, [t('harvest.fields')]));

  if (!feedTypes.length) {
    panel.appendChild(el('p', { className: 'form-hint' }, [t('harvest.noHarvestFeedTypes')]));
  }

  const fieldRowsEl = el('div', { 'data-testid': 'harvest-field-rows' });
  panel.appendChild(fieldRowsEl);

  const fieldRows = [];

  const addFieldRow = () => {
    const rowData = { locationId: '', feedTypeId: '', quantity: '', weightPerUnitKg: '', dmPct: '', cuttingNumber: '' };
    fieldRows.push(rowData);

    const rowEl = el('div', {
      className: 'card',
      style: { padding: '8px', marginBottom: 'var(--space-3)' },
      'data-testid': `harvest-field-row-${fieldRows.length - 1}`,
    });

    // Location
    rowEl.appendChild(el('label', { className: 'form-label' }, [t('harvest.fieldLocation')]));
    const locSelect = el('select', {
      className: 'auth-select', 'data-testid': `harvest-field-loc-${fieldRows.length - 1}`,
    }, [
      el('option', { value: '' }, ['—']),
      ...locations.map(l => el('option', { value: l.id }, [l.name])),
    ]);
    locSelect.addEventListener('change', () => { rowData.locationId = locSelect.value; });
    rowEl.appendChild(locSelect);

    // Feed type
    rowEl.appendChild(el('label', { className: 'form-label' }, [t('harvest.feedType')]));
    const ftSelect = el('select', {
      className: 'auth-select', 'data-testid': `harvest-field-ft-${fieldRows.length - 1}`,
    }, [
      el('option', { value: '' }, ['—']),
      ...feedTypes.map(ft => el('option', { value: ft.id }, [ft.name])),
    ]);
    ftSelect.addEventListener('change', () => { rowData.feedTypeId = ftSelect.value; });
    rowEl.appendChild(ftSelect);

    // Inline numeric fields
    const numGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-2)', marginTop: 'var(--space-2)' } });

    const qtyInput = el('input', {
      type: 'number', className: 'auth-input settings-input', placeholder: t('harvest.quantity'),
      'data-testid': `harvest-field-qty-${fieldRows.length - 1}`,
    });
    qtyInput.addEventListener('input', () => { rowData.quantity = qtyInput.value; });

    const weightInput = el('input', {
      type: 'number', className: 'auth-input settings-input', placeholder: t('harvest.weightPerUnit'),
      'data-testid': `harvest-field-weight-${fieldRows.length - 1}`,
    });
    weightInput.addEventListener('input', () => { rowData.weightPerUnitKg = weightInput.value; });

    const dmInput = el('input', {
      type: 'number', className: 'auth-input settings-input', placeholder: t('harvest.dmPct'),
      'data-testid': `harvest-field-dm-${fieldRows.length - 1}`,
    });
    dmInput.addEventListener('input', () => { rowData.dmPct = dmInput.value; });

    const cuttingInput = el('input', {
      type: 'number', className: 'auth-input settings-input', placeholder: t('harvest.cuttingNumber'),
      'data-testid': `harvest-field-cutting-${fieldRows.length - 1}`,
    });
    cuttingInput.addEventListener('input', () => { rowData.cuttingNumber = cuttingInput.value; });

    numGrid.appendChild(qtyInput);
    numGrid.appendChild(weightInput);
    numGrid.appendChild(dmInput);
    numGrid.appendChild(cuttingInput);
    rowEl.appendChild(numGrid);

    // Remove row button
    rowEl.appendChild(el('button', {
      className: 'btn btn-outline btn-xs',
      style: { marginTop: 'var(--space-2)' },
      'data-testid': `harvest-field-remove-${fieldRows.length - 1}`,
      onClick: () => {
        const idx = fieldRows.indexOf(rowData);
        if (idx !== -1) fieldRows.splice(idx, 1);
        rowEl.remove();
      },
    }, [t('harvest.removeField')]));

    fieldRowsEl.appendChild(rowEl);
  };

  // Start with one row
  addFieldRow();

  panel.appendChild(el('button', {
    className: 'btn btn-outline btn-sm',
    style: { marginBottom: 'var(--space-4)' },
    'data-testid': 'harvest-add-field-btn',
    onClick: () => addFieldRow(),
  }, [t('harvest.addField')]));

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'harvest-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'harvest-save',
      onClick: () => {
        clear(statusEl);
        const validRows = fieldRows.filter(r => r.locationId && r.feedTypeId && r.quantity !== '');
        if (!validRows.length) {
          statusEl.appendChild(el('span', {}, [t('harvest.noFieldsError')]));
          return;
        }
        try {
          const parseNum = v => (v === '' || v == null) ? null : parseFloat(v);

          // Create harvest event
          const harvestEvent = HarvestEventEntity.create({
            operationId,
            date: dateInput.value,
            notes: notesInput.value.trim() || null,
          });
          add('harvestEvents', harvestEvent, HarvestEventEntity.validate,
            HarvestEventEntity.toSupabaseShape, 'harvest_events');

          for (const row of validRows) {
            const ft = feedTypes.find(x => x.id === row.feedTypeId);
            const qty = parseNum(row.quantity) ?? 0;
            const weightKg = parseNum(row.weightPerUnitKg);
            const dmPct = parseNum(row.dmPct);
            const cuttingNum = parseNum(row.cuttingNumber);

            // Create a batch for this field (source='harvest')
            const batchName = [
              ft ? ft.name : 'Harvest',
              dateInput.value,
            ].join(' ');
            const batch = BatchEntity.create({
              operationId,
              feedTypeId: row.feedTypeId,
              name: batchName,
              source: 'harvest',
              quantity: qty,
              remaining: qty,
              unit: ft ? ft.unit : 'unit',
              weightPerUnitKg: weightKg,
              dmPct,
              purchaseDate: dateInput.value,
            });
            add('batches', batch, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');

            // Create harvest event field record
            const hef = HarvestEventFieldEntity.create({
              operationId,
              harvestEventId: harvestEvent.id,
              locationId: row.locationId,
              feedTypeId: row.feedTypeId,
              quantity: qty,
              weightPerUnitKg: weightKg,
              dmPct,
              cuttingNumber: cuttingNum != null ? Math.round(cuttingNum) : null,
              batchId: batch.id,
            });
            add('harvestEventFields', hef, HarvestEventFieldEntity.validate,
              HarvestEventFieldEntity.toSupabaseShape, 'harvest_event_fields');
          }

          harvestSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => harvestSheet.close(),
    }, [t('action.cancel')]),
  ]));

  harvestSheet.open();
}
