/**
 * @file #451 D2 (Design comment 1710) — the read-only "Winter history" row at the
 * top of Calendar and List, and the totals-strip note. Display only: the figures
 * come from winter-history-metrics.js (the same history share the strip adds).
 * Not a location: no paddock, no edit, no move, no event-detail sheet; the archive
 * toggle and location filters do not hide it. Shown only when the period overlaps
 * history.
 */
import { el } from '../../../ui/dom.js';
import { formatMeasure } from '../../../utils/units.js';
import { formatShortDate } from '../../../utils/date-format.js';
import { dateToPx } from './timeline.js';
import { renderTodayLine } from './today-line.js';
import { TIMELINE_CLASS } from './scroll-owner.js';

export const WINTER_HISTORY_LABEL = 'Winter history';
export const WINTER_HISTORY_STRIP_NOTE = 'includes winter history (no paddocks)';

const kg = (v, unitSystem) => formatMeasure(v, 'weight', { unitSystem });
const range = (a, b) => (a === b ? formatShortDate(a) : `${formatShortDate(a)} – ${formatShortDate(b)}`);

/** True when the period's history slice has any day (need or hay). */
export function historyOverlaps(slice) {
  return !!slice && !!slice.firstDate && (slice.needKg > 0 || slice.hayKg > 0);
}

/** Hover text for the strip note: the history dates and numbers in the period. */
export function winterHistoryStripHover(slice, { unitSystem } = {}) {
  if (!historyOverlaps(slice)) return '';
  return `Winter history ${range(slice.firstDate, slice.lastDate)} (no paddocks): `
    + `need ${kg(slice.needKg, unitSystem)} DM, stored feed ${kg(slice.hayKg, unitSystem)} DM, `
    + `pasture ${kg(slice.pastureKg, unitSystem)} DM`
    + (slice.hayOverNeedKg > 0 ? `, hay over need ${kg(slice.hayOverNeedKg, unitSystem)} (not netted)` : '');
}

/** The strip note element (null when the period does not overlap history). */
export function renderWinterHistoryStripNote(slice, { unitSystem } = {}) {
  if (!historyOverlaps(slice)) return null;
  return el('span', {
    className: 'loc-mgmt__period-totals-note',
    title: winterHistoryStripHover(slice, { unitSystem }),
    dataset: { testid: 'loc-mgmt-period-totals-winter-note' },
  }, [WINTER_HISTORY_STRIP_NOTE]);
}

/** Hover lines for one block (dates, head, avg weight, DMI %, need/day, species hay + pasture). */
export function winterHistoryBlockHoverLines(block, { unitSystem } = {}) {
  return [
    `${block.label} · ${range(block.start, block.end)} (${block.days} d)`,
    `${block.headCount} hd · avg ${kg(block.avgWeightKg, unitSystem)} · DMI ${Number(block.dmiPct).toFixed(2).replace(/\.?0+$/, '')}%`,
    `Need ${kg(block.needKgPerDay, unitSystem)} DM/day`,
    `${block.species} winter hay (spread): ${kg(block.speciesHayKg, unitSystem)} DM · pasture ${kg(block.speciesPastureKg, unitSystem)} DM`,
  ];
}

function figuresCell(slice, { unitSystem }) {
  const fig = (key, label, value) => el('div', {
    className: 'loc-mgmt__metric',
    dataset: { testid: `winter-history-${key}` },
  }, [
    el('span', { className: 'loc-mgmt__metric-label' }, [label]),
    el('span', { className: 'loc-mgmt__metric-value' }, [kg(value, unitSystem)]),
  ]);
  return el('div', {
    className: 'loc-mgmt__metrics loc-mgmt__metrics--winter-history',
    dataset: { testid: 'winter-history-figures' },
  }, [
    fig('need', 'Need', slice.needKg),
    fig('stored', 'Stored feed', slice.hayKg),
    fig('pasture', 'Pasture', slice.pastureKg),
  ]);
}

function renderBlock(block, { range: canvas, unitSystem }) {
  const start = new Date(`${block.start}T00:00:00`);
  const endExcl = new Date(`${block.end}T00:00:00`);
  endExcl.setDate(endExcl.getDate() + 1);
  if (endExcl <= canvas.start || start > canvas.end) return null;
  const leftPx = Math.max(0, dateToPx(start < canvas.start ? canvas.start : start, canvas.start, canvas.pxPerDay));
  const rightPx = dateToPx(endExcl > canvas.end ? canvas.end : endExcl, canvas.start, canvas.pxPerDay);
  const lines = winterHistoryBlockHoverLines(block, { unitSystem });
  const tip = el('div', { className: 'winter-history-block__tip', hidden: true, dataset: { testid: 'winter-history-block-tip' } },
    lines.map(l => el('div', {}, [l])));
  const node = el('div', {
    className: 'past-block winter-history-block',
    role: 'note',
    tabindex: '0',
    title: lines.join('\n'),
    style: { left: `${leftPx}px`, width: `${Math.max(4, rightPx - leftPx)}px` },
    dataset: { testid: 'winter-history-block', basisId: block.basisId, start: block.start, end: block.end },
  }, [
    el('div', { className: 'winter-history-block__label' }, [block.label]),
    el('div', { className: 'winter-history-block__head' }, [`${block.headCount} hd`]),
    tip,
  ]);
  // A tap shows the hover content only (no navigation, no sheet).
  node.addEventListener('click', (e) => { e.stopPropagation(); tip.hidden = !tip.hidden; });
  return node;
}

/**
 * The Winter history row. List: name + period figures. Calendar: name + figures +
 * one block per basis row on the timeline.
 */
export function renderWinterHistoryRow({
  slice, blocks = [], isList = false, isPhone = false, range: canvas = null, totalWidth = 0, todayPx = 0,
  unitSystem, rowHeight = 72, nameWidth = 160, metricsCollapsed = false,
}) {
  if (!historyOverlaps(slice)) return null;
  const nameCell = el('div', {
    className: 'loc-mgmt__name loc-mgmt__name--static loc-mgmt__name--winter-history',
    dataset: { testid: 'winter-history-name' },
  }, [
    el('div', { className: 'loc-mgmt__name-text' }, [el('span', { className: 'loc-mgmt__name-label' }, [WINTER_HISTORY_LABEL])]),
    el('div', { className: 'loc-mgmt__area' }, [el('span', { className: 'loc-mgmt__no-acres' }, ['no paddocks'])]),
  ]);
  const metricCell = metricsCollapsed
    ? el('div', { className: 'loc-mgmt__metrics loc-mgmt__metrics--collapsed', 'aria-hidden': 'true' })
    : figuresCell(slice, { unitSystem });
  const rowProps = (extra) => ({
    className: `loc-mgmt__row ${isPhone ? 'loc-mgmt__row--phone' : 'loc-mgmt__row--desktop'} loc-mgmt__row--winter-history${isList ? ' loc-mgmt__row--list' : ''}`,
    dataset: { testid: 'winter-history-row', view: isList ? 'list' : 'calendar' },
    style: { minHeight: `${rowHeight}px`, height: 'auto' },
    ...extra,
  });
  const nameWrap = isPhone ? nameCell : el('div', { className: 'loc-mgmt__name-wrap', style: { width: `${nameWidth}px`, flex: `0 0 ${nameWidth}px` } }, [nameCell]);
  if (isList || !canvas) return el('div', rowProps(), [nameWrap, metricCell]);

  const blockArea = el('div', {
    className: 'loc-mgmt__block-area',
    style: { width: `${totalWidth}px`, height: `${rowHeight}px`, position: 'relative' },
  }, blocks.map(b => renderBlock(b, { range: canvas, unitSystem })).filter(Boolean));
  const timeline = el('div', { className: TIMELINE_CLASS, dataset: { testid: 'winter-history-timeline' } }, [
    el('div', { className: 'loc-mgmt__timeline-inner', style: { width: `${totalWidth}px`, position: 'relative' } }, [blockArea, renderTodayLine(todayPx)]),
  ]);
  return el('div', rowProps(), [nameWrap, metricCell, isPhone ? timeline : el('div', { className: 'loc-mgmt__timeline-wrap' }, [timeline])]);
}
