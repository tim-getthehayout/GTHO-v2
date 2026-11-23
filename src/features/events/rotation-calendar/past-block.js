/**
 * @file Past event block — CP-54.
 * Solid green rectangle for past events in the timeline.
 * OI-0256 Pn1: no_pasture / 100% stored feed paints tan (stored-feed color).
 * Handles: multi-group labels, strip bands, linked paddocks, active NOW ring, sub-move rendering.
 * OI-0264 Pw1: one block per paddock window (calendar-grid / past-window.js).
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.2.
 */

import { el } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';
import { formatMeasure } from '../../../utils/units.js';

/**
 * Build the group label per multi-group rule.
 * N=1 → group name. N>1 → "Multiple Groups (N)" with tooltip.
 * @param {Array<{id: string, name: string}>} groups
 * @returns {{ text: string, tooltip: string|null, ariaLabel: string }}
 */
export function buildGroupLabel(groups) {
  if (!groups || groups.length === 0) return { text: '', tooltip: null, ariaLabel: '' };
  if (groups.length === 1) return { text: groups[0].name, tooltip: null, ariaLabel: groups[0].name };
  const tooltip = groups.map(g => g.name).join(', ');
  const text = `Multiple Groups (${groups.length})`;
  return { text, tooltip, ariaLabel: `${text}: ${tooltip}` };
}

/**
 * Render strip-graze bands (proportional vertical segments).
 * Each strip gets a band whose width is proportional to its area_pct.
 * @param {Array<{areaPct: number}>} strips
 * @returns {HTMLElement}
 */
function renderStripBands(strips, { storedFeedOnly = false } = {}) {
  const container = el('div', { className: 'strip-bands' });
  const shades = storedFeedOnly
    ? ['#D4A76A', 'var(--color-tan-dark)', 'var(--color-tan-light)']
    : ['var(--green-base)', 'var(--green-dark)', 'var(--green-light)'];
  strips.forEach((strip, i) => {
    container.appendChild(el('div', {
      className: 'strip-band',
      style: {
        width: `${strip.areaPct}%`,
        backgroundColor: shades[i % shades.length],
      },
    }));
  });
  return container;
}


/**
 * Format past-block line 2 Pasture/Feed/DMI/Head.
 * OI-0253 B1: null/non-finite pasturePct or dmi → "—" (never paint unknown as 0 / 0%).
 * Known zero still renders 0 / 0%.
 * @param {{ pasturePct: number|null|undefined, feedPct: number|null|undefined, dmi: number|null|undefined, headCount: number, unitSystem?: 'metric'|'imperial' }} opts
 *   `dmi` is canonical kg (unrounded); the helper converts and rounds.
 * @returns {string}
 */
export function formatPastureFeedDmiLine({ pasturePct, feedPct, dmi, headCount, unitSystem }) {
  const pastureSeg = pasturePct == null || !Number.isFinite(Number(pasturePct))
    ? 'Pasture —%'
    : `Pasture ${Math.round(pasturePct)}%`;
  // OI-0278 S1: DMI (canonical kg) in the farm unit via the shared helper → "272 lb DMI".
  const dmiSeg = dmi == null || !Number.isFinite(Number(dmi))
    ? '— DMI'
    : `${formatMeasure(dmi, 'weight', { unitSystem })} DMI`;
  // OI-0264 Mw1: feedPct may be unknown too ("Feed —%").
  const feedSeg = feedPct == null || !Number.isFinite(Number(feedPct))
    ? 'Feed —%'
    : `Feed ${Math.round(feedPct)}%`;
  return `${pastureSeg} · ${feedSeg} · ${dmiSeg} · ${headCount} hd`;
}

/**
 * Render a past event block.
 * @param {object} opts
 * @param {number} opts.leftPx - Left offset in the timeline
 * @param {number} opts.widthPx - Width in pixels
 * @param {Array<{id: string, name: string}>} opts.groups - Event groups
 * @param {number} opts.auds - AUDS value
 * @param {number} opts.days - Duration in days
 * @param {number|null} opts.pasturePct - Pasture percentage; null/unknown → "—" (OI-0253 B1)
 * @param {number|null} opts.feedPct - Feed percentage; null → "—" (OI-0264 Mw1)
 * @param {number|null} opts.dmi - DMI in canonical kg (unrounded); null/unknown → "—" (OI-0253 B1)
 * @param {number} opts.headCount - Head count
 * @param {boolean} opts.isActive - Whether this is the currently-open event
 * @param {boolean} opts.isStripGraze - Whether strip-grazed
 * @param {Array<{areaPct: number}>} [opts.strips] - Strip data (when isStripGraze + active)
 * @param {string} [opts.stripNote] - e.g. "Strip 2/4" (when isStripGraze + closed)
 * @param {boolean} opts.isLinkedSecondary - Whether this is a linked (non-primary) row
 * @param {string} [opts.linkedPrimaryName] - Name of the primary paddock
 * @param {boolean} [opts.storedFeedOnly] - OI-0256 Pn1 tan / stored-feed paint
 * @param {string} opts.eventId - Event ID for click handler
 * @param {string} [opts.paddockWindowId] - OI-0264 Pw1: the window this bar draws
 * @param {Function} opts.onClickBlock - Click handler
 * @returns {HTMLElement}
 */
export function renderPastBlock({
  leftPx, widthPx, groups, auds, days, pasturePct, feedPct, dmi, headCount,
  isActive, isStripGraze, strips, stripNote, isLinkedSecondary, linkedPrimaryName,
  storedFeedOnly = false, eventId, paddockWindowId = null, onClickBlock,
}) {
  const groupLabel = buildGroupLabel(groups);

  // Line 1: group · AUDS · days
  const line1Parts = [];
  if (isActive) line1Parts.push(el('span', { className: 'now-chip' }, ['NOW']));
  const groupSpan = el('span', {}, [groupLabel.text]);
  if (groupLabel.tooltip) {
    groupSpan.className = 'multi-group-label';
    groupSpan.setAttribute('aria-label', groupLabel.ariaLabel);
    groupSpan.title = groupLabel.tooltip;
  }
  line1Parts.push(groupSpan);
  line1Parts.push(el('span', {}, [` · ${auds} AUDS · ${days}d`]));

  // Line 2: Pasture/Feed/DMI/Head (OI-0253 B1: unknown → — not 0)
  const line2Parts = [];
  if (isLinkedSecondary) {
    line2Parts.push(el('span', {}, [`↳ linked to ${linkedPrimaryName || '—'}`]));
  } else if (storedFeedOnly) {
    line2Parts.push(el('span', {}, [
      `Pasture 0% · Feed 100% · ${formatMeasure(dmi || 0, 'weight')} DMI · ${headCount} hd`,
    ]));
  } else {
    line2Parts.push(el('span', {}, [
      formatPastureFeedDmiLine({ pasturePct, feedPct, dmi, headCount }),
    ]));
    if (isStripGraze && stripNote) {
      line2Parts.push(el('span', { className: 'strip-note' }, [` · ${stripNote}`]));
    }
  }

  const blockClasses = ['past-block'];
  if (storedFeedOnly) blockClasses.push('past-block--stored-feed');
  if (isActive) blockClasses.push('past-block--active');
  if (isLinkedSecondary) blockClasses.push('past-block--linked');

  const children = [];

  // Strip bands behind label (active strip-grazed only)
  if (isStripGraze && isActive && strips && strips.length > 0) {
    children.push(renderStripBands(strips, { storedFeedOnly }));
  }

  children.push(
    el('div', { className: 'past-block__content' }, [
      el('div', { className: 'past-block__line1' }, line1Parts),
      el('div', { className: 'past-block__line2' }, line2Parts),
    ])
  );

  return el('div', {
    className: blockClasses.join(' '),
    style: { left: `${leftPx}px`, width: `${widthPx}px` },
    dataset: paddockWindowId
      ? { testid: 'past-block', eventId, paddockWindowId }
      : { testid: 'past-block', eventId },
    onClick: () => onClickBlock(eventId),
    tabindex: '0',
    role: 'button',
    'aria-label': `${groupLabel.ariaLabel || groupLabel.text}, ${days} days`,
  }, children);
}
