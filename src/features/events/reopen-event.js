/** @file Event Reopen action — SP-10 event-level dates. Clears date_out, re-opens matching child windows. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, update } from '../../data/store.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';

/**
 * OI-0095 paddock classifier: for each event_paddock_window closed on
 * `event.dateOut`, decide reopen vs keepClosed.
 *
 *   - reopen: PW was closed by the event-close flow on `dateOut` AND no other
 *     PW on the same location has since been opened (either mid-event strip
 *     reuse or a later event on the same paddock).
 *   - keepClosed: another PW on this locationId was opened on-or-after this
 *     PW's dateClosed within the same event (strip reuse), OR another PW on
 *     this locationId is currently open anywhere (the paddock is in use).
 *
 * Exported for unit testing.
 */
export function classifyPwsForReopen(event) {
  const oldDateOut = event.dateOut;
  const allPws = getAll('eventPaddockWindows');
  const candidates = allPws.filter(pw => pw.eventId === event.id && pw.dateClosed === oldDateOut);
  const toReopen = [];
  const toKeepClosed = [];
  for (const pw of candidates) {
    const reusedInEvent = allPws.find(other =>
      other.eventId === event.id
      && other.locationId === pw.locationId
      && other.id !== pw.id
      && (other.dateOpened || '') >= (pw.dateClosed || ''),
    );
    if (reusedInEvent) {
      toKeepClosed.push({ pw, reason: 'reused', locationId: pw.locationId });
      continue;
    }
    const otherOpen = allPws.find(other =>
      other.locationId === pw.locationId && other.id !== pw.id && !other.dateClosed,
    );
    if (otherOpen) {
      toKeepClosed.push({ pw, reason: 'swap', locationId: pw.locationId });
      continue;
    }
    toReopen.push({ pw, locationId: pw.locationId });
  }
  return { toReopen, toKeepClosed };
}

/**
 * Classify each window that was closed by the event-close flow:
 *   - reopen: group has not since moved to another open event, and live
 *     memberships > 0 (hasn't culled to zero).
 *   - keepClosed: group has another open window elsewhere, or zero live
 *     memberships for that group.
 *
 * Exported for unit testing (OI-0094 entry #10).
 */
export function classifyGwsForReopen(event) {
  const oldDateOut = event.dateOut;
  const candidates = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id && gw.dateLeft === oldDateOut);
  const memberships = getAll('animalGroupMemberships');

  const reopen = [];
  const keepClosed = [];
  for (const gw of candidates) {
    const group = getById('groups', gw.groupId);
    const otherOpen = getAll('eventGroupWindows').find(g => g.groupId === gw.groupId && g.id !== gw.id && !g.dateLeft);
    if (otherOpen) {
      keepClosed.push({ gw, group, reason: 'moved' });
      continue;
    }
    const liveCount = memberships.filter(m => m.groupId === gw.groupId && !m.dateLeft).length;
    if (liveCount <= 0) {
      keepClosed.push({ gw, group, reason: 'empty' });
      continue;
    }
    reopen.push({ gw, group });
  }
  return { reopen, keepClosed };
}

/**
 * Reopen a closed event.
 * @param {object} event — the closed event to reopen
 * @param {string} operationId
 * @param {Function} onComplete — called after reopen succeeds
 */
export function reopenEvent(event, operationId, onComplete) {
  if (!event.dateOut) return; // already open

  const { reopen: gwReopen, keepClosed: gwKeepClosed } = classifyGwsForReopen(event);
  const { toReopen: pwReopen, toKeepClosed: pwKeepClosed } = classifyPwsForReopen(event);

  // OI-0094 entry #10 + OI-0095: summary dialog covers group + paddock windows.
  const overlay = el('div', {
    'data-testid': 'reopen-event-summary-overlay',
    style: { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.5)', zIndex: '300', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  });
  const card = el('div', { className: 'card', style: { padding: 'var(--space-5)', maxWidth: '480px', width: '90%' } });

  card.appendChild(el('h3', { style: { marginBottom: 'var(--space-3)' } }, ['Reopen event?']));
  card.appendChild(el('p', {
    'data-testid': 'reopen-summary-line',
    style: { fontSize: '13px', color: 'var(--text2)', lineHeight: '1.5', marginBottom: '8px' },
  }, [
    `${gwReopen.length} group window${gwReopen.length === 1 ? '' : 's'} will be reopened. `,
    `${gwKeepClosed.length} stay${gwKeepClosed.length === 1 ? 's' : ''} closed because the group has since left.`,
  ]));
  card.appendChild(el('p', {
    'data-testid': 'reopen-pw-summary-line',
    style: { fontSize: '13px', color: 'var(--text2)', lineHeight: '1.5', marginBottom: '8px' },
  }, [
    `${pwReopen.length} paddock window${pwReopen.length === 1 ? '' : 's'} will be reopened. `,
    `${pwKeepClosed.length} stay${pwKeepClosed.length === 1 ? 's' : ''} closed because the paddock has since been reused.`,
  ]));

  if (gwKeepClosed.length) {
    const ul = el('ul', { style: { fontSize: '12px', color: 'var(--text2)', paddingLeft: '18px', marginBottom: '8px' } });
    for (const kc of gwKeepClosed) {
      const reason = kc.reason === 'moved' ? 'already moved to another event' : 'no animals remain in this group';
      ul.appendChild(el('li', { 'data-testid': 'reopen-kept-closed-item' }, [`${kc.group?.name || 'Group'} — ${reason}`]));
    }
    card.appendChild(ul);
  }

  if (pwKeepClosed.length) {
    const ul = el('ul', { style: { fontSize: '12px', color: 'var(--text2)', paddingLeft: '18px', marginBottom: '12px' } });
    for (const kc of pwKeepClosed) {
      const loc = getById('locations', kc.locationId);
      const reason = kc.reason === 'reused'
        ? 'another window reused this paddock later in the event'
        : 'this paddock has an open window on another event';
      ul.appendChild(el('li', { 'data-testid': 'reopen-pw-kept-closed-item' }, [`${loc?.name || 'Paddock'} — ${reason}`]));
    }
    card.appendChild(ul);
  }

  card.appendChild(el('div', { className: 'btn-row' }, [
    el('button', { className: 'btn btn-green', 'data-testid': 'reopen-confirm', onClick: () => {
      executeReopen(event, gwReopen.map(r => r.gw), pwReopen.map(r => r.pw));
      overlay.remove();
      onComplete?.();
    } }, ['Reopen event']),
    el('button', { className: 'btn btn-outline', 'data-testid': 'reopen-cancel', onClick: () => overlay.remove() }, ['Cancel']),
  ]));

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function executeReopen(event, gwsToReopen, pwsToReopen) {
  // 1. Clear event date_out
  update('events', event.id, { dateOut: null, timeOut: null }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');

  // 2. Re-open paddock windows — only the classifier-approved set.
  for (const pw of pwsToReopen) {
    update('eventPaddockWindows', pw.id, { dateClosed: null, timeClosed: null }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  }

  // 3. Re-open group windows
  for (const gw of gwsToReopen) {
    update('eventGroupWindows', gw.id, { dateLeft: null, timeLeft: null }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
}
