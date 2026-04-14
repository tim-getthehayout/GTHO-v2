/**
 * @file Toolbar — CP-54.
 * Timeline Selection lightbox, Dry Matter Forecaster lightbox, Show Confinement pill.
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.4.
 */

import { el, clear } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';
import {
  getCalendarState, setZoom, setJump, addForecasterGroup,
  removeForecasterGroup, clearForecasterGroups, setPeriod, toggleConfinement,
} from '../calendar-state.js';
import { getAll } from '../../../data/store.js';

/**
 * Render a pill button.
 * @param {string} label
 * @param {boolean} isActive
 * @param {Function} onClick
 * @returns {HTMLElement}
 */
function pill(label, isActive, onClick) {
  return el('button', {
    className: `toolbar__pill${isActive ? ' toolbar__pill--active' : ''}`,
    onClick,
    type: 'button',
  }, [label]);
}

/**
 * Render the Timeline Selection lightbox content.
 * @param {Function} onUpdate - Called after any state change to trigger re-render
 * @returns {HTMLElement}
 */
function renderTimelineSelection(onUpdate) {
  const state = getCalendarState();

  const zoomRow = el('div', { className: 'toolbar__row' }, [
    el('span', { className: 'toolbar__row-label' }, ['Zoom']),
    ...['day', 'week', 'month', 'last90'].map(z =>
      pill(z === 'last90' ? 'Last 90 days' : z.charAt(0).toUpperCase() + z.slice(1),
        state.zoom === z,
        () => { setZoom(z); onUpdate(); }
      )
    ),
  ]);

  const jumpRow = el('div', { className: 'toolbar__row' }, [
    el('span', { className: 'toolbar__row-label' }, ['Jump']),
    pill('Today', state.anchor === 'today', () => { setJump('today'); onUpdate(); }),
    pill('Last 30d', state.anchor === 'last30', () => { setJump('last30'); onUpdate(); }),
    pill('This year', state.anchor === 'thisYear', () => { setJump('thisYear'); onUpdate(); }),
    renderPickDateButton(onUpdate),
  ]);

  return el('div', {
    className: 'toolbar__lightbox',
    dataset: { testid: 'toolbar-timeline-selection' },
  }, [
    el('div', { className: 'toolbar__lightbox-title' }, ['Timeline Selection']),
    zoomRow,
    jumpRow,
  ]);
}

/**
 * Render a "Pick date…" button that expands to a date input.
 * @param {Function} onUpdate
 * @returns {HTMLElement}
 */
function renderPickDateButton(onUpdate) {
  const state = getCalendarState();
  const isCustomDate = typeof state.anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.anchor);

  const input = el('input', {
    type: 'date',
    className: 'toolbar__date-input',
    value: isCustomDate ? state.anchor : '',
    onChange: (e) => { setJump(e.target.value); onUpdate(); },
    'aria-label': 'Pick a date to jump to',
  });

  return el('span', { className: 'toolbar__pick-date' }, [
    pill('Pick date\u2026', isCustomDate, () => input.showPicker?.()),
    input,
  ]);
}

/**
 * Render the Dry Matter Forecaster lightbox content.
 * @param {Function} onUpdate
 * @returns {HTMLElement}
 */
function renderForecaster(onUpdate) {
  const state = getCalendarState();
  const allGroups = getAll('groups');

  // Groups row: selected chips + add button
  const groupChips = state.groups.map(gId => {
    const group = allGroups.find(g => g.id === gId);
    const name = group ? group.name : gId;
    return el('span', { className: 'toolbar__chip' }, [
      name,
      el('button', {
        className: 'toolbar__chip-remove',
        onClick: () => { removeForecasterGroup(gId); onUpdate(); },
        type: 'button',
        'aria-label': `Remove ${name}`,
      }, ['\u00D7']),
    ]);
  });

  // Add group button (simple select for now)
  const availableGroups = allGroups.filter(g => !state.groups.includes(g.id));
  const addBtn = availableGroups.length > 0
    ? el('select', {
        className: 'toolbar__add-group',
        onChange: (e) => {
          if (e.target.value) {
            addForecasterGroup(e.target.value);
            e.target.value = '';
            onUpdate();
          }
        },
        'aria-label': 'Add group to forecaster',
      }, [
        el('option', { value: '' }, ['\uFF0B Add']),
        ...availableGroups.map(g => el('option', { value: g.id }, [g.name])),
      ])
    : null;

  const clearBtn = state.groups.length > 0
    ? el('button', {
        className: 'toolbar__clear-btn',
        onClick: () => { clearForecasterGroups(); onUpdate(); },
        type: 'button',
      }, ['Clear'])
    : null;

  const groupsRow = el('div', { className: 'toolbar__row' }, [
    el('span', { className: 'toolbar__row-label' }, ['Groups']),
    ...groupChips,
    addBtn,
    clearBtn,
  ].filter(Boolean));

  // Period row
  const periodRow = el('div', { className: 'toolbar__row' }, [
    el('span', { className: 'toolbar__row-label' }, ['Period']),
    pill('1 day', state.period === 1, () => { setPeriod(1); onUpdate(); }),
    pill('3 days', state.period === 3, () => { setPeriod(3); onUpdate(); }),
    renderCustomPeriodInput(onUpdate),
  ]);

  return el('div', {
    className: 'toolbar__lightbox',
    dataset: { testid: 'toolbar-forecaster' },
  }, [
    el('div', { className: 'toolbar__lightbox-title' }, ['Dry Matter Forecaster']),
    groupsRow,
    periodRow,
  ]);
}

/**
 * Render a "Custom…" period input.
 * @param {Function} onUpdate
 * @returns {HTMLElement}
 */
function renderCustomPeriodInput(onUpdate) {
  const state = getCalendarState();
  const isCustom = state.period != null && state.period !== 1 && state.period !== 3;

  const input = el('input', {
    type: 'number',
    className: 'toolbar__period-input',
    min: '1',
    max: '365',
    value: isCustom ? String(state.period) : '',
    placeholder: 'days',
    onChange: (e) => { setPeriod(e.target.value); onUpdate(); },
    'aria-label': 'Custom period in days',
  });

  return el('span', { className: 'toolbar__custom-period' }, [
    el('span', { className: 'toolbar__custom-label' }, ['Custom\u2026']),
    input,
  ]);
}

/**
 * Render the full toolbar.
 * @param {Function} onUpdate - Called after any state change to trigger calendar re-render
 * @returns {HTMLElement}
 */
export function renderToolbar(onUpdate) {
  const state = getCalendarState();

  const confinementPill = el('button', {
    className: `toolbar__confinement${state.showConfinement ? ' toolbar__confinement--on' : ''}`,
    onClick: () => { toggleConfinement(); onUpdate(); },
    type: 'button',
    dataset: { testid: 'toolbar-confinement-pill' },
    'aria-pressed': state.showConfinement ? 'true' : 'false',
    'aria-label': 'Show Confinement Locations',
  }, [
    `Show Confinement Locations${state.showConfinement ? ' ✓' : ''}`,
  ]);

  return el('div', { className: 'toolbar', dataset: { testid: 'calendar-toolbar' } }, [
    renderTimelineSelection(onUpdate),
    renderForecaster(onUpdate),
    confinementPill,
  ]);
}
