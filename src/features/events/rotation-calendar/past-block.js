/**
 * @file Past event block — CP-54.
 * Solid green rectangle for past events in the timeline.
 * Handles: multi-group labels, strip bands, linked paddocks, active NOW ring, sub-move rendering.
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.2.
 */

import { el } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';

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
function renderStripBands(strips) {
  const container = el('div', { className: 'strip-bands' });
  const shades = ['var(--green-base)', 'var(--green-dark)', 'var(--green-light)'];
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
 * Render a past event block.
 * @param {object} opts
 * @param {number} opts.leftPx - Left offset in the timeline
 * @param {number} opts.widthPx - Width in pixels
 * @param {Array<{id: string, name: string}>} opts.groups - Event groups
 * @param {number} opts.auds - AUDS value
 * @param {number} opts.days - Duration in days
 * @param {number} opts.pasturePct - Pasture percentage
 * @param {number} opts.feedPct - Feed percentage
 * @param {number} opts.dmi - DMI value
 * @param {number} opts.headCount - Head count
 * @param {boolean} opts.isActive - Whether this is the currently-open event
 * @param {boolean} opts.isStripGraze - Whether strip-grazed
 * @param {Array<{areaPct: number}>} [opts.strips] - Strip data (when isStripGraze + active)
 * @param {string} [opts.stripNote] - e.g. "Strip 2/4" (when isStripGraze + closed)
 * @param {boolean} opts.isLinkedSecondary - Whether this is a linked (non-primary) row
 * @param {string} [opts.linkedPrimaryName] - Name of the primary paddock
 * @param {string} opts.eventId - Event ID for click handler
 * @param {Function} opts.onClickBlock - Click handler
 * @returns {HTMLElement}
 */
export function renderPastBlock({
  leftPx, widthPx, groups, auds, days, pasturePct, feedPct, dmi, headCount,
  isActive, isStripGraze, strips, stripNote, isLinkedSecondary, linkedPrimaryName,
  eventId, onClickBlock,
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

  // Line 2: Pasture/Feed/DMI/Head
  const line2Parts = [];
  if (isLinkedSecondary) {
    line2Parts.push(el('span', {}, [`↳ linked to ${linkedPrimaryName || '—'}`]));
  } else {
    line2Parts.push(el('span', {}, [
      `Pasture ${Math.round(pasturePct)}% · Feed ${Math.round(feedPct)}% · ${Math.round(dmi)} DMI · ${headCount} hd`,
    ]));
    if (isStripGraze && stripNote) {
      line2Parts.push(el('span', { className: 'strip-note' }, [` · ${stripNote}`]));
    }
  }

  const blockClasses = ['past-block'];
  if (isActive) blockClasses.push('past-block--active');
  if (isLinkedSecondary) blockClasses.push('past-block--linked');

  const children = [];

  // Strip bands behind label (active strip-grazed only)
  if (isStripGraze && isActive && strips && strips.length > 0) {
    children.push(renderStripBands(strips));
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
    dataset: { testid: 'past-block', eventId },
    onClick: () => onClickBlock(eventId),
    tabindex: '0',
    role: 'button',
    'aria-label': `${groupLabel.ariaLabel || groupLabel.text}, ${days} days`,
  }, children);
}
