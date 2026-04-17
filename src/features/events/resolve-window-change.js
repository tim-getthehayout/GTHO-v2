/** @file Gap / Overlap Resolution Dialog — SP-10 shared routine.
 * Surfaces three-option picker when a structural edit creates a gap or overlap. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';

/**
 * Open the gap/overlap resolution dialog.
 * @param {'gap'|'overlap'} type
 * @param {object} context — { groupName, priorWindowId, editedWindowId, gapStart, gapEnd, overlapStart, overlapEnd }
 * @param {object} callbacks — { onLeaveUnplaced, onExtendPrior, onRetroPlace, onTrimConflict, onMerge, onReject }
 */
export function openResolveDialog(type, context, callbacks) {
  // Remove existing dialog if open
  const existing = document.getElementById('resolve-window-dialog');
  if (existing) existing.remove();

  const overlay = el('div', {
    id: 'resolve-window-dialog',
    style: { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.5)', zIndex: '300', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: (e) => { if (e.target === overlay) { overlay.remove(); callbacks.onReject?.(); } },
  });

  const card = el('div', {
    className: 'card',
    style: { padding: 'var(--space-5)', maxWidth: '420px', width: '90%' },
  });

  if (type === 'gap') {
    const groupName = context.groupName || 'Group';
    const gapRange = `${context.gapStart || '?'} \u2013 ${context.gapEnd || '?'}`;

    card.appendChild(el('h3', { style: { marginBottom: 'var(--space-3)' } }, ['Gap detected']));
    card.appendChild(el('p', { style: { color: 'var(--text2)', fontSize: '13px', marginBottom: 'var(--space-4)', lineHeight: '1.5' } }, [
      `${groupName} would be unplaced from ${gapRange}. How would you like to handle this?`,
    ]));

    // Option 1: Leave unplaced
    card.appendChild(el('button', {
      className: 'btn btn-outline', style: { width: '100%', marginBottom: '8px', textAlign: 'left', padding: '10px 14px' },
      onClick: () => { overlay.remove(); callbacks.onLeaveUnplaced?.(); },
    }, ['Leave unplaced \u2014 accept the gap']));

    // Option 2: Extend prior event
    if (callbacks.onExtendPrior) {
      card.appendChild(el('button', {
        className: 'btn btn-outline', style: { width: '100%', marginBottom: '8px', textAlign: 'left', padding: '10px 14px' },
        onClick: () => { overlay.remove(); callbacks.onExtendPrior(); },
      }, ['Extend prior event \u2014 push date_left forward']));
    }

    // Option 3: Retro-place
    if (callbacks.onRetroPlace) {
      card.appendChild(el('button', {
        className: 'btn btn-outline', style: { width: '100%', marginBottom: '8px', textAlign: 'left', padding: '10px 14px' },
        onClick: () => { overlay.remove(); callbacks.onRetroPlace(); },
      }, ['Move to existing event \u2014 retro-place']));
    }

    // Cancel
    card.appendChild(el('button', {
      className: 'btn btn-outline', style: { width: '100%', color: 'var(--text2)' },
      onClick: () => { overlay.remove(); callbacks.onReject?.(); },
    }, ['Cancel']));

  } else if (type === 'overlap') {
    const groupName = context.groupName || 'Group';
    const overlapRange = `${context.overlapStart || '?'} \u2013 ${context.overlapEnd || '?'}`;

    card.appendChild(el('h3', { style: { marginBottom: 'var(--space-3)' } }, ['Overlap detected']));
    card.appendChild(el('p', { style: { color: 'var(--text2)', fontSize: '13px', marginBottom: 'var(--space-4)', lineHeight: '1.5' } }, [
      `${groupName} would be on two events during ${overlapRange}. How would you like to handle this?`,
    ]));

    // Option 1: Trim conflicting window
    if (callbacks.onTrimConflict) {
      card.appendChild(el('button', {
        className: 'btn btn-outline', style: { width: '100%', marginBottom: '8px', textAlign: 'left', padding: '10px 14px' },
        onClick: () => { overlay.remove(); callbacks.onTrimConflict(); },
      }, ['Trim the other window \u2014 push its start forward']));
    }

    // Option 2: Merge
    if (callbacks.onMerge) {
      card.appendChild(el('button', {
        className: 'btn btn-outline', style: { width: '100%', marginBottom: '8px', textAlign: 'left', padding: '10px 14px' },
        onClick: () => { overlay.remove(); callbacks.onMerge(); },
      }, ['Merge windows \u2014 combine into one']));
    }

    // Option 3: Reject
    card.appendChild(el('button', {
      className: 'btn btn-outline', style: { width: '100%', color: 'var(--red)', borderColor: 'var(--red)' },
      onClick: () => { overlay.remove(); callbacks.onReject?.(); },
    }, ['Cancel \u2014 pick different dates']));
  }

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
