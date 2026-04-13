/** @file Close event sheet — CP-20. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, update } from '../../data/store.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import { createObservation } from './index.js';

// ---------------------------------------------------------------------------
// Close Event — no move (CP-20)
// ---------------------------------------------------------------------------

let closeEventSheet = null;

export function openCloseEventSheet(evt, _operationId) {
  if (!closeEventSheet) {
    closeEventSheet = new Sheet('close-event-sheet-wrap');
  }

  const panel = document.getElementById('close-event-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.closeEventTitle')]));

  // Date out
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateOut')]));
  inputs.dateOut = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'close-event-date-out',
  });
  panel.appendChild(inputs.dateOut);

  // Time out
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeOut')]));
  inputs.timeOut = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'close-event-time-out',
  });
  panel.appendChild(inputs.timeOut);

  // Feed check placeholder
  panel.appendChild(el('div', {
    className: 'form-hint',
    style: { fontStyle: 'italic', marginTop: 'var(--space-4)' },
  }, [t('event.feedPlaceholder')]));

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'close-event-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-red',
      'data-testid': 'close-event-save',
      onClick: () => {
        clear(statusEl);
        const dateOut = inputs.dateOut.value;
        const timeOut = inputs.timeOut.value || null;
        if (!dateOut) {
          statusEl.appendChild(el('span', {}, ['Close date is required']));
          return;
        }
        try {
          // Close all open paddock windows + create close observations
          const pws = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
          for (const pw of pws) {
            update('eventPaddockWindows', pw.id, {
              dateClosed: dateOut,
              timeClosed: timeOut,
            }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
            createObservation(pw.operationId, pw.locationId, 'close', pw.id, new Date().toISOString());
          }
          // Close all open group windows
          const gws = getAll('eventGroupWindows').filter(w => w.eventId === evt.id && !w.dateLeft);
          for (const gw of gws) {
            update('eventGroupWindows', gw.id, {
              dateLeft: dateOut,
              timeLeft: timeOut,
            }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
          }
          // Set event date_out
          update('events', evt.id, {
            dateOut,
            timeOut,
          }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');
          closeEventSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('event.closeEvent')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'close-event-cancel',
      onClick: () => closeEventSheet.close(),
    }, [t('action.cancel')]),
  ]));

  closeEventSheet.open();
}
