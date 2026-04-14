/**
 * @file Today line — CP-54.
 * Vertical line piercing the full grid height with a date pill at the top axis.
 * See V2_DESIGN_SYSTEM.md §4.3.
 */

import { el } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';

/**
 * Render the Today line element positioned at a given left offset.
 * @param {number} leftPx - Pixel offset from the timeline origin
 * @returns {HTMLElement}
 */
export function renderTodayLine(leftPx) {
  const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const pill = el('span', { className: 'today-pill' }, [todayStr]);

  return el('div', {
    className: 'today-line',
    style: { left: `${leftPx}px` },
    'aria-hidden': 'true',
    dataset: { testid: 'today-line' },
  }, [pill]);
}
