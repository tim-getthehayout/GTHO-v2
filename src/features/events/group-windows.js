/** @file Group add/remove sheets — CP-18. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert } from '../../utils/units.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';

// ---------------------------------------------------------------------------
// Group add sheet (CP-18)
// ---------------------------------------------------------------------------

let groupAddSheet = null;

function ensureGroupAddDOM() {
  if (document.getElementById('group-add-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'group-add-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => groupAddSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'group-add-sheet-panel' }),
  ]));
}

export function openGroupAddSheet(evt, operationId) {
  ensureGroupAddDOM();
  if (!groupAddSheet) {
    groupAddSheet = new Sheet('group-add-sheet-wrap');
  }

  const panel = document.getElementById('group-add-sheet-panel');
  if (!panel) return;
  clear(panel);

  const groups = getAll('groups').filter(g => !g.archived);
  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);
  const selection = { groupId: null };
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.addGroupTitle')]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateJoined')]));
  inputs.dateJoined = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'group-add-date',
  });
  panel.appendChild(inputs.dateJoined);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeJoined')]));
  inputs.timeJoined = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'group-add-time',
  });
  panel.appendChild(inputs.timeJoined);

  // Group picker
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.selectGroup')]));
  const groupPickerEl = el('div', { 'data-testid': 'group-add-picker' });
  renderGroupPickerSimple(groupPickerEl, groups, selection);
  panel.appendChild(groupPickerEl);

  // Head count
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.headCount')]));
  inputs.headCount = el('input', {
    type: 'number', className: 'auth-input settings-input', value: '',
    'data-testid': 'group-add-head-count',
  });
  panel.appendChild(inputs.headCount);

  // Avg weight
  const wLabel = `${t('event.avgWeight')} (${unitSys === 'imperial' ? 'lbs' : 'kg'})`;
  panel.appendChild(el('label', { className: 'form-label' }, [wLabel]));
  inputs.avgWeight = el('input', {
    type: 'number', className: 'auth-input settings-input', value: '',
    'data-testid': 'group-add-avg-weight',
  });
  panel.appendChild(inputs.avgWeight);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'group-add-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'group-add-save',
      onClick: () => {
        clear(statusEl);
        if (!selection.groupId) {
          statusEl.appendChild(el('span', {}, [t('event.selectGroup')]));
          return;
        }
        const hc = parseInt(inputs.headCount.value, 10);
        let aw = parseFloat(inputs.avgWeight.value);
        if (!hc || hc < 1) {
          statusEl.appendChild(el('span', {}, [t('validation.headCountMin')]));
          return;
        }
        if (!aw || aw <= 0) {
          statusEl.appendChild(el('span', {}, [t('validation.avgWeightRequired')]));
          return;
        }
        if (unitSys === 'imperial') {
          aw = convert(aw, 'weight', 'toMetric');
        }
        try {
          const gw = GroupWindowEntity.create({
            operationId,
            eventId: evt.id,
            groupId: selection.groupId,
            dateJoined: inputs.dateJoined.value,
            timeJoined: inputs.timeJoined.value || null,
            headCount: hc,
            avgWeightKg: aw,
          });
          add('eventGroupWindows', gw, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
          groupAddSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'group-add-cancel',
      onClick: () => groupAddSheet.close(),
    }, [t('action.cancel')]),
  ]));

  groupAddSheet.open();
}

function renderGroupPickerSimple(container, groups, selection) {
  clear(container);
  for (const group of groups) {
    const isSelected = selection.groupId === group.id;
    container.appendChild(el('div', {
      className: `loc-picker-item${isSelected ? ' selected' : ''}`,
      'data-testid': `group-add-item-${group.id}`,
      onClick: () => {
        selection.groupId = group.id;
        renderGroupPickerSimple(container, groups, selection);
      },
    }, [el('span', {}, [group.name])]));
  }
}

// ---------------------------------------------------------------------------
// Group remove sheet (CP-18)
// ---------------------------------------------------------------------------

let groupRemoveSheet = null;

export function openGroupRemoveSheet(groupWindow) {
  if (!groupRemoveSheet) {
    groupRemoveSheet = new Sheet('group-remove-sheet-wrap');
  }

  const panel = document.getElementById('group-remove-sheet-panel');
  if (!panel) return;
  clear(panel);

  const group = getById('groups', groupWindow.groupId);
  const groupName = group ? group.name : '';
  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.removeGroupTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [groupName]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateLeft')]));
  inputs.dateLeft = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'group-remove-date',
  });
  panel.appendChild(inputs.dateLeft);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeLeft')]));
  inputs.timeLeft = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'group-remove-time',
  });
  panel.appendChild(inputs.timeLeft);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'group-remove-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'group-remove-save',
      onClick: () => {
        clear(statusEl);
        try {
          update('eventGroupWindows', groupWindow.id, {
            dateLeft: inputs.dateLeft.value,
            timeLeft: inputs.timeLeft.value || null,
          }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
          groupRemoveSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'group-remove-cancel',
      onClick: () => groupRemoveSheet.close(),
    }, [t('action.cancel')]),
  ]));

  groupRemoveSheet.open();
}
