/**
 * @file v1 → v2 import UI — CP-57.
 * Implements V2_MIGRATION_PLAN.md §1.7.
 * File upload, transform preview, progress, audit report, unparseable dose CSV.
 */
/* global Blob */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { canExport } from '../../data/backup-export.js';
import { importOperationBackup } from '../../data/backup-import.js';
import { isV1Export, transformV1ToV2, generateDoseAuditCsv, isOperationEmpty } from '../../data/v1-migration.js';
import { getAll } from '../../data/store.js';
import { supabase } from '../../data/supabase-client.js';
import { logger } from '../../utils/logger.js';

/**
 * Render the "Import from v1" button for the settings sync section.
 * @param {HTMLElement} mount - The sheet mount container
 * @param {object} operation - Current operation
 * @returns {HTMLElement} The button + hidden file input
 */
export function renderV1ImportButton(mount, operation) {
  const fileInput = el('input', {
    type: 'file',
    accept: '.json',
    style: { display: 'none' },
    'data-testid': 'settings-v1-import-file-input',
    onChange: (e) => handleV1FileSelect(e, mount, operation),
  });

  const btn = el('button', {
    className: 'btn btn-outline btn-sm',
    'data-testid': 'settings-v1-import-btn',
    onClick: () => {
      const check = canExport();
      if (!check.ok) {
        showToast(t('settings.importV1SyncPending'));
        return;
      }
      fileInput.click();
    },
  }, [t('settings.importFromV1')]);

  return el('span', {}, [btn, fileInput]);
}

/**
 * Handle v1 file selection.
 */
async function handleV1FileSelect(e, mount, operation) {
  const file = e.target.files?.[0];
  if (!file) return;
  // Reset input so the same file can be re-selected
  e.target.value = '';

  clear(mount);

  let v1Data;
  try {
    const text = await file.text();
    v1Data = JSON.parse(text);
  } catch {
    showToast(t('settings.importInvalidJson'));
    return;
  }

  if (!isV1Export(v1Data)) {
    showToast(t('settings.importV1NotV1'));
    return;
  }

  // Show transforming indicator
  mount.appendChild(el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'v1-import-transforming',
  }, [t('settings.importV1Transforming')]));

  // Yield to render, then transform
  await new Promise(r => setTimeout(r, 0));

  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch existing dose_units for matching
    const { data: doseUnits } = await supabase
      .from('dose_units')
      .select('id, name')
      .eq('operation_id', operation.id);

    const { envelope, audit } = transformV1ToV2(v1Data, {
      operationId: operation.id,
      userId: user?.id || null,
      userEmail: user?.email || null,
      timezone: operation.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      existingDoseUnits: doseUnits || [],
    });

    clear(mount);
    showV1Preview(mount, envelope, audit, operation);
  } catch (err) {
    clear(mount);
    logger.error('migration', 'v1 transform failed', { error: err.message });
    mount.appendChild(el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-red-base)' },
      'data-testid': 'v1-import-transform-error',
    }, [`${t('settings.importV1TransformFailed')}: ${err.message}`]));
  }
}

/**
 * Show the transform preview before committing (acceptance criteria #10).
 */
function showV1Preview(mount, envelope, audit, operation) {
  // Build table count rows
  const mainTables = ['locations', 'events', 'animals', 'groups', 'batches',
    'feed_types', 'forage_types', 'surveys', 'harvest_events', 'amendments',
    'todos', 'animal_weight_records', 'animal_treatments', 'animal_notes'];

  const countRows = mainTables
    .filter(t2 => (envelope.tables[t2] || []).length > 0)
    .map(t2 => previewRow(t2, String((envelope.tables[t2] || []).length)));

  // Warnings
  const warningEls = [];
  if (audit.unparseableDoses.length > 0) {
    warningEls.push(el('p', {
      style: { color: 'var(--color-yellow-dark)', fontSize: '0.875rem', marginTop: 'var(--space-2)' },
    }, [t('settings.importV1DoseWarning', { count: String(audit.unparseableDoses.length) })]));
  }
  if (audit.warnings.length > 0) {
    warningEls.push(el('p', {
      style: { color: 'var(--color-yellow-dark)', fontSize: '0.875rem', marginTop: 'var(--space-2)' },
    }, [t('settings.importV1Warnings', { count: String(audit.warnings.length) })]));
  }

  const previewSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'v1-import-preview',
  }, [
    el('h3', { style: { marginBottom: 'var(--space-3)' } }, [t('settings.importV1PreviewTitle')]),
    el('p', { style: { fontSize: '0.875rem', color: 'var(--text2)', marginBottom: 'var(--space-3)' } }, [
      t('settings.importV1PreviewDesc'),
    ]),
    el('div', { className: 'import-preview-grid' }, countRows),
    ...warningEls,
    el('p', {
      style: { color: 'var(--color-red-base)', fontSize: '0.875rem', marginTop: 'var(--space-4)', fontWeight: '600' },
    }, [t('settings.importDestructiveWarning')]),
    el('p', {
      style: { fontSize: '0.8125rem', color: 'var(--text2)', marginTop: 'var(--space-2)' },
    }, [t('settings.importV1AutoBackupNote')]),
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [
      el('button', {
        className: 'btn btn-red btn-sm',
        'data-testid': 'v1-import-confirm-btn',
        onClick: () => showV1SecondConfirm(mount, envelope, audit, operation),
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
 * Second-step destructive confirmation.
 */
function showV1SecondConfirm(mount, envelope, audit, operation) {
  clear(mount);
  mount.appendChild(el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', borderColor: 'var(--color-red-base)' },
    'data-testid': 'v1-import-second-confirm',
  }, [
    el('p', { style: { fontWeight: '600', color: 'var(--color-red-base)' } }, [
      t('settings.importV1SecondConfirm'),
    ]),
    el('div', { className: 'btn-row', style: { marginTop: 'var(--space-4)' } }, [
      el('button', {
        className: 'btn btn-red btn-sm',
        'data-testid': 'v1-import-final-confirm-btn',
        onClick: () => runV1Import(mount, envelope, audit, operation),
      }, [t('settings.importYesReplace')]),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => clear(mount),
      }, [t('action.cancel')]),
    ]),
  ]));
}

/**
 * Run the v1 import via the CP-56 pipeline.
 */
async function runV1Import(mount, envelope, audit, operation) {
  clear(mount);

  const phaseLabel = el('span', {}, [t('settings.importV1Starting')]);
  const detailLabel = el('span', { style: { fontSize: '0.8125rem', color: 'var(--text2)' } }, ['']);
  const progressLabel = el('span', {}, ['0%']);
  const progressFill = el('div', { className: 'export-progress-fill' });
  const progressBar = el('div', { className: 'export-progress-bar' }, [progressFill]);

  const progressSheet = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'v1-import-progress',
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' } }, [
      phaseLabel,
      progressLabel,
    ]),
    detailLabel,
    el('div', { style: { marginTop: 'var(--space-3)' } }, [progressBar]),
  ]);

  mount.appendChild(progressSheet);

  // §1.6: Skip auto-backup when target operation is empty
  const empty = isOperationEmpty({ getAll });

  const result = await importOperationBackup(
    envelope,
    operation.id,
    (phase, detail, pct) => {
      phaseLabel.textContent = phase;
      detailLabel.textContent = detail;
      progressLabel.textContent = `${pct}%`;
      progressFill.style.width = `${pct}%`;
    },
    { skipAutoBackup: empty }
  );

  clear(mount);

  if (result.success) {
    // Download unparseable dose CSV if any (§1.4)
    if (audit.unparseableDoses.length > 0) {
      downloadDoseAuditCsv(audit.unparseableDoses);
    }

    showV1SuccessReport(mount, audit, result);
  } else if (result.parityResult && !result.parityResult.pass) {
    showV1ParityReport(mount, audit, result);
  } else {
    const errorCard = el('div', {
      className: 'card',
      style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)', color: 'var(--color-red-base)' },
      'data-testid': 'v1-import-error',
    }, [result.error || t('settings.importError')]);
    errorCard.appendChild(renderCopyErrorLogBtn(audit, result));
    mount.appendChild(errorCard);
  }
}

/**
 * Show success report with audit summary.
 */
function showV1SuccessReport(mount, audit, result) {
  const reportRows = [];
  if (audit.unparseableDoses.length > 0) {
    reportRows.push(el('p', {
      style: { fontSize: '0.875rem', color: 'var(--color-yellow-dark)', marginTop: 'var(--space-2)' },
    }, [t('settings.importV1DoseCsvDownloaded', { count: String(audit.unparseableDoses.length) })]));
  }
  if (audit.warnings.length > 0) {
    reportRows.push(el('p', {
      style: { fontSize: '0.875rem', color: 'var(--text2)', marginTop: 'var(--space-2)' },
    }, [t('settings.importV1WarningsSummary', { count: String(audit.warnings.length) })]));
  }

  mount.appendChild(el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'v1-import-success',
  }, [
    el('p', { style: { color: 'var(--color-green-dark)', fontWeight: '600' } }, [t('settings.importV1Success')]),
    ...reportRows,
    renderCopyErrorLogBtn(audit, result),
  ]));
}

/**
 * Show parity failure report.
 */
function showV1ParityReport(mount, audit, result) {
  const rows = result.parityResult.mismatches.map(m =>
    el('div', { className: 'import-preview-row' }, [
      el('span', { className: 'import-preview-label' }, [m.table]),
      el('span', { className: 'import-preview-value' }, [t('event.parityExpected', { expected: m.expected, actual: m.actual })]),
    ])
  );

  mount.appendChild(el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'v1-import-parity-report',
  }, [
    el('p', { style: { color: 'var(--color-red-base)', fontWeight: '600', marginBottom: 'var(--space-3)' } }, [
      t('settings.importParityFailed'),
    ]),
    ...rows,
    el('p', { style: { fontSize: '0.8125rem', color: 'var(--text2)', marginTop: 'var(--space-3)' } }, [
      t('settings.importParityRevert').replace('{filename}', result.autoBackupFileName || ''),
    ]),
    renderCopyErrorLogBtn(audit, result),
  ]));
}

/**
 * Download unparseable dose audit CSV (§1.4).
 */
function downloadDoseAuditCsv(doses) {
  const csv = generateDoseAuditCsv(doses);
  if (!csv) return;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `v1-migration-unparseable-doses-${new Date().toISOString().split('T')[0]}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function showToast(message) {
  const existing = document.querySelector('[data-testid="export-toast"]');
  if (existing) existing.remove();

  const toast = el('div', {
    className: 'export-toast',
    'data-testid': 'export-toast',
  }, [message]);

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/**
 * Render a "Copy error log" button (OI-0051).
 * Collects logger buffer (warn/error), audit data, and result summary.
 * @param {object} [audit] - Migration audit object
 * @param {object} [result] - Import result object
 * @returns {HTMLElement}
 */
function renderCopyErrorLogBtn(audit, result) {
  return el('button', {
    className: 'btn btn-outline btn-xs',
    style: { marginTop: 'var(--space-3)' },
    'data-testid': 'v1-import-copy-error-log',
    onClick: async () => {
      const lines = [];
      lines.push(`=== GTHO v1 Migration Log — ${new Date().toISOString()} ===`);
      lines.push('');

      // Result summary
      if (result) {
        lines.push(`Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
        if (result.error) lines.push(`Error: ${result.error}`);
        if (result.autoBackupFileName) lines.push(`Auto-backup: ${result.autoBackupFileName}`);
        if (result.parityResult && !result.parityResult.pass) {
          lines.push('Parity mismatches:');
          for (const m of result.parityResult.mismatches) {
            lines.push(`  ${m.table}: expected ${m.expected}, got ${m.actual}`);
          }
        }
        lines.push('');
      }

      // Audit data
      if (audit) {
        if (audit.warnings && audit.warnings.length > 0) {
          lines.push(`Warnings (${audit.warnings.length}):`);
          for (const w of audit.warnings) lines.push(`  ${w}`);
          lines.push('');
        }
        if (audit.unparseableDoses && audit.unparseableDoses.length > 0) {
          lines.push(`Unparseable doses: ${audit.unparseableDoses.length}`);
        }
        if (audit.transferPairsFound != null) {
          lines.push(`Transfer pairs: ${audit.transferPairsFound} found, ${audit.transferPairsLinked || 0} linked, ${audit.transferPairsOrphaned || 0} orphaned`);
        }
        lines.push('');
      }

      // Logger buffer (warn + error only)
      const buffer = logger.getBuffer();
      const filtered = buffer.filter(e => e.level === 'warn' || e.level === 'error');
      if (filtered.length > 0) {
        lines.push(`Logger entries (${filtered.length} warn/error):`);
        for (const e of filtered) {
          lines.push(`  [${e.timestamp || '?'}] ${e.level} [${e.category}] ${e.message}${e.context ? ' ' + JSON.stringify(e.context) : ''}`);
        }
      } else {
        lines.push('Logger: no warn/error entries.');
      }

      try {
        await navigator.clipboard.writeText(lines.join('\n'));
        showToast(t('settings.importV1ErrorLogCopied'));
      } catch {
        showToast(t('settings.importV1ErrorLogCopied'));
      }
    },
  }, [t('settings.importV1CopyErrorLog')]);
}
