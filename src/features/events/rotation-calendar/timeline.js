/**
 * @file Timeline — CP-54.
 * Scrollable timeline area: top/bottom axes, Today line, block positioning engine.
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.9.
 */

import { el, clear } from '../../../ui/dom.js';
import { renderTodayLine } from './today-line.js';

// ── Zoom → pixels-per-day mapping ────────────────────────────────
const ZOOM_PX_PER_DAY = {
  day: 120,
  week: 40,
  month: 12,
  last90: 8,
};

/**
 * Resolve the visible date range from anchor + zoom.
 * @param {string} anchor - 'today' | 'last30' | 'thisYear' | ISO date
 * @param {string} zoom - 'day' | 'week' | 'month' | 'last90'
 * @returns {{ start: Date, end: Date, pxPerDay: number }}
 */
export function resolveRange(anchor, zoom) {
  const pxPerDay = ZOOM_PX_PER_DAY[zoom] || ZOOM_PX_PER_DAY.week;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let center = new Date(now);
  let spanDays;

  switch (anchor) {
    case 'today':
      center = new Date(now);
      break;
    case 'last30':
      center = new Date(now);
      center.setDate(center.getDate() - 15);
      break;
    case 'thisYear':
      center = new Date(now.getFullYear(), 6, 1); // mid-year
      break;
    default:
      if (/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
        center = new Date(anchor + 'T00:00:00');
      }
  }

  switch (zoom) {
    case 'day': spanDays = 3; break;
    case 'week': spanDays = 14; break;
    case 'month': spanDays = 60; break;
    case 'last90': spanDays = 90; break;
    default: spanDays = 14;
  }

  const start = new Date(center);
  start.setDate(start.getDate() - Math.floor(spanDays / 2));
  const end = new Date(center);
  end.setDate(end.getDate() + Math.ceil(spanDays / 2));

  return { start, end, pxPerDay };
}

/**
 * Convert a date to a pixel offset from the timeline start.
 * @param {Date} date
 * @param {Date} rangeStart
 * @param {number} pxPerDay
 * @returns {number}
 */
export function dateToPx(date, rangeStart, pxPerDay) {
  const ms = date.getTime() - rangeStart.getTime();
  return (ms / 86400000) * pxPerDay;
}

/**
 * Build axis labels (top or bottom) for the visible range.
 * @param {Date} start
 * @param {Date} end
 * @param {string} zoom
 * @param {number} pxPerDay
 * @returns {HTMLElement}
 */
function buildAxis(start, end, zoom, pxPerDay) {
  const labels = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const leftPx = dateToPx(cursor, start, pxPerDay);
    let label;

    if (zoom === 'day') {
      label = cursor.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      cursor.setDate(cursor.getDate() + 1);
    } else if (zoom === 'week') {
      label = cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      cursor.setDate(cursor.getDate() + 7);
    } else if (zoom === 'month') {
      label = cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      label = cursor.toLocaleDateString(undefined, { month: 'short' });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    labels.push(el('span', {
      className: 'timeline-axis__label',
      style: { left: `${leftPx}px` },
    }, [label]));
  }

  return el('div', { className: 'timeline-axis' }, labels);
}

/**
 * Render the timeline container with axes, Today line, and block positioning info.
 * @param {object} opts
 * @param {string} opts.anchor
 * @param {string} opts.zoom
 * @returns {{ container: HTMLElement, range: { start: Date, end: Date, pxPerDay: number } }}
 */
export function renderTimeline({ anchor, zoom }) {
  const range = resolveRange(anchor, zoom);
  const { start, end, pxPerDay } = range;

  const totalWidth = dateToPx(end, start, pxPerDay);

  const topAxis = buildAxis(start, end, zoom, pxPerDay);
  topAxis.classList.add('timeline-axis--top');

  const bottomAxis = buildAxis(start, end, zoom, pxPerDay);
  bottomAxis.classList.add('timeline-axis--bottom');

  // Today line
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayPx = dateToPx(now, start, pxPerDay);
  const todayLine = renderTodayLine(todayPx);

  // Block area (rows will be appended here by calendar-grid)
  const blockArea = el('div', {
    className: 'timeline__block-area',
    style: { width: `${totalWidth}px` },
    dataset: { testid: 'timeline-block-area' },
  });

  const scrollContainer = el('div', {
    className: 'timeline__scroll',
    dataset: { testid: 'timeline-scroll' },
  }, [
    el('div', {
      className: 'timeline__inner',
      style: { width: `${totalWidth}px`, position: 'relative' },
    }, [topAxis, blockArea, bottomAxis, todayLine]),
  ]);

  // Scroll to center Today in view
  requestAnimationFrame(() => {
    const viewWidth = scrollContainer.clientWidth;
    scrollContainer.scrollLeft = Math.max(0, todayPx - viewWidth / 2);
  });

  return { container: scrollContainer, range, blockArea };
}
