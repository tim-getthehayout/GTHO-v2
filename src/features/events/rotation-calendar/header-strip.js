/**
 * @file Header strip — CP-54.
 * Left: View toggle (Calendar | List). Right: Mode indicator pill.
 * See V2_DESIGN_SYSTEM.md §4.3.
 */

import { el } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';
import { getCalendarState, setView, getViewMode } from '../calendar-state.js';
import { buildGroupLabel } from './past-block.js';

/**
 * Render the header strip.
 * @param {object} opts
 * @param {Array<{id: string, name: string}>} opts.selectedGroups - Currently selected forecaster groups
 * @param {number|null} opts.period - Selected period in days
 * @param {Function} opts.onUpdate - Called after view toggle to trigger re-render
 * @returns {HTMLElement}
 */
export function renderHeaderStrip({ selectedGroups, period, onUpdate }) {
  const state = getCalendarState();
  const viewMode = getViewMode();

  // View toggle
  const calBtn = el('button', {
    className: `header-strip__toggle${state.view === 'calendar' ? ' header-strip__toggle--active' : ''}`,
    onClick: () => { setView('calendar'); onUpdate(); },
    type: 'button',
    dataset: { testid: 'view-toggle-calendar' },
    'aria-pressed': state.view === 'calendar' ? 'true' : 'false',
  }, ['\uD83D\uDCC5 Calendar']);

  const listBtn = el('button', {
    className: `header-strip__toggle${state.view === 'list' ? ' header-strip__toggle--active' : ''}`,
    onClick: () => { setView('list'); onUpdate(); },
    type: 'button',
    dataset: { testid: 'view-toggle-list' },
    'aria-pressed': state.view === 'list' ? 'true' : 'false',
  }, ['\uD83D\uDCCB List']);

  const viewToggle = el('div', { className: 'header-strip__view-toggle' }, [
    el('span', { className: 'header-strip__view-label' }, ['View:']),
    calBtn,
    listBtn,
  ]);

  // Mode indicator pill
  let modeText;
  let modeClass = 'header-strip__mode';

  if (viewMode === 'forecast') {
    const groupLabel = buildGroupLabel(selectedGroups);
    const periodLabel = period != null ? `${period} day${period !== 1 ? 's' : ''}` : '';
    modeText = `DM Forecast View \u00B7 ${groupLabel.text} \u00B7 ${periodLabel}`;
    modeClass += ' header-strip__mode--forecast';
  } else {
    modeText = 'Estimated Status View';
    modeClass += ' header-strip__mode--estimated';
  }

  const modePill = el('span', {
    className: modeClass,
    dataset: { testid: 'mode-indicator' },
  }, [modeText]);

  return el('div', { className: 'header-strip', dataset: { testid: 'calendar-header-strip' } }, [
    viewToggle,
    modePill,
  ]);
}
