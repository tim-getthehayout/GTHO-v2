/**
 * @file Legend strip — CP-54.
 * Two groups: Past (always shown) and Future (conditional on view mode).
 * See V2_DESIGN_SYSTEM.md §4.3.
 */

import { el } from '../../../ui/dom.js';

/**
 * Render a single legend swatch + label.
 * @param {string} className - CSS class for the swatch color
 * @param {string} label
 * @returns {HTMLElement}
 */
function swatch(className, label) {
  return el('div', { className: 'legend__item' }, [
    el('span', { className: `legend__swatch ${className}` }),
    el('span', { className: 'legend__label' }, [label]),
  ]);
}

/**
 * Render the legend strip.
 * @param {'estimated' | 'forecast'} viewMode
 * @returns {HTMLElement}
 */
export function renderLegend(viewMode) {
  // Past group — always shown
  const pastItems = [
    swatch('legend__swatch--pasture', 'Pasture grazing'),
    swatch('legend__swatch--submove', 'Sub-move'),
    swatch('legend__swatch--hay', 'Hay / stored feed'),
    swatch('legend__swatch--active', 'Active now'),
    swatch('legend__swatch--linked', 'Linked paddocks'),
    swatch('legend__swatch--strip', 'Strip-grazed'),
  ];

  // Future group — conditional on view mode
  const futureItems = viewMode === 'forecast'
    ? [
        swatch('legend__swatch--capacity', 'Capacity split'),
        swatch('legend__swatch--surplus', 'Surplus'),
        swatch('legend__swatch--nodata', 'No data'),
      ]
    : [
        swatch('legend__swatch--dm-gradient', 'DM recovery gradient'),
        swatch('legend__swatch--nodata', 'No data / survey needed'),
      ];

  return el('div', { className: 'legend', dataset: { testid: 'calendar-legend' } }, [
    el('div', { className: 'legend__group' }, pastItems),
    el('div', { className: 'legend__divider' }),
    el('div', { className: 'legend__group' }, futureItems),
  ]);
}
