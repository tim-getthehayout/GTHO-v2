/** @file Review list for group windows that joined after a proposed close.
 * Options: zero-length at the close (default), or cancel with no writes. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getById } from '../../data/store.js';

let reviewSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('joined-after-close-dialog-wrap')) return;
  document.body.appendChild(el('div', {
    className: 'sheet-wrap',
    id: 'joined-after-close-dialog-wrap',
    style: { zIndex: '230' },
  }, [
    el('div', { className: 'sheet-backdrop', onClick: () => reviewSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'joined-after-close-dialog-panel' }),
  ]));
}

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

  ensureSheetDOM();
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
      ? `${gw.dateLeft}${gw.timeLeft ? ` ${gw.timeLeft}` : ''}`
      : t('event.joinedAfterCloseStillOpen');
    const joined = `${gw.dateJoined || ''}${gw.timeJoined ? ` ${gw.timeJoined}` : ''}`;
    list.appendChild(el('div', {
      'data-testid': `joined-after-close-row-${gw.id}`,
      style: { borderTop: '0.5px solid var(--border)', padding: '10px 0', fontSize: '13px' },
    }, [t('event.joinedAfterCloseLine', {
      group: group?.name || t('event.unnamedGroup'),
      joined,
      left,
      outDate: closeTime ? `${closeDate} ${closeTime}` : closeDate,
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
