/** @file Feed quality / batch nutritional profiles — CP-44. Lab results entry per batch. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe } from '../../data/store.js';
import * as BatchNutritionalProfileEntity from '../../entities/batch-nutritional-profile.js';

let unsubs = [];

export function renderFeedQualityScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('feed.qualityTitle')]));
    return;
  }
  const operationId = operations[0].id;

  const screenEl = el('div', { 'data-testid': 'feed-quality-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('feed.qualityTitle')]),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'feed-quality-add-btn',
        onClick: () => openQualitySheet(null, operationId),
      }, [t('feed.addQualityProfile')]),
    ]),
    el('div', { 'data-testid': 'feed-quality-list' }),
    el('div', { className: 'sheet-wrap', id: 'quality-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => qualitySheet && qualitySheet.close() }),
      el('div', { className: 'sheet-panel', id: 'quality-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderQualityList(container, operationId);
  unsubs.push(subscribe('batchNutritionalProfiles', () => renderQualityList(container, operationId)));
}

function renderQualityList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="feed-quality-list"]');
  if (!listEl) return;
  clear(listEl);

  const profiles = getAll('batchNutritionalProfiles').filter(p => p.operationId === operationId);
  if (!profiles.length) {
    listEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'feed-quality-empty',
    }, [t('feed.qualityEmpty')]));
    return;
  }

  const sorted = [...profiles].sort((a, b) => (b.testedAt || '').localeCompare(a.testedAt || ''));
  const batches = getAll('batches');

  for (const profile of sorted) {
    const batch = batches.find(b => b.id === profile.batchId);
    const batchName = batch ? batch.name : '?';

    const detailParts = [
      profile.dmPct != null ? `DM: ${profile.dmPct}%` : null,
      profile.proteinPct != null ? `CP: ${profile.proteinPct}%` : null,
      profile.tdnPct != null ? `TDN: ${profile.tdnPct}%` : null,
      profile.rfv != null ? `RFV: ${profile.rfv}` : null,
    ].filter(Boolean).join(' · ');

    listEl.appendChild(el('div', {
      className: 'card',
      style: { padding: '12px 14px', marginBottom: 'var(--space-3)' },
      'data-testid': `quality-profile-${profile.id}`,
    }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [
        el('div', {}, [
          el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [batchName]),
          el('div', { className: 'ft-row-detail' }, [
            [profile.testedAt, profile.source, detailParts].filter(Boolean).join(' · '),
          ]),
          profile.lab ? el('div', { className: 'form-hint' }, [profile.lab]) : el('span', {}),
        ]),
        el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
          el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `quality-profile-edit-${profile.id}`,
            onClick: () => openQualitySheet(profile, operationId),
          }, [t('action.edit')]),
          el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `quality-profile-delete-${profile.id}`,
            onClick: () => {
              if (window.confirm(t('feed.confirmDeleteQuality'))) {
                remove('batchNutritionalProfiles', profile.id, 'batch_nutritional_profiles');
              }
            },
          }, [t('action.delete')]),
        ]),
      ]),
    ]));
  }
}

let qualitySheet = null;

function openQualitySheet(existing, operationId) {
  if (!qualitySheet) qualitySheet = new Sheet('quality-sheet-wrap');
  const panel = document.getElementById('quality-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existing;
  const todayStr = new Date().toISOString().slice(0, 10);
  const batches = getAll('batches').filter(b => !b.archived && b.operationId === operationId);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('feed.editQualityProfile') : t('feed.addQualityProfile'),
  ]));

  // Batch picker
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.qualityBatch')]));
  inputs.batchId = el('select', {
    className: 'auth-select', 'data-testid': 'quality-batch',
  }, [
    el('option', { value: '' }, ['—']),
    ...batches.map(b => {
      const ft = getById('feedTypes', b.feedTypeId);
      const label = ft ? `${b.name} (${ft.name})` : b.name;
      return el('option', { value: b.id }, [label]);
    }),
  ]);
  if (existing?.batchId) inputs.batchId.value = existing.batchId;
  panel.appendChild(inputs.batchId);

  // Test date
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.qualityTestedAt')]));
  inputs.testedAt = el('input', {
    type: 'date', className: 'auth-input',
    value: existing?.testedAt || todayStr,
    'data-testid': 'quality-tested-at',
  });
  panel.appendChild(inputs.testedAt);

  // Source
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.qualitySource')]));
  inputs.source = el('select', {
    className: 'auth-select', 'data-testid': 'quality-source',
  }, [
    el('option', { value: 'harvest' }, [t('feed.qualitySourceHarvest')]),
    el('option', { value: 'feed_test' }, [t('feed.qualitySourceFeedTest')]),
    el('option', { value: 'estimate' }, [t('feed.qualitySourceEstimate')]),
  ]);
  if (existing?.source) inputs.source.value = existing.source;
  panel.appendChild(inputs.source);

  // Nutritional values grid
  panel.appendChild(el('label', { className: 'form-label', style: { marginTop: 'var(--space-4)' } }, [t('feed.qualityNutrients')]));

  const nutrientFields = [
    { key: 'dmPct',      label: 'DM %',       testId: 'quality-dm' },
    { key: 'proteinPct', label: 'CP %',        testId: 'quality-protein' },
    { key: 'adfPct',     label: 'ADF %',       testId: 'quality-adf' },
    { key: 'ndfPct',     label: 'NDF %',       testId: 'quality-ndf' },
    { key: 'tdnPct',     label: 'TDN %',       testId: 'quality-tdn' },
    { key: 'rfv',        label: 'RFV',         testId: 'quality-rfv' },
    { key: 'nPct',       label: 'N %',         testId: 'quality-n' },
    { key: 'pPct',       label: 'P %',         testId: 'quality-p' },
    { key: 'kPct',       label: 'K %',         testId: 'quality-k' },
    { key: 'caPct',      label: 'Ca %',        testId: 'quality-ca' },
    { key: 'mgPct',      label: 'Mg %',        testId: 'quality-mg' },
    { key: 'sPct',       label: 'S %',         testId: 'quality-s' },
  ];

  const nutrientGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' } });
  for (const field of nutrientFields) {
    inputs[field.key] = el('input', {
      type: 'number', className: 'auth-input settings-input',
      placeholder: field.label,
      value: existing?.[field.key] ?? '',
      'data-testid': field.testId,
      style: { fontSize: '12px' },
    });
    nutrientGrid.appendChild(inputs[field.key]);
  }
  panel.appendChild(nutrientGrid);

  // Lab
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.qualityLab')]));
  inputs.lab = el('input', {
    type: 'text', className: 'auth-input',
    value: existing?.lab || '',
    'data-testid': 'quality-lab',
  });
  panel.appendChild(inputs.lab);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.qualityNotes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input',
    value: existing?.notes || '',
    'data-testid': 'quality-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'quality-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'quality-save',
      onClick: () => {
        clear(statusEl);
        const parseNum = v => (v === '' || v == null) ? null : parseFloat(v);
        const data = {
          operationId,
          batchId: inputs.batchId.value || null,
          testedAt: inputs.testedAt.value,
          source: inputs.source.value,
          dmPct:       parseNum(inputs.dmPct.value),
          proteinPct:  parseNum(inputs.proteinPct.value),
          adfPct:      parseNum(inputs.adfPct.value),
          ndfPct:      parseNum(inputs.ndfPct.value),
          tdnPct:      parseNum(inputs.tdnPct.value),
          rfv:         parseNum(inputs.rfv.value),
          nPct:        parseNum(inputs.nPct.value),
          pPct:        parseNum(inputs.pPct.value),
          kPct:        parseNum(inputs.kPct.value),
          caPct:       parseNum(inputs.caPct.value),
          mgPct:       parseNum(inputs.mgPct.value),
          sPct:        parseNum(inputs.sPct.value),
          lab:         inputs.lab.value.trim() || null,
          notes:       inputs.notes.value.trim() || null,
        };
        try {
          if (isEdit) {
            update('batchNutritionalProfiles', existing.id, data,
              BatchNutritionalProfileEntity.validate,
              BatchNutritionalProfileEntity.toSupabaseShape,
              'batch_nutritional_profiles');
          } else {
            add('batchNutritionalProfiles', BatchNutritionalProfileEntity.create(data),
              BatchNutritionalProfileEntity.validate,
              BatchNutritionalProfileEntity.toSupabaseShape,
              'batch_nutritional_profiles');
          }
          qualitySheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => qualitySheet.close(),
    }, [t('action.cancel')]),
  ]));

  qualitySheet.open();
}
