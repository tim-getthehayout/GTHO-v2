/**
 * @file Sidebar — CP-54.
 * Right-hand column (260px fixed) mirroring the paddock column 1:1.
 * Each row: AUDS, pasture %, NPK triplet, event-count note.
 * Footer: totals + average feed cost.
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.5.
 */

import { el } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';
import { display } from '../../../utils/units.js';

/**
 * Render the sidebar.
 * @param {object} opts
 * @param {Array<object>} opts.paddockSummaries - One per visible paddock, aligned with paddock column
 * @param {object} opts.totals - Aggregated totals for the visible range
 * @param {string} opts.dateRangeLabel - e.g. "Apr 1 – Apr 14"
 * @param {string} opts.unitSystem
 * @param {Function} opts.onRowClick - Called with locationId when a sidebar row is clicked
 * @returns {HTMLElement}
 */
export function renderSidebar({ paddockSummaries, totals, dateRangeLabel, unitSystem, onRowClick }) {
  // Header
  const header = el('div', { className: 'sidebar__header' }, [
    el('span', { className: 'sidebar__title' }, ['Summary']),
    el('span', { className: 'sidebar__range' }, [dateRangeLabel]),
  ]);

  // Paddock rows
  const rows = paddockSummaries.map(summary => {
    const neverGrazed = summary.isNeverGrazed;

    const children = neverGrazed
      ? [el('span', { className: 'sidebar__empty' }, ['No activity \u00B7 survey needed'])]
      : [
          el('div', { className: 'sidebar__metric' }, [
            el('span', { className: 'sidebar__label' }, ['AUDS']),
            el('span', { className: 'sidebar__value' }, [String(Math.round(summary.auds))]),
          ]),
          el('div', { className: 'sidebar__metric' }, [
            el('span', { className: 'sidebar__label' }, ['Pasture']),
            el('span', { className: 'sidebar__value' }, [`${Math.round(summary.pasturePct)}%`]),
          ]),
          el('div', { className: 'sidebar__metric' }, [
            el('span', { className: 'sidebar__label' }, ['NPK']),
            el('span', { className: 'sidebar__value' }, [
              `${Math.round(summary.nKg)}/${Math.round(summary.pKg)}/${Math.round(summary.kKg)}`,
            ]),
          ]),
          el('div', { className: 'sidebar__event-count' }, [
            `${summary.eventCount} event${summary.eventCount !== 1 ? 's' : ''}`,
          ]),
        ];

    return el('div', {
      className: 'sidebar__row',
      dataset: { testid: 'sidebar-row', locationId: summary.locationId },
      onClick: () => onRowClick(summary.locationId),
      tabindex: '0',
      role: 'button',
      'aria-label': neverGrazed
        ? `${summary.locationName}: no activity, survey needed`
        : `${summary.locationName}: ${Math.round(summary.auds)} AUDS, ${Math.round(summary.pasturePct)}% pasture`,
    }, children);
  });

  // Totals footer
  const footer = el('div', { className: 'sidebar__footer', dataset: { testid: 'sidebar-footer' } }, [
    el('div', { className: 'sidebar__metric' }, [
      el('span', { className: 'sidebar__label' }, ['Total AUDS']),
      el('span', { className: 'sidebar__value' }, [String(Math.round(totals.auds))]),
    ]),
    el('div', { className: 'sidebar__metric' }, [
      el('span', { className: 'sidebar__label' }, ['Avg Feed Cost']),
      el('span', { className: 'sidebar__value' }, [
        `$${totals.avgFeedCost != null ? totals.avgFeedCost.toFixed(2) : '0.00'}/day`,
      ]),
    ]),
  ]);

  return el('div', { className: 'sidebar', dataset: { testid: 'sidebar' } }, [
    header,
    el('div', { className: 'sidebar__rows' }, rows),
    footer,
  ]);
}
