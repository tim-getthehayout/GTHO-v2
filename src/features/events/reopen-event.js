/** @file Event Reopen action — SP-10 event-level dates. Clears date_out, re-opens matching child windows. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, update } from '../../data/store.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';

/**
 * Reopen a closed event.
 * @param {object} event — the closed event to reopen
 * @param {string} operationId
 * @param {Function} onComplete — called after reopen succeeds
 */
export function reopenEvent(event, operationId, onComplete) {
  if (!event.dateOut) return; // already open

  const oldDateOut = event.dateOut;

  // Check for group conflicts with subsequent events
  const gwsToReopen = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id && gw.dateLeft === oldDateOut);
  const conflicts = [];
  for (const gw of gwsToReopen) {
    const group = getById('groups', gw.groupId);
    // Check if this group has an open window on another event
    const otherOpenGws = getAll('eventGroupWindows').filter(g => g.groupId === gw.groupId && g.id !== gw.id && !g.dateLeft);
    for (const other of otherOpenGws) {
      const otherEvt = getById('events', other.eventId);
      if (otherEvt && !otherEvt.dateOut) {
        conflicts.push({ group, gw, otherEvent: otherEvt, otherGw: other });
      }
    }
  }

  if (conflicts.length) {
    // Show conflict dialog
    const overlay = el('div', {
      style: { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.5)', zIndex: '300', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    });
    const card = el('div', { className: 'card', style: { padding: 'var(--space-5)', maxWidth: '480px', width: '90%' } });

    card.appendChild(el('h3', { style: { marginBottom: 'var(--space-3)' } }, ['Group conflict detected']));

    for (const c of conflicts) {
      const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === c.otherEvent.id && !pw.dateClosed);
      const locName = pws[0] ? (getById('locations', pws[0].locationId)?.name || '?') : '?';
      card.appendChild(el('p', { style: { fontSize: '13px', color: 'var(--text2)', lineHeight: '1.5', marginBottom: '8px' } }, [
        `${c.group?.name || 'Group'} is currently on ${locName}. Reopening would put them back on this event too.`,
      ]));

      card.appendChild(el('button', { className: 'btn btn-outline btn-sm', style: { width: '100%', marginBottom: '6px', textAlign: 'left' }, onClick: () => {
        // Option A: reopen but leave group on subsequent event
        executeReopen(event, oldDateOut, gwsToReopen.filter(g => g.id !== c.gw.id));
        overlay.remove();
        onComplete?.();
      } }, [`Reopen but leave ${c.group?.name} on ${locName}`]));

      card.appendChild(el('button', { className: 'btn btn-outline btn-sm', style: { width: '100%', marginBottom: '6px', textAlign: 'left' }, onClick: () => {
        // Option B: pull group back
        const todayStr = new Date().toISOString().slice(0, 10);
        update('eventGroupWindows', c.otherGw.id, { dateLeft: todayStr }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
        executeReopen(event, oldDateOut, gwsToReopen);
        overlay.remove();
        onComplete?.();
      } }, [`Pull ${c.group?.name} back to this event`]));
    }

    card.appendChild(el('button', { className: 'btn btn-outline', style: { width: '100%', marginTop: '8px' }, onClick: () => overlay.remove() }, ['Cancel']));

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return;
  }

  // No conflicts — proceed directly
  if (!window.confirm(`Reopen this event? This clears the close date and re-opens paddock and group records that closed with the event.`)) return;
  executeReopen(event, oldDateOut, gwsToReopen);
  onComplete?.();
}

function executeReopen(event, oldDateOut, gwsToReopen) {
  // 1. Clear event date_out
  update('events', event.id, { dateOut: null, timeOut: null }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');

  // 2. Re-open paddock windows that closed with the event
  const pwsToReopen = getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id && pw.dateClosed === oldDateOut);
  for (const pw of pwsToReopen) {
    update('eventPaddockWindows', pw.id, { dateClosed: null, timeClosed: null }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  }

  // 3. Re-open group windows
  for (const gw of gwsToReopen) {
    update('eventGroupWindows', gw.id, { dateLeft: null, timeLeft: null }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
}
