/** @file Settings > Tools section — operation-wide utilities.
 *
 * OI-0132 Class B ships the first tool: backfill calving records from lineage.
 * Future tools (imports, diagnostics, repair routines) can add their own row to
 * this card without creating parallel sections elsewhere in Settings.
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { backfillCalvingRecords } from '../animals/backfill-calving-records.js';

export function renderToolsSection(operationId) {
  const card = el('div', { className: 'card settings-card', 'data-testid': 'settings-tools-section' }, [
    el('h3', { className: 'settings-section-title' }, [t('tools.title')]),
    renderBackfillCalvingRow(operationId),
  ]);
  return card;
}

function renderBackfillCalvingRow(operationId) {
  const summaryPanel = el('div', { 'data-testid': 'tools-backfill-calving-summary' });
  const runBtn = el('button', {
    className: 'btn btn-outline',
    'data-testid': 'tools-backfill-calving-run',
  }, [t('tools.backfillCalving.run')]);

  async function onRun() {
    runBtn.disabled = true;
    runBtn.textContent = t('tools.backfillCalving.running');
    clear(summaryPanel);
    try {
      const result = await backfillCalvingRecords(operationId);
      renderSummary(summaryPanel, result);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = t('tools.backfillCalving.runAgain');
    }
  }
  runBtn.addEventListener('click', onRun);

  return el('div', {
    className: 'tools-row',
    style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  }, [
    el('div', { style: { fontWeight: '600' } }, [t('tools.backfillCalving.title')]),
    el('div', { className: 'form-hint' }, [t('tools.backfillCalving.description')]),
    runBtn,
    summaryPanel,
  ]);
}

function renderSummary(container, result) {
  const { created, skippedNoBirthDate, skippedDamMissing, skippedAlreadyExists, skippedError } = result;
  const total = created + skippedNoBirthDate + skippedDamMissing + skippedAlreadyExists + skippedError;
  if (total === 0) {
    container.appendChild(el('div', {
      className: 'form-hint',
      'data-testid': 'tools-backfill-calving-empty',
    }, [t('tools.backfillCalving.summary.empty')]));
    return;
  }
  const rows = [
    el('div', { 'data-testid': 'tools-backfill-calving-summary-created' }, [
      t('tools.backfillCalving.summary.created', { N: created }),
    ]),
    el('div', { 'data-testid': 'tools-backfill-calving-summary-noBirthDate' }, [
      t('tools.backfillCalving.summary.skippedNoBirthDate', { N: skippedNoBirthDate }),
    ]),
    el('div', { 'data-testid': 'tools-backfill-calving-summary-damMissing' }, [
      t('tools.backfillCalving.summary.skippedDamMissing', { N: skippedDamMissing }),
    ]),
    el('div', { 'data-testid': 'tools-backfill-calving-summary-alreadyExists' }, [
      t('tools.backfillCalving.summary.skippedAlreadyExists', { N: skippedAlreadyExists }),
    ]),
  ];
  if (skippedError > 0) {
    rows.push(el('div', {
      'data-testid': 'tools-backfill-calving-summary-error',
      style: { color: 'var(--red, #d33)' },
    }, [t('tools.backfillCalving.summary.skippedError', { N: skippedError })]));
  }
  container.appendChild(el('div', {
    style: { marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: '4px' },
  }, rows));
}
