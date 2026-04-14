/**
 * @file Future forecast block — CP-54.
 * Right-of-Today blocks: DM gradient (Estimated Status) or capacity split (DM Forecast).
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.3.
 */

import { el } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';

/**
 * Format surplus hours as "Xd Yh".
 * @param {number} hours
 * @returns {string}
 */
function formatSurplus(hours) {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (d > 0 && h > 0) return `+ ${d}d ${h}h`;
  if (d > 0) return `+ ${d}d`;
  return `+ ${h}h`;
}

/**
 * Format covers hours as "Covers Xd Yh".
 * @param {number} hours
 * @returns {string}
 */
function formatCovers(hours) {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (d > 0 && h > 0) return `Covers ${d}d ${h}h`;
  if (d > 0) return `Covers ${d}d`;
  return `Covers ${h}h`;
}

/**
 * Render a future block in Estimated Status view mode.
 * Ambient DM gradient from --green-wash to --green-base.
 * @param {object} opts
 * @param {number} opts.leftPx
 * @param {number} opts.widthPx
 * @param {string} opts.minDate - Earliest return date
 * @param {string} opts.maxDate - Window closes date
 * @param {string} opts.confidence - 'min' | 'mid' | 'max' | 'past_max'
 * @param {boolean} opts.isNeverGrazed
 * @param {boolean} opts.isGrazingInProgress
 * @param {string} [opts.hayEstimateLbs] - For never-grazed paddocks
 * @param {string} opts.locationId
 * @param {Function} opts.onClickBlock
 * @returns {HTMLElement}
 */
export function renderEstimatedFutureBlock({
  leftPx, widthPx, minDate, maxDate, confidence,
  isNeverGrazed, isGrazingInProgress, hayEstimateLbs,
  locationId, onClickBlock,
}) {
  if (isGrazingInProgress) {
    return el('div', {
      className: 'future-block future-block--in-progress',
      style: { left: `${leftPx}px`, width: `${widthPx}px` },
      dataset: { testid: 'future-block-in-progress', locationId },
    }, [
      el('span', { className: 'future-block__dashed-label' }, [
        'Grazing in progress \u2014 forecast available after close',
      ]),
    ]);
  }

  if (isNeverGrazed) {
    return el('div', {
      className: 'future-block future-block--never-grazed',
      style: { left: `${leftPx}px`, width: `${widthPx}px` },
      dataset: { testid: 'future-block-never-grazed', locationId },
      onClick: () => onClickBlock(locationId, 'survey'),
      tabindex: '0',
      role: 'button',
      'aria-label': `Never grazed, estimated ${hayEstimateLbs || '?'} lbs hay needed`,
    }, [
      el('span', {}, [`Est. ${hayEstimateLbs || '?'} lbs hay needed \u2014 survey to confirm`]),
    ]);
  }

  // Recovery gradient block
  const blockClasses = ['future-block', `future-block--${confidence}`];

  const children = [];
  // Min/max date tick marks
  children.push(el('span', { className: 'future-block__tick future-block__tick--min' }, [minDate]));
  children.push(el('span', { className: 'future-block__tick future-block__tick--max' }, [maxDate]));

  return el('div', {
    className: blockClasses.join(' '),
    style: { left: `${leftPx}px`, width: `${widthPx}px` },
    dataset: { testid: 'future-block', locationId },
    onClick: () => onClickBlock(locationId, 'detail'),
    tabindex: '0',
    role: 'button',
    'aria-label': `Recovery forecast, ${minDate} to ${maxDate}`,
  }, children);
}

/**
 * Render a future block in DM Forecast view mode.
 * Capacity split: green segment + tan segment (or full green with surplus chip).
 * @param {object} opts
 * @param {number} opts.leftPx
 * @param {number} opts.widthPx
 * @param {number} opts.coverageFraction - 0 to 1
 * @param {number} opts.coversHours
 * @param {number} opts.shortfallLbsHay
 * @param {number} opts.surplusHours
 * @param {boolean} opts.isNeverGrazed
 * @param {boolean} opts.isGrazingInProgress
 * @param {string} [opts.hayEstimateLbs]
 * @param {string} opts.locationId
 * @param {Function} opts.onClickBlock
 * @returns {HTMLElement}
 */
export function renderForecastFutureBlock({
  leftPx, widthPx, coverageFraction, coversHours, shortfallLbsHay, surplusHours,
  isNeverGrazed, isGrazingInProgress, hayEstimateLbs,
  locationId, onClickBlock,
}) {
  if (isGrazingInProgress) {
    return renderEstimatedFutureBlock({
      leftPx, widthPx, isGrazingInProgress: true,
      locationId, onClickBlock,
      minDate: '', maxDate: '', confidence: 'min', isNeverGrazed: false,
    });
  }

  if (isNeverGrazed) {
    return renderEstimatedFutureBlock({
      leftPx, widthPx, isNeverGrazed: true,
      hayEstimateLbs, locationId, onClickBlock,
      minDate: '', maxDate: '', confidence: 'min', isGrazingInProgress: false,
    });
  }

  const greenPct = Math.round(coverageFraction * 100);
  const tanPct = 100 - greenPct;

  const children = [];

  // Green segment
  if (greenPct > 0) {
    children.push(el('div', {
      className: 'future-block__segment future-block__segment--green',
      style: { width: `${greenPct}%` },
    }, [
      el('span', { className: 'future-block__segment-label' }, [formatCovers(coversHours)]),
    ]));
  }

  // Tan segment (shortfall)
  if (tanPct > 0) {
    children.push(el('div', {
      className: 'future-block__segment future-block__segment--tan',
      style: { width: `${tanPct}%` },
    }, [
      el('span', { className: 'future-block__segment-label' }, [
        `${Math.round(shortfallLbsHay)} lbs hay`,
      ]),
    ]));
  }

  // Surplus chip (full green)
  if (coverageFraction >= 1 && surplusHours > 0) {
    children.push(el('span', { className: 'future-block__surplus-chip' }, [formatSurplus(surplusHours)]));
  }

  return el('div', {
    className: 'future-block future-block--forecast',
    style: { left: `${leftPx}px`, width: `${widthPx}px` },
    dataset: { testid: 'future-block-forecast', locationId },
    onClick: () => onClickBlock(locationId, 'detail'),
    tabindex: '0',
    role: 'button',
    'aria-label': `Capacity ${greenPct}% covered`,
  }, children);
}
