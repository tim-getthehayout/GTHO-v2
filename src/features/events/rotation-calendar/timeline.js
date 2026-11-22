/**
 * @file Timeline — CP-54 + OI-0254.
 * Scrollable timeline: canvas extent (Sc1), tick hierarchy (Tk1), positioning.
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.9.
 */

import { el } from '../../../ui/dom.js';
import { renderTodayLine } from './today-line.js';

// ── Zoom → pixels-per-day mapping ────────────────────────────────
const ZOOM_PX_PER_DAY = {
  day: 120,
  week: 40,
  month: 12,
  last90: 8,
};

/** Default span (days) used only when no event / ready-by data exists. */
const ZOOM_SPAN_DAYS = {
  day: 3,
  week: 14,
  month: 60,
  last90: 90,
};

export function zoomPxPerDay(zoom) {
  return ZOOM_PX_PER_DAY[zoom] || ZOOM_PX_PER_DAY.week;
}

export function defaultSpanDays(zoom) {
  return ZOOM_SPAN_DAYS[zoom] || ZOOM_SPAN_DAYS.week;
}

/**
 * Resolve the visible date range from anchor + zoom.
 * Kept for zoom→pxPerDay tests and callers that still want a short centered window.
 * OI-0254 Rotation calendar uses {@link resolveCanvasRange} (Sc1) instead.
 * @param {string} anchor - 'today' | 'last30' | 'thisYear' | ISO date
 * @param {string} zoom - 'day' | 'week' | 'month' | 'last90'
 * @returns {{ start: Date, end: Date, pxPerDay: number }}
 */
export function resolveRange(anchor, zoom) {
  const pxPerDay = zoomPxPerDay(zoom);
  const now = startOfLocalDay(new Date());

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

  spanDays = defaultSpanDays(zoom);

  const start = new Date(center);
  start.setDate(start.getDate() - Math.floor(spanDays / 2));
  const end = new Date(center);
  end.setDate(end.getDate() + Math.ceil(spanDays / 2));

  return { start, end, pxPerDay };
}

/**
 * Parse YYYY-MM-DD or Date into a local midnight Date, or null.
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseTimelineDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfLocalDay(value);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function startOfLocalDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * OI-0254 Sc1 — canvas spans all past events on the left and out to the
 * last ready-by (close-event recovery windowCloses) on the right.
 * Zoom only controls pxPerDay (and the empty-data fallback span).
 *
 * @param {object} opts
 * @param {string} [opts.zoom]
 * @param {string|Date} [opts.today]
 * @param {Array<string|Date>} [opts.eventStarts] - event / window start dates
 * @param {Array<string|Date>} [opts.readyByDates] - per-paddock windowCloses
 * @returns {{ start: Date, end: Date, pxPerDay: number }}
 */
export function resolveCanvasRange({
  zoom = 'week',
  today = new Date(),
  eventStarts = [],
  readyByDates = [],
} = {}) {
  const pxPerDay = zoomPxPerDay(zoom);
  const now = parseTimelineDay(today) || startOfLocalDay(new Date());
  const span = defaultSpanDays(zoom);

  const starts = (eventStarts || []).map(parseTimelineDay).filter(Boolean);
  const ends = (readyByDates || []).map(parseTimelineDay).filter(Boolean);

  let start = starts.length
    ? new Date(Math.min(...starts.map(d => d.getTime())))
    : null;
  let end = ends.length
    ? new Date(Math.max(...ends.map(d => d.getTime())))
    : null;

  if (!start) {
    start = new Date(now);
    start.setDate(start.getDate() - Math.floor(span / 2));
  }
  if (!end) {
    end = new Date(now);
    end.setDate(end.getDate() + Math.ceil(span / 2));
  }

  // Always include today so the Today line sits on the canvas.
  if (start.getTime() > now.getTime()) start = new Date(now);
  if (end.getTime() < now.getTime()) end = new Date(now);

  if (end.getTime() <= start.getTime()) {
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  }

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
 * OI-0254 Tk1 — day ticks: large = month start, medium = Saturday, small = other.
 * @param {Date} start
 * @param {Date} end
 * @returns {Array<{ date: Date, kind: 'month'|'saturday'|'day', iso: string }>}
 */
export function enumerateTicks(start, end) {
  const ticks = [];
  const cursor = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  while (cursor.getTime() <= last.getTime()) {
    const iso = toIso(cursor);
    let kind = 'day';
    if (cursor.getDate() === 1) kind = 'month';
    else if (cursor.getDay() === 6) kind = 'saturday';
    ticks.push({ date: new Date(cursor), kind, iso });
    cursor.setDate(cursor.getDate() + 1);
  }
  return ticks;
}

function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build axis labels (top or bottom) for the visible range (legacy short-canvas).
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
  const now = startOfLocalDay(new Date());
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
