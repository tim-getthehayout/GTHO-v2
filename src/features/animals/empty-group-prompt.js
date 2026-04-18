/** @file Empty-group prompt — OI-0090 / SP-11 Parts 2–4.
 *
 * Triggered by state-change flows (cull, move, Edit Group, Edit Animal group change,
 * Split Group, §7 Remove group) *after* the OI-0091 window-split/close commit.
 * The helper `maybeShowEmptyGroupPrompt(groupId)` checks whether the group has
 * zero open memberships — if so, opens the prompt; otherwise no-op.
 *
 * The prompt offers Archive (primary), Keep active, or Delete. Delete is disabled
 * when the group has any `event_group_window` history.
 *
 * Per the 2026-04-17 SP-11 revision: do NOT rebuild a centralized
 * `onLastMembershipClosed` cascade. OI-0091 owns window closure; this module is
 * strictly the post-commit UI.
 */

import { el, clear } from '../../ui/dom.js';
import { Sheet } from '../../ui/sheet.js';
import {
  getAll, getById, archiveGroup, remove,
} from '../../data/store.js';
import { logger } from '../../utils/logger.js';

let emptyGroupSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('empty-group-prompt-wrap')) return;
  document.body.appendChild(el('div', {
    className: 'sheet-wrap',
    id: 'empty-group-prompt-wrap',
    style: { zIndex: '235' },
  }, [
    el('div', { className: 'sheet-backdrop', onClick: () => emptyGroupSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'empty-group-prompt-panel' }),
  ]));
}

function showToast(message, testid = 'empty-group-prompt-toast') {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(`[data-testid="${testid}"]`);
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.setAttribute('data-testid', testid);
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 14px;border-radius:8px;font-size:13px;z-index:400;max-width:90%;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/**
 * Pure helper — does this group currently have zero open memberships?
 * Exported for unit testing.
 *
 * @param {string} groupId
 * @returns {boolean}
 */
export function groupIsEmpty(groupId) {
  if (!groupId) return false;
  const mems = getAll('animalGroupMemberships');
  return !mems.some(m => m.groupId === groupId && !m.dateLeft);
}

/**
 * Pure helper — event history count. If > 0, Delete must be disabled and
 * Archive is the only removal-of-presence action (preserves FK integrity).
 *
 * @param {string} groupId
 * @returns {number}
 */
export function groupEventHistoryCount(groupId) {
  if (!groupId) return 0;
  return getAll('eventGroupWindows').filter(w => w.groupId === groupId).length;
}

/**
 * Open the empty-group prompt for a specific group.
 * Exported mostly for direct use from management UI if needed; flows should use
 * `maybeShowEmptyGroupPrompt` instead so it auto-checks emptiness.
 *
 * @param {string} groupId
 */
export function openEmptyGroupPrompt(groupId) {
  const group = getById('groups', groupId);
  if (!group) {
    logger.warn('empty-group-prompt', 'group not found', { groupId });
    return;
  }

  ensureSheetDOM();
  if (!emptyGroupSheet) emptyGroupSheet = new Sheet('empty-group-prompt-wrap');
  const panel = document.getElementById('empty-group-prompt-panel');
  if (!panel) return;
  clear(panel);

  const eventCount = groupEventHistoryCount(groupId);
  const deleteDisabled = eventCount > 0;

  panel.appendChild(el('div', { className: 'sheet-handle' }));

  panel.appendChild(el('div', {
    'data-testid': 'empty-group-prompt-title',
    style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' },
  }, [`${group.name} is empty`]));

  panel.appendChild(el('div', {
    style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' },
  }, [
    `${group.name} has no animals left. What would you like to do?`,
  ]));

  const bodyList = el('ul', {
    style: { fontSize: '12px', color: 'var(--text2)', paddingLeft: '18px', marginBottom: '14px', lineHeight: '1.5' },
  });
  bodyList.appendChild(el('li', {}, [
    el('strong', {}, ['Archive']),
    ' — Keep the group in your history. Archived groups stay on past events. Reactivate anytime (useful for seasonal cohorts).',
  ]));
  bodyList.appendChild(el('li', {}, [
    el('strong', {}, ['Keep active']),
    ' — Leave as-is. You can add animals later.',
  ]));
  bodyList.appendChild(el('li', {}, [
    el('strong', {}, ['Delete']),
    deleteDisabled
      ? ` — disabled. ${group.name} is on ${eventCount} event${eventCount === 1 ? '' : 's'}; archive instead to preserve history.`
      : ' — Permanently remove this group.',
  ]));
  panel.appendChild(bodyList);

  const deleteButton = el('button', {
    className: 'btn btn-outline',
    'data-testid': 'empty-group-prompt-delete',
    style: {
      color: deleteDisabled ? 'var(--text2)' : 'var(--red)',
      borderColor: deleteDisabled ? 'var(--border)' : 'var(--red)',
      opacity: deleteDisabled ? '0.5' : '1',
      cursor: deleteDisabled ? 'not-allowed' : 'pointer',
    },
    title: deleteDisabled
      ? `This group is on ${eventCount} event(s). Archive instead to preserve history.`
      : '',
    onClick: () => {
      if (deleteDisabled) return;
      if (!window.confirm(`Delete ${group.name}? This cannot be undone.`)) return;
      remove('groups', groupId, 'groups');
      emptyGroupSheet.close();
      showToast(`${group.name} deleted`);
    },
  }, ['Delete']);

  panel.appendChild(el('div', { className: 'btn-row' }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'empty-group-prompt-archive',
      onClick: () => {
        archiveGroup(groupId);
        emptyGroupSheet.close();
        showToast(`${group.name} archived`);
      },
    }, ['Archive']),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'empty-group-prompt-keep',
      onClick: () => emptyGroupSheet.close(),
    }, ['Keep active']),
    deleteButton,
  ]));

  emptyGroupSheet.open();
}

/**
 * Called by state-change flows after their OI-0091 `splitGroupWindow` /
 * `closeGroupWindow` commit. If the group has zero open memberships, opens
 * the empty-group prompt. Otherwise no-op.
 *
 * Safe to call with a group that is not on any event — no-op as long as
 * memberships exist.
 *
 * @param {string} groupId
 */
export function maybeShowEmptyGroupPrompt(groupId) {
  if (!groupId) return;
  if (!groupIsEmpty(groupId)) return;
  const group = getById('groups', groupId);
  if (!group) return;
  if (group.archivedAt) return; // already archived — nothing to prompt about
  openEmptyGroupPrompt(groupId);
}
