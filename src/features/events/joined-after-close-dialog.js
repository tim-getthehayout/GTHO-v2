/** @file Review list for group windows that joined after a proposed close.
 * Options: zero-length at the close (default), or cancel with no writes. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet, ensureSheetDOM } from '../../ui/sheet.js';
import { getById } from '../../data/store.js';
import { formatWindowInstant } from './window-integrity.js';

let reviewSheet = null;

const SHEET_SHELL = {
  wrapId: 'joined-after-close-dialog-wrap',
  panelId: 'joined-after-close-dialog-panel',
  zIndex: '230',
  onBackdropClick: () => reviewSheet?.close(),
};

/**
 * @param {Object} params
 * @param {object[]} params.windows group windows whose join is after the close
 * @param {string} params.closeDate
 * @param {string|null} [params.closeTime]
 * @param {() => void} params.onConfirm proceed with zero-length at the close
 * @param {() => void} [params.onCancel]
 */
export function openJoinedAfterCloseDialog({ windows, closeDate, closeTime = null, onConfirm, onCancel }) {
  if (!windows || windows.length === 0) return;

  ensureSheetDOM(SHEET_SHELL);
  if (!reviewSheet) reviewSheet = new Sheet('joined-after-close-dialog-wrap');
  const panel = document.getElementById('joined-after-close-dialog-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', {
    'data-testid': 'joined-after-close-title',
    style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' },
  }, [t('event.joinedAfterCloseTitle')]));
  panel.appendChild(el('div', {
    style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' },
  }, [t('event.joinedAfterCloseParagraph')]));

  const list = el('div', { 'data-testid': 'joined-after-close-list' });
  for (const gw of windows) {
    const group = getById('groups', gw.groupId);
    const left = gw.dateLeft
      ? formatWindowInstant(gw.dateLeft, gw.timeLeft)
      : t('event.joinedAfterCloseStillOpen');
    const joined = formatWindowInstant(gw.dateJoined, gw.timeJoined);
    list.appendChild(el('div', {
      'data-testid': `joined-after-close-row-${gw.id}`,
      style: { borderTop: '0.5px solid var(--border)', padding: '10px 0', fontSize: '13px' },
    }, [t('event.joinedAfterCloseLine', {
      group: group?.name || t('event.unnamedGroup'),
      joined,
      left,
      outDate: formatWindowInstant(closeDate, closeTime),
    })]));
  }
  panel.appendChild(list);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'joined-after-close-zero-length',
      onClick: () => {
        reviewSheet.close();
        if (typeof onConfirm === 'function') onConfirm();
      },
    }, [t('event.joinedAfterCloseZeroLength')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'joined-after-close-cancel',
      onClick: () => {
        reviewSheet.close();
        if (typeof onCancel === 'function') onCancel();
      },
    }, [t('event.joinedAfterCloseCancel')]),
  ]));

  reviewSheet.open();
}
