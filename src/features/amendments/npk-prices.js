/** @file NPK price history — CP-42. Per-farm price entries with effective_date and current highlight. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add, remove, subscribe } from '../../data/store.js';
import * as NpkPriceHistoryEntity from '../../entities/npk-price-history.js';

let unsubs = [];

export function renderNpkPricesScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('amendment.npkPrices')]));
    return;
  }
  const operationId = operations[0].id;
  const farms = getAll('farms').filter(f => f.operationId === operationId);
  const farmId = farms.length ? farms[0].id : null;

  const screenEl = el('div', { 'data-testid': 'npk-prices-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('amendment.npkPrices')]),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'npk-prices-add-btn',
        onClick: () => openNpkPriceSheet(null, operationId, farmId),
      }, [t('amendment.addNpkPrice')]),
    ]),
    el('div', { 'data-testid': 'npk-prices-list' }),
    el('div', { className: 'sheet-wrap', id: 'npk-price-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => npkPriceSheet && npkPriceSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'npk-price-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderNpkPriceList(container, operationId);
  unsubs.push(subscribe('npkPriceHistory', () => renderNpkPriceList(container, operationId)));
}

function renderNpkPriceList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="npk-prices-list"]');
  if (!listEl) return;
  clear(listEl);

  const entries = getAll('npkPriceHistory').filter(e => e.operationId === operationId);
  if (!entries.length) {
    listEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'npk-prices-empty',
    }, [t('amendment.npkPriceEmpty')]));
    return;
  }

  const sorted = [...entries].sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''));
  const todayStr = new Date().toISOString().slice(0, 10);
  // Current = latest entry with effectiveDate <= today
  const current = sorted.find(e => (e.effectiveDate || '') <= todayStr);

  for (const entry of sorted) {
    const isCurrent = current && entry.id === current.id;

    listEl.appendChild(el('div', {
      className: 'card',
      style: {
        padding: '12px 14px',
        marginBottom: 'var(--space-3)',
        borderLeft: isCurrent ? '3px solid var(--color-green)' : undefined,
      },
      'data-testid': `npk-price-${entry.id}`,
    }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [
        el('div', {}, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } }, [
            el('span', { style: { fontWeight: '600', fontSize: '14px' } }, [entry.effectiveDate || '?']),
            isCurrent ? el('span', {
              className: 'status-badge status-active',
              'data-testid': `npk-price-current-${entry.id}`,
            }, [t('amendment.current')]) : el('span', {}),
          ]),
          el('div', { className: 'ft-row-detail' }, [
            `N: $${entry.nPricePerKg ?? '—'}/kg  P: $${entry.pPricePerKg ?? '—'}/kg  K: $${entry.kPricePerKg ?? '—'}/kg`,
          ]),
          entry.notes
            ? el('div', { className: 'form-hint' }, [entry.notes])
            : el('span', {}),
        ]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `npk-price-delete-${entry.id}`,
          onClick: () => {
            if (window.confirm(t('amendment.confirmDelete'))) {
              remove('npkPriceHistory', entry.id, 'npk_price_history');
            }
          },
        }, [t('action.delete')]),
      ]),
    ]));
  }
}

let npkPriceSheet = null;

function openNpkPriceSheet(existing, operationId, farmId) {
  if (!npkPriceSheet) npkPriceSheet = new Sheet('npk-price-sheet-wrap');
  const panel = document.getElementById('npk-price-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('amendment.addNpkPrice')]));

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.npkEffectiveDate')]));
  const dateInput = el('input', {
    type: 'date', className: 'auth-input',
    value: existing?.effectiveDate || todayStr,
    'data-testid': 'npk-price-date',
  });
  panel.appendChild(dateInput);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.npkN')]));
  const nInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existing?.nPricePerKg ?? '',
    'data-testid': 'npk-price-n',
  });
  panel.appendChild(nInput);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.npkP')]));
  const pInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existing?.pPricePerKg ?? '',
    'data-testid': 'npk-price-p',
  });
  panel.appendChild(pInput);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.npkK')]));
  const kInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existing?.kPricePerKg ?? '',
    'data-testid': 'npk-price-k',
  });
  panel.appendChild(kInput);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.notes')]));
  const notesInput = el('textarea', {
    className: 'auth-input',
    value: existing?.notes || '',
    'data-testid': 'npk-price-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'npk-price-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'npk-price-save',
      onClick: () => {
        clear(statusEl);
        const parseNum = v => v === '' ? null : parseFloat(v);
        try {
          const data = NpkPriceHistoryEntity.create({
            farmId: farmId || null,
            operationId,
            effectiveDate: dateInput.value,
            nPricePerKg: parseNum(nInput.value),
            pPricePerKg: parseNum(pInput.value),
            kPricePerKg: parseNum(kInput.value),
            notes: notesInput.value.trim() || null,
          });
          add('npkPriceHistory', data, NpkPriceHistoryEntity.validate,
            NpkPriceHistoryEntity.toSupabaseShape, 'npk_price_history');
          npkPriceSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => npkPriceSheet.close(),
    }, [t('action.cancel')]),
  ]));

  npkPriceSheet.open();
}
