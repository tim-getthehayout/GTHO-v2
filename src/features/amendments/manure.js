/** @file Manure batch management — CP-41. Batch CRUD with 13-element composition and transaction ledger. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add, update, remove, subscribe } from '../../data/store.js';
import * as ManureBatchEntity from '../../entities/manure-batch.js';
import * as ManureBatchTransactionEntity from '../../entities/manure-batch-transaction.js';

const NUTRIENT_KEYS = ['nKg', 'pKg', 'kKg', 'sKg', 'caKg', 'mgKg', 'cuKg', 'feKg', 'mnKg', 'moKg', 'znKg', 'bKg', 'clKg'];
const NUTRIENT_LABELS = {
  nKg: 'N', pKg: 'P', kKg: 'K', sKg: 'S', caKg: 'Ca', mgKg: 'Mg',
  cuKg: 'Cu', feKg: 'Fe', mnKg: 'Mn', moKg: 'Mo', znKg: 'Zn', bKg: 'B', clKg: 'Cl',
};

let unsubs = [];

export function renderManureScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('amendment.manure')]));
    return;
  }
  const operationId = operations[0].id;

  const screenEl = el('div', { 'data-testid': 'manure-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('amendment.manure')]),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'manure-add-btn',
        onClick: () => openManureBatchSheet(null, operationId),
      }, [t('amendment.addManureBatch')]),
    ]),
    el('div', { 'data-testid': 'manure-list' }),
    el('div', { className: 'sheet-wrap', id: 'manure-batch-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => manureBatchSheet && manureBatchSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'manure-batch-sheet-panel' }),
    ]),
    el('div', { className: 'sheet-wrap', id: 'manure-tx-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => manureTxSheet && manureTxSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'manure-tx-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderManureList(container, operationId);
  unsubs.push(subscribe('manureBatches', () => renderManureList(container, operationId)));
  unsubs.push(subscribe('manureBatchTransactions', () => renderManureList(container, operationId)));
}

function renderManureList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="manure-list"]');
  if (!listEl) return;
  clear(listEl);

  const batches = getAll('manureBatches').filter(b => b.operationId === operationId);
  if (!batches.length) {
    listEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'manure-empty',
    }, [t('amendment.manureBatchEmpty')]));
    return;
  }

  const sorted = [...batches].sort((a, b) => (b.captureDate || '').localeCompare(a.captureDate || ''));
  const locations = getAll('locations');

  for (const batch of sorted) {
    const sourceLoc = locations.find(l => l.id === batch.sourceLocationId);
    const npkSummary = [
      batch.nKg != null ? `N: ${batch.nKg}` : null,
      batch.pKg != null ? `P: ${batch.pKg}` : null,
      batch.kKg != null ? `K: ${batch.kKg}` : null,
    ].filter(Boolean).join(' ');
    const txns = getAll('manureBatchTransactions').filter(tx => tx.batchId === batch.id);
    const totalUsed = txns.filter(tx => tx.type === 'use').reduce((sum, tx) => sum + (tx.volumeKg || 0), 0);
    const vol = batch.estimatedVolumeKg;
    const remaining = vol != null ? vol - totalUsed : null;

    listEl.appendChild(el('div', {
      className: 'card',
      style: { padding: '12px 14px', marginBottom: 'var(--space-3)' },
      'data-testid': `manure-batch-${batch.id}`,
    }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [
        el('div', {}, [
          el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [batch.label]),
          el('div', { className: 'ft-row-detail' }, [
            [
              sourceLoc ? sourceLoc.name : null,
              batch.captureDate || null,
              vol != null ? `${remaining?.toFixed(0) ?? '?'}/${vol} kg` : null,
              npkSummary || null,
            ].filter(Boolean).join(' · '),
          ]),
        ]),
        el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
          el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `manure-batch-edit-${batch.id}`,
            onClick: () => openManureBatchSheet(batch, operationId),
          }, [t('action.edit')]),
          el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `manure-batch-ledger-${batch.id}`,
            onClick: () => openManureTxSheet(batch, operationId),
          }, [t('amendment.viewLedger')]),
          el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `manure-batch-delete-${batch.id}`,
            onClick: () => {
              if (window.confirm(t('amendment.confirmDelete'))) {
                remove('manureBatches', batch.id, 'manure_batches');
              }
            },
          }, [t('action.delete')]),
        ]),
      ]),
    ]));
  }
}

let manureBatchSheet = null;

function openManureBatchSheet(existing, operationId) {
  if (!manureBatchSheet) manureBatchSheet = new Sheet('manure-batch-sheet-wrap');
  const panel = document.getElementById('manure-batch-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existing;
  const todayStr = new Date().toISOString().slice(0, 10);
  const locations = getAll('locations').filter(l => !l.archived);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('amendment.editManureBatch') : t('amendment.addManureBatch'),
  ]));

  // Label
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.manureBatchLabel')]));
  inputs.label = el('input', {
    type: 'text', className: 'auth-input',
    value: existing?.label || '',
    'data-testid': 'manure-batch-label',
  });
  panel.appendChild(inputs.label);

  // Source location
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.manureBatchSource')]));
  inputs.sourceLocationId = el('select', {
    className: 'auth-select', 'data-testid': 'manure-batch-source-loc',
  }, [
    el('option', { value: '' }, ['—']),
    ...locations.map(l => el('option', { value: l.id }, [l.name])),
  ]);
  if (existing?.sourceLocationId) inputs.sourceLocationId.value = existing.sourceLocationId;
  panel.appendChild(inputs.sourceLocationId);

  // Estimated volume (kg)
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.manureBatchVolume')]));
  inputs.estimatedVolumeKg = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existing?.estimatedVolumeKg ?? '',
    'data-testid': 'manure-batch-volume',
  });
  panel.appendChild(inputs.estimatedVolumeKg);

  // Capture date
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.manureBatchCaptureDate')]));
  inputs.captureDate = el('input', {
    type: 'date', className: 'auth-input',
    value: existing?.captureDate || todayStr,
    'data-testid': 'manure-batch-capture-date',
  });
  panel.appendChild(inputs.captureDate);

  // 13-element composition
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.manureBatchComposition')]));
  const nutrientGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' } });
  for (const key of NUTRIENT_KEYS) {
    inputs[key] = el('input', {
      type: 'number', className: 'auth-input settings-input',
      placeholder: NUTRIENT_LABELS[key],
      value: existing?.[key] ?? '',
      'data-testid': `manure-batch-${key}`,
      style: { fontSize: '12px' },
    });
    nutrientGrid.appendChild(inputs[key]);
  }
  panel.appendChild(nutrientGrid);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.notes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input',
    value: existing?.notes || '',
    'data-testid': 'manure-batch-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'manure-batch-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'manure-batch-save',
      onClick: () => {
        clear(statusEl);
        const parseNum = v => v === '' ? null : parseFloat(v);
        const data = {
          operationId,
          label: inputs.label.value.trim(),
          sourceLocationId: inputs.sourceLocationId.value || null,
          estimatedVolumeKg: parseNum(inputs.estimatedVolumeKg.value),
          captureDate: inputs.captureDate.value || null,
          notes: inputs.notes.value.trim() || null,
        };
        for (const key of NUTRIENT_KEYS) data[key] = parseNum(inputs[key].value);
        try {
          if (isEdit) {
            update('manureBatches', existing.id, data,
              ManureBatchEntity.validate, ManureBatchEntity.toSupabaseShape, 'manure_batches');
          } else {
            add('manureBatches', ManureBatchEntity.create(data),
              ManureBatchEntity.validate, ManureBatchEntity.toSupabaseShape, 'manure_batches');
          }
          manureBatchSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => manureBatchSheet.close(),
    }, [t('action.cancel')]),
  ]));

  manureBatchSheet.open();
}

// ---------------------------------------------------------------------------
// Transaction ledger sheet
// ---------------------------------------------------------------------------

let manureTxSheet = null;

function openManureTxSheet(batch, operationId) {
  if (!manureTxSheet) manureTxSheet = new Sheet('manure-tx-sheet-wrap');
  const panel = document.getElementById('manure-tx-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    `${t('amendment.ledger')} — ${batch.label}`,
  ]));

  // Ledger list
  const ledgerEl = el('div', { 'data-testid': `manure-ledger-${batch.id}` });
  const renderLedger = () => {
    clear(ledgerEl);
    const txns = getAll('manureBatchTransactions').filter(tx => tx.batchId === batch.id);
    if (!txns.length) {
      ledgerEl.appendChild(el('p', { className: 'form-hint' }, [t('amendment.ledgerEmpty')]));
    } else {
      const sorted = [...txns].sort((a, b) => (b.transactionDate || '').localeCompare(a.transactionDate || ''));
      for (const tx of sorted) {
        ledgerEl.appendChild(el('div', {
          style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' },
          'data-testid': `manure-tx-${tx.id}`,
        }, [
          el('div', {}, [
            el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [tx.type]),
            el('div', { className: 'form-hint' }, [tx.transactionDate || '']),
          ]),
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } }, [
            el('span', { style: { fontSize: '13px' } }, [`${tx.volumeKg} kg`]),
            el('button', {
              className: 'btn btn-outline btn-xs',
              'data-testid': `manure-tx-delete-${tx.id}`,
              onClick: () => {
                if (window.confirm(t('amendment.confirmDelete'))) {
                  remove('manureBatchTransactions', tx.id, 'manure_batch_transactions');
                  renderLedger();
                }
              },
            }, [t('action.delete')]),
          ]),
        ]));
      }
    }
  };
  renderLedger();
  panel.appendChild(ledgerEl);

  // Add transaction form
  panel.appendChild(el('h3', { className: 'settings-section-title', style: { marginTop: 'var(--space-5)' } }, [
    t('amendment.addTransaction'),
  ]));

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.txType')]));
  const txTypeSelect = el('select', {
    className: 'auth-select', 'data-testid': 'manure-tx-type',
  }, [
    el('option', { value: 'input' }, [t('amendment.txTypeInput')]),
    el('option', { value: 'use' }, [t('amendment.txTypeUse')]),
    el('option', { value: 'transfer' }, [t('amendment.txTypeTransfer')]),
    el('option', { value: 'adjust' }, [t('amendment.txTypeAdjust')]),
  ]);
  panel.appendChild(txTypeSelect);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.txDate')]));
  const txDateInput = el('input', {
    type: 'date', className: 'auth-input',
    value: todayStr, 'data-testid': 'manure-tx-date',
  });
  panel.appendChild(txDateInput);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.txVolume')]));
  const txVolumeInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: '', 'data-testid': 'manure-tx-volume',
  });
  panel.appendChild(txVolumeInput);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.notes')]));
  const txNotesInput = el('textarea', {
    className: 'auth-input',
    value: '',
    'data-testid': 'manure-tx-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(txNotesInput);

  const txStatusEl = el('div', { className: 'auth-error', 'data-testid': 'manure-tx-status' });
  panel.appendChild(txStatusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'manure-tx-save',
      onClick: () => {
        clear(txStatusEl);
        const volumeKg = parseFloat(txVolumeInput.value);
        if (isNaN(volumeKg)) {
          txStatusEl.appendChild(el('span', {}, [t('amendment.txVolumeRequired')]));
          return;
        }
        try {
          const txData = ManureBatchTransactionEntity.create({
            operationId,
            batchId: batch.id,
            type: txTypeSelect.value,
            transactionDate: txDateInput.value,
            volumeKg,
            notes: txNotesInput.value.trim() || null,
          });
          add('manureBatchTransactions', txData, ManureBatchTransactionEntity.validate,
            ManureBatchTransactionEntity.toSupabaseShape, 'manure_batch_transactions');
          txVolumeInput.value = '';
          txNotesInput.value = '';
          renderLedger();
        } catch (err) {
          txStatusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.add')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => manureTxSheet.close(),
    }, [t('action.close')]),
  ]));

  manureTxSheet.open();
}
