/** @file OI-0186 — Guided date-conflict correction dialog.
 *
 *  Renders the OI-0185 conflict list as a plain user-facing dialog with one-
 *  tap actions: "Set open date to {outDate}", "Edit…" (jumps to the paddock-
 *  window edit dialog — OI-0064), "Fix all" (clamps every conflicting open
 *  date to the chosen out-date), and Cancel. The raw entity validator string
 *  never reaches the surface — the dialog renders structured i18n copy keyed
 *  off the conflict objects' `openDate`, `outDate`, and looked-up paddock /
 *  group names.
 *
 *  Resume protocol — after the user applies a one-tap fix (or "Fix all"), the
 *  dialog closes and calls `onResume`. The caller (close.js / move-wizard.js)
 *  re-enters its own execute path, which re-runs the OI-0185 pre-flight; a
 *  partial fix that left a residual conflict cannot slip past because the
 *  pre-flight will simply re-open the dialog on the still-conflicting window.
 *
 *  No silent writes — the user sees the new open date on every button label
 *  ("Set open date to 2026-06-06"). Tap-outside / Cancel returns the user to
 *  the close/move sheet without touching the store.
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getById, update } from '../../data/store.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import { openEditPaddockWindowDialog } from './edit-paddock-window.js';

let dateConflictSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('date-conflict-dialog-wrap')) return;
  document.body.appendChild(el('div', {
    className: 'sheet-wrap',
    id: 'date-conflict-dialog-wrap',
    style: { zIndex: '230' },
  }, [
    el('div', { className: 'sheet-backdrop', onClick: () => dateConflictSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'date-conflict-dialog-panel' }),
  ]));
}

/**
 * Apply the one-tap "Set open date" correction: clamp the conflicting window's
 * open date / time so it sits on the chosen out-date. The window-side time is
 * cleared to null because the close-side carries the canonical time stamp.
 *
 * @param {import('./window-close-guard.js').WindowCloseConflict} conflict
 */
function applyOneTapFix(conflict) {
  if (conflict.kind === 'paddock') {
    update(
      'eventPaddockWindows', conflict.windowId,
      { dateOpened: conflict.outDate, timeOpened: null },
      PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
    );
  } else {
    update(
      'eventGroupWindows', conflict.windowId,
      { dateJoined: conflict.outDate, timeJoined: null },
      GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows',
    );
  }
}

/**
 * Open the guided date-conflict correction dialog.
 *
 * @param {Object} params
 * @param {import('./window-close-guard.js').WindowCloseConflict[]} params.conflicts
 * @param {string} params.operationId
 * @param {() => void} params.onResume    re-enter the close/move execute path
 * @param {Object} [params.event]         parent event — required when the user taps "Edit…" so the edit dialog can render
 */
export function openDateConflictDialog({ conflicts, operationId, onResume, event }) {
  if (!conflicts || conflicts.length === 0) return;

  ensureSheetDOM();
  if (!dateConflictSheet) dateConflictSheet = new Sheet('date-conflict-dialog-wrap');
  const panel = document.getElementById('date-conflict-dialog-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', {
    'data-testid': 'date-conflict-dialog-title',
    style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' },
  }, [t('event.windowCloseConflictTitle')]));
  panel.appendChild(el('div', {
    style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' },
  }, [t('event.windowCloseConflictParagraph')]));

  const list = el('div', { 'data-testid': 'date-conflict-dialog-list' });
  for (const conflict of conflicts) {
    const isPaddock = conflict.kind === 'paddock';
    const lineKey = isPaddock
      ? 'event.windowCloseConflictPaddockLine'
      : 'event.windowCloseConflictGroupLine';
    const replacements = isPaddock
      ? {
          location: getById('locations', conflict.locationId)?.name || 'Paddock',
          openDate: conflict.openDate,
          outDate: conflict.outDate,
        }
      : {
          group: getById('groups', conflict.groupId)?.name || 'Group',
          openDate: conflict.openDate,
          outDate: conflict.outDate,
        };

    const row = el('div', {
      'data-testid': `date-conflict-row-${conflict.windowId}`,
      style: { borderTop: '0.5px solid var(--border)', padding: '10px 0' },
    }, [
      el('div', { style: { fontSize: '13px', marginBottom: '6px' } }, [t(lineKey, replacements)]),
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
        el('button', {
          className: 'btn btn-green btn-xs',
          'data-testid': `date-conflict-set-${conflict.windowId}`,
          onClick: () => {
            applyOneTapFix(conflict);
            dateConflictSheet.close();
            if (typeof onResume === 'function') onResume();
          },
        }, [t('event.windowCloseConflictSetOpenDate', { outDate: conflict.outDate })]),
        isPaddock ? el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `date-conflict-edit-${conflict.windowId}`,
          onClick: () => {
            const pw = getById('eventPaddockWindows', conflict.windowId);
            if (!pw || !event) return;
            dateConflictSheet.close();
            openEditPaddockWindowDialog(pw, event, operationId);
          },
        }, [t('event.windowCloseConflictEdit')]) : null,
      ].filter(Boolean)),
    ]);
    list.appendChild(row);
  }
  panel.appendChild(list);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'date-conflict-cancel',
      onClick: () => dateConflictSheet.close(),
    }, [t('event.windowCloseConflictCancel')]),
    conflicts.length > 1 ? el('button', {
      className: 'btn btn-green',
      'data-testid': 'date-conflict-fix-all',
      onClick: () => {
        for (const conflict of conflicts) applyOneTapFix(conflict);
        dateConflictSheet.close();
        if (typeof onResume === 'function') onResume();
      },
    }, [t('event.windowCloseConflictFixAll')]) : null,
  ].filter(Boolean)));

  dateConflictSheet.open();
}
