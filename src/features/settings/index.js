/** @file Settings screen — farm settings, user prefs, account, sync status, backup */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, update, getSyncAdapter, getOperation, setUnitSystem } from '../../data/store.js';
import { canExport, exportOperationBackup, downloadBackup } from '../../data/backup-export.js';
import { validateBackup, getBackupPreview, importOperationBackup } from '../../data/backup-import.js';
import { validate as validateFarmSetting } from '../../entities/farm-setting.js';
import { validate as validateUserPref } from '../../entities/user-preference.js';
import { logout } from '../auth/session.js';
import {
  renderAiBullsSection, renderTreatmentCategoriesSection,
  renderTreatmentTypesSection, renderDoseUnitsSection,
  renderHealthRefSheetMarkups,
} from '../health/reference-tables.js';
import {
  renderProductCategoriesSection, renderProductsSection,
  renderSpreadersSection, renderProductUnitsSection,
  renderAmendmentRefSheetMarkups,
} from '../amendments/reference-tables.js';

/**
 * Render the settings screen.
 * @param {HTMLElement} container
 */
export function renderSettingsScreen(container) {
  const farmSettings = getAll('farmSettings')[0];
  const userPrefs = getAll('userPreferences')[0];

  if (!farmSettings || !userPrefs) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('settings.title')]));
    container.appendChild(el('p', {}, [t('error.generic')]));
    return;
  }

  const operationId = getAll('operations')[0]?.id;

  const sections = el('div', { className: 'settings-sections', 'data-testid': 'settings-screen' }, [
    el('h1', { className: 'screen-heading' }, [t('settings.title')]),
    renderUnitSection(container),
    renderFarmSection(farmSettings, container),
    renderPrefSection(userPrefs, container),
    // Health reference tables (CP-32)
    renderAiBullsSection(operationId),
    renderTreatmentCategoriesSection(operationId),
    renderTreatmentTypesSection(operationId),
    renderDoseUnitsSection(),
    // Amendment reference tables (CP-38)
    renderProductCategoriesSection(operationId),
    renderProductsSection(operationId),
    renderSpreadersSection(operationId),
    renderProductUnitsSection(),
    renderAccountSection(),
    renderSyncSection(),
    // Sheet markups for health reference tables
    ...renderHealthRefSheetMarkups(),
    ...renderAmendmentRefSheetMarkups(),
  ]);

  container.appendChild(sections);
}

function renderUnitSection(rootContainer) {
  const current = getOperation()?.unitSystem ?? 'imperial';

  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.unitSystem')]),
    el('div', { className: 'btn-row' }, [
      el('button', {
        className: `btn btn-sm ${current === 'metric' ? 'btn-green' : 'btn-outline'}`,
        'data-testid': 'settings-unit-metric',
        onClick: () => {
          setUnitSystem('metric');
          rerender(rootContainer);
        },
      }, [t('settings.metric')]),
      el('button', {
        className: `btn btn-sm ${current === 'imperial' ? 'btn-green' : 'btn-outline'}`,
        'data-testid': 'settings-unit-imperial',
        onClick: () => {
          setUnitSystem('imperial');
          rerender(rootContainer);
        },
      }, [t('settings.imperial')]),
    ]),
  ]);
}

function renderFarmSection(fs, _rootContainer) {
  const fields = [
    { key: 'defaultAuWeightKg', label: t('settings.auWeight') },
    { key: 'defaultResidualHeightCm', label: t('settings.residualHeight') },
    { key: 'defaultUtilizationPct', label: t('settings.utilizationPct') },
    { key: 'defaultRecoveryMinDays', label: t('settings.recoveryMinDays') },
    { key: 'defaultRecoveryMaxDays', label: t('settings.recoveryMaxDays') },
    { key: 'nPricePerKg', label: t('settings.nPrice') },
    { key: 'pPricePerKg', label: t('settings.pPrice') },
    { key: 'kPricePerKg', label: t('settings.kPrice') },
    { key: 'defaultManureRateKgPerDay', label: t('settings.manureRate') },
    { key: 'feedDayGoal', label: t('settings.feedDayGoal') },
    { key: 'forageQualityScaleMin', label: t('settings.forageQualityMin') },
    { key: 'forageQualityScaleMax', label: t('settings.forageQualityMax') },
  ];

  const inputs = {};

  const fieldEls = fields.map(f => {
    const input = el('input', {
      type: 'number',
      className: 'auth-input settings-input',
      value: fs[f.key] ?? '',
      'data-testid': `settings-farm-${f.key}`,
    });
    inputs[f.key] = input;
    return el('div', { className: 'settings-field' }, [
      el('label', { className: 'form-label' }, [f.label]),
      input,
    ]);
  });

  const statusEl = el('div', { className: 'auth-info', 'data-testid': 'settings-farm-status' });

  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.farmSettings')]),
    ...fieldEls,
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': 'settings-farm-save',
      onClick: () => {
        const changes = {};
        for (const f of fields) {
          const val = inputs[f.key].value;
          changes[f.key] = val === '' ? null : parseFloat(val);
        }
        try {
          update('farmSettings', fs.id, changes, validateFarmSetting);
          clear(statusEl);
          statusEl.className = 'auth-info';
          statusEl.appendChild(el('span', {}, [t('settings.saved')]));
        } catch (err) {
          clear(statusEl);
          statusEl.className = 'auth-error';
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    statusEl,
  ]);
}

function renderPrefSection(prefs, rootContainer) {
  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.userPreferences')]),
    el('div', { className: 'settings-field' }, [
      el('label', { className: 'form-label' }, [t('settings.viewMode')]),
      el('div', { className: 'btn-row' }, [
        el('button', {
          className: `btn btn-sm ${prefs.defaultViewMode === 'detail' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'settings-pref-detail',
          onClick: () => {
            update('userPreferences', prefs.id, { defaultViewMode: 'detail' }, validateUserPref);
            rerender(rootContainer);
          },
        }, [t('settings.viewDetail')]),
        el('button', {
          className: `btn btn-sm ${prefs.defaultViewMode === 'field' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'settings-pref-field',
          onClick: () => {
            update('userPreferences', prefs.id, { defaultViewMode: 'field' }, validateUserPref);
            rerender(rootContainer);
          },
        }, [t('settings.viewField')]),
      ]),
    ]),
    el('div', { className: 'settings-field' }, [
      el('label', { className: 'form-label' }, [t('settings.homeView')]),
      el('div', { className: 'btn-row' }, [
        el('button', {
          className: `btn btn-sm ${prefs.homeViewMode === 'groups' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'settings-pref-groups',
          onClick: () => {
            update('userPreferences', prefs.id, { homeViewMode: 'groups' }, validateUserPref);
            rerender(rootContainer);
          },
        }, [t('settings.homeGroups')]),
        el('button', {
          className: `btn btn-sm ${prefs.homeViewMode === 'locations' ? 'btn-green' : 'btn-outline'}`,
          'data-testid': 'settings-pref-locations',
          onClick: () => {
            update('userPreferences', prefs.id, { homeViewMode: 'locations' }, validateUserPref);
            rerender(rootContainer);
          },
        }, [t('settings.homeLocations')]),
      ]),
    ]),
  ]);
}

function renderAccountSection() {
  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.account')]),
    el('button', {
      className: 'btn btn-red btn-sm',
      'data-testid': 'settings-logout',
      onClick: () => logout(),
    }, [t('auth.logout')]),
  ]);
}

function renderSyncSection() {
  const adapter = getSyncAdapter();
  let status;
  try {
    status = adapter ? adapter.getStatus() : 'offline';
  } catch {
    status = 'offline';
  }

  const statusLabels = {
    idle: t('settings.syncIdle'),
    syncing: t('settings.syncSyncing'),
    error: t('settings.syncError'),
    offline: t('settings.syncOffline'),
  };

  const operation = getOperation();
  const opName = operation ? operation.name : '';

  // Export backup button (§20.3)
  const exportBtn = el('button', {
    className: 'btn btn-outline btn-sm',
    'data-testid': 'settings-export-backup-btn',
    onClick: () => handleExportClick(opName, operation),
  }, [t('settings.exportBackup')]);

  // Import backup button (§20.3)
  const fileInput = el('input', {
    type: 'file',
    accept: '.json',
    style: { display: 'none' },
    'data-testid': 'settings-import-file-input',
    onChange: (e) => handleImportFileSelect(e, operation),
  });

  const importBtn = el('button', {
    className: 'btn btn-outline btn-sm',
    'data-testid': 'settings-import-backup-btn',
    onClick: () => {
      const check = canExport(); // same gate as export
      if (!check.ok) {
        showExportToast(t('settings.exportSyncPending'));
        return;
      }
      fileInput.click();
    },
  }, [t('settings.importBackup')]);

  return el('div', { className: 'card settings-card' }, [
    el('h3', { className: 'settings-section-title' }, [t('settings.syncAndData')]),
    el('div', { className: 'sync-status', 'data-testid': 'settings-sync-status' }, [
      el('span', { className: `sync-dot sync-${status}` }),
      el('span', {}, [statusLabels[status] || status]),
    ]),
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [exportBtn, importBtn, fileInput]),
    // Export/import sheets mount here
    el('div', { id: 'export-sheet-mount' }),
  ]);
}

/**
 * Handle export button click — show confirm, then progress, then download.
 * @param {string} opName
 * @param {object} operation
 */
function handleExportClick(opName, operation) {
  const check = canExport();
  if (!check.ok) {
    showExportToast(t('settings.exportSyncPending'));
    return;
  }

  if (!operation) return;

  // Show confirm sheet
  const mount = document.getElementById('export-sheet-mount');
  if (!mount) return;
  clear(mount);

  const warningText = t('settings.exportPrivacyWarning');
  const confirmText = t('settings.exportConfirmBody').replace('{name}', opName);

  const confirmSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'export-confirm-sheet',
  }, [
    el('p', { style: { marginBottom: 'var(--space-3)' } }, [confirmText]),
    el('p', { style: { fontSize: '0.8125rem', color: 'var(--text2)', marginBottom: 'var(--space-4)' } }, [warningText]),
    el('div', { className: 'btn-row' }, [
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'export-confirm-btn',
        onClick: () => runExport(mount, operation),
      }, [t('settings.exportConfirm')]),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => clear(mount),
      }, [t('action.cancel')]),
    ]),
  ]);

  mount.appendChild(confirmSheet);
}

/**
 * Run the actual export with progress UI.
 * @param {HTMLElement} mount
 * @param {object} operation
 */
async function runExport(mount, operation) {
  clear(mount);

  const progressLabel = el('span', {}, ['0%']);
  const progressBar = el('div', { className: 'export-progress-bar' });
  const progressFill = el('div', { className: 'export-progress-fill' });
  progressBar.appendChild(progressFill);

  const progressSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'export-progress-sheet',
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' } }, [
      el('span', {}, [t('settings.exportingLabel')]),
      progressLabel,
    ]),
    progressBar,
  ]);

  mount.appendChild(progressSheet);

  try {
    const { json, fileName } = await exportOperationBackup(
      operation.id,
      (_table, pct) => {
        progressLabel.textContent = `${pct}%`;
        progressFill.style.width = `${pct}%`;
      }
    );

    downloadBackup(json, fileName);

    clear(mount);
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-green-dark)' },
      'data-testid': 'export-success',
    }, [t('settings.exportSuccess')]));
  } catch (err) {
    clear(mount);
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-red-base)' },
      'data-testid': 'export-error',
    }, [t('settings.exportError')]));
  }
}

/**
 * Show a temporary toast message.
 * @param {string} message
 */
function showExportToast(message) {
  const existing = document.querySelector('[data-testid="export-toast"]');
  if (existing) existing.remove();

  const toast = el('div', {
    className: 'export-toast',
    'data-testid': 'export-toast',
  }, [message]);

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ---------------------------------------------------------------------------
// Import flow (CP-56)
// ---------------------------------------------------------------------------

/**
 * Handle file selection for import.
 * @param {Event} e
 * @param {object} operation
 */
async function handleImportFileSelect(e, operation) {
  const file = e.target.files?.[0];
  if (!file) return;

  const mount = document.getElementById('export-sheet-mount');
  if (!mount) return;
  clear(mount);

  let backup;
  try {
    const text = await file.text();
    backup = JSON.parse(text);
  } catch {
    showExportToast(t('settings.importInvalidJson'));
    return;
  }

  // Step 1: Validate
  const validation = validateBackup(backup);
  if (!validation.valid) {
    showExportToast(validation.error);
    return;
  }

  // Step 3: Preview sheet
  const preview = getBackupPreview(backup);
  const previewSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'import-preview-sheet',
  }, [
    el('h3', { style: { marginBottom: 'var(--space-3)' } }, [t('settings.importPreviewTitle')]),
    el('div', { className: 'import-preview-grid' }, [
      previewRow(t('settings.importTargetOp'), operation?.name || '—'),
      previewRow(t('settings.importExportDate'), preview.exportedAt),
      previewRow(t('settings.importExportedBy'), preview.exportedByEmail),
      previewRow(t('settings.importSchemaVersion'), `v${preview.schemaVersion}`),
      previewRow(t('settings.importFarms'), String(preview.counts.farms || 0)),
      previewRow(t('settings.importEvents'), String(preview.counts.events || 0)),
      previewRow(t('settings.importAnimals'), String(preview.counts.animals || 0)),
      previewRow(t('settings.importBatches'), String(preview.counts.batches || 0)),
      previewRow(t('settings.importTodos'), String(preview.counts.todos || 0)),
    ]),
    el('p', {
      style: { color: 'var(--color-red-base)', fontSize: '0.875rem', marginTop: 'var(--space-4)', fontWeight: '600' },
    }, [t('settings.importDestructiveWarning')]),
    el('p', {
      style: { fontSize: '0.8125rem', color: 'var(--text2)', marginTop: 'var(--space-2)' },
    }, [t('settings.importAutoBackupNote')]),
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [
      el('button', {
        className: 'btn btn-red btn-sm',
        'data-testid': 'import-replace-btn',
        onClick: () => showSecondConfirm(mount, backup, operation),
      }, [t('settings.importReplaceAll')]),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => clear(mount),
      }, [t('action.cancel')]),
    ]),
  ]);

  mount.appendChild(previewSheet);
}

function previewRow(label, value) {
  return el('div', { className: 'import-preview-row' }, [
    el('span', { className: 'import-preview-label' }, [label]),
    el('span', { className: 'import-preview-value' }, [value]),
  ]);
}

/**
 * Show the second-step destructive confirmation (§5.7.3).
 */
function showSecondConfirm(mount, backup, operation) {
  clear(mount);
  mount.appendChild(el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', borderColor: 'var(--color-red-base)' },
    'data-testid': 'import-second-confirm',
  }, [
    el('p', { style: { fontWeight: '600', color: 'var(--color-red-base)' } }, [
      t('settings.importSecondConfirm'),
    ]),
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [
      el('button', {
        className: 'btn btn-red btn-sm',
        'data-testid': 'import-final-confirm-btn',
        onClick: () => runImport(mount, backup, operation),
      }, [t('settings.importYesReplace')]),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => clear(mount),
      }, [t('action.cancel')]),
    ]),
  ]));
}

/**
 * Run the actual import with progress UI (§5.7 step 10).
 */
async function runImport(mount, backup, operation) {
  clear(mount);

  const phaseLabel = el('span', {}, ['Validating']);
  const detailLabel = el('span', { style: { fontSize: '0.8125rem', color: 'var(--text2)' } }, ['']);
  const progressLabel = el('span', {}, ['0%']);
  const progressFill = el('div', { className: 'export-progress-fill' });
  const progressBar = el('div', { className: 'export-progress-bar' }, [progressFill]);

  const progressSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'import-progress-sheet',
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' } }, [
      phaseLabel,
      progressLabel,
    ]),
    detailLabel,
    el('div', { style: { marginTop: 'var(--space-3)' } }, [progressBar]),
  ]);

  mount.appendChild(progressSheet);

  const result = await importOperationBackup(
    backup,
    operation.id,
    (phase, detail, pct) => {
      phaseLabel.textContent = phase;
      detailLabel.textContent = detail;
      progressLabel.textContent = `${pct}%`;
      progressFill.style.width = `${pct}%`;
    }
  );

  clear(mount);

  if (result.success) {
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-green-dark)' },
      'data-testid': 'import-success',
    }, [t('settings.importSuccess')]));
  } else if (result.parityResult && !result.parityResult.pass) {
    // Parity failure — show mismatch report
    const rows = result.parityResult.mismatches.map(m =>
      el('div', { className: 'import-preview-row' }, [
        el('span', { className: 'import-preview-label' }, [m.table]),
        el('span', { className: 'import-preview-value' }, [`expected ${m.expected}, got ${m.actual}`]),
      ])
    );
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
      'data-testid': 'import-parity-report',
    }, [
      el('p', { style: { color: 'var(--color-red-base)', fontWeight: '600', marginBottom: 'var(--space-3)' } }, [
        t('settings.importParityFailed'),
      ]),
      ...rows,
      el('p', { style: { fontSize: '0.8125rem', color: 'var(--text2)', marginTop: 'var(--space-3)' } }, [
        t('settings.importParityRevert').replace('{filename}', result.autoBackupFileName || ''),
      ]),
    ]));
  } else {
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-red-base)' },
      'data-testid': 'import-error',
    }, [result.error || t('settings.importError')]));
  }
}

function rerender(container) {
  if (container) {
    clear(container);
    renderSettingsScreen(container);
  }
}
