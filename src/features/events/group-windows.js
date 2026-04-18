/** @file Group add/remove sheets — CP-18. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, closeGroupWindow } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display } from '../../utils/units.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';

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
    onChange: () => updateLivePreview(),
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
  renderGroupPickerSimple(groupPickerEl, groups, selection, () => updateLivePreview());
  panel.appendChild(groupPickerEl);

  // OI-0094 entry #6: live system-generated head count + avg weight, view-only.
  const livePreview = {
    head: 0, avgKg: 0,
    headLabel: el('div', { className: 'form-static-value', 'data-testid': 'group-add-head-count-live' }, ['—']),
    weightLabel: el('div', { className: 'form-static-value', 'data-testid': 'group-add-avg-weight-live' }, ['—']),
  };

  function updateLivePreview() {
    if (!selection.groupId) {
      livePreview.head = 0;
      livePreview.avgKg = 0;
      livePreview.headLabel.textContent = '—';
      livePreview.weightLabel.textContent = '—';
      return;
    }
    const dateJoined = inputs.dateJoined.value || todayStr;
    const stub = { groupId: selection.groupId, dateLeft: null, headCount: 0, avgWeightKg: 0 };
    const memberships = getAll('animalGroupMemberships');
    const animals = getAll('animals');
    const animalWeightRecords = getAll('animalWeightRecords');
    livePreview.head = getLiveWindowHeadCount(stub, { memberships, now: dateJoined });
    livePreview.avgKg = getLiveWindowAvgWeight(stub, { memberships, animals, animalWeightRecords, now: dateJoined });
    livePreview.headLabel.textContent = String(livePreview.head);
    livePreview.weightLabel.textContent = livePreview.avgKg > 0
      ? display(livePreview.avgKg, 'weight', unitSys, 0)
      : '—';
  }

  panel.appendChild(el('label', { className: 'form-label' }, [t('event.headCount')]));
  panel.appendChild(livePreview.headLabel);

  panel.appendChild(el('label', { className: 'form-label' }, [t('event.avgWeight')]));
  panel.appendChild(livePreview.weightLabel);

  panel.appendChild(el('div', { className: 'form-hint', style: { fontSize: '11px', color: 'var(--text2)', marginBottom: 'var(--space-3)' } }, [
    t('event.systemGeneratedCaption'),
  ]));

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
        if (!livePreview.head || livePreview.head < 1) {
          statusEl.appendChild(el('span', {}, [t('validation.headCountMin')]));
          return;
        }
        if (!livePreview.avgKg || livePreview.avgKg <= 0) {
          statusEl.appendChild(el('span', {}, [t('validation.avgWeightRequired')]));
          return;
        }
        try {
          const gw = GroupWindowEntity.create({
            operationId,
            eventId: evt.id,
            groupId: selection.groupId,
            dateJoined: inputs.dateJoined.value,
            timeJoined: inputs.timeJoined.value || null,
            headCount: livePreview.head,
            avgWeightKg: livePreview.avgKg,
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

function renderGroupPickerSimple(container, groups, selection, onChange) {
  clear(container);
  for (const group of groups) {
    const isSelected = selection.groupId === group.id;
    container.appendChild(el('div', {
      className: `loc-picker-item${isSelected ? ' selected' : ''}`,
      'data-testid': `group-add-item-${group.id}`,
      onClick: () => {
        selection.groupId = group.id;
        renderGroupPickerSimple(container, groups, selection, onChange);
        if (onChange) onChange();
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
          // OI-0094 entry #7: route through closeGroupWindow so live values are stamped.
          closeGroupWindow(
            groupWindow.groupId,
            groupWindow.eventId,
            inputs.dateLeft.value,
            inputs.timeLeft.value || null,
          );
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
