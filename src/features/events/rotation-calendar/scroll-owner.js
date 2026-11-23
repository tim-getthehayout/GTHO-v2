/**
 * @file F0 scroll ownership — OI-0266: ONE scroll owner for both axes.
 * `.loc-mgmt__body` is the only scroller (X and Y). The date axis lives inside
 * it, sticky to the top; the name + metrics columns are sticky to the left.
 * Row timelines and the axis never scroll on their own, so nothing ever copies
 * `scrollLeft` between scrollers (the old bindHorizontalScrollSync write-back
 * fight that made the hovered row jiggle is gone).
 */

export const SCROLL_OWNER_CLASS = 'loc-mgmt__body';
/** Kept for callers / tests written against the F0 name. */
export const VERTICAL_SCROLL_OWNER_CLASS = SCROLL_OWNER_CLASS;
export const ROW_CLASS = 'loc-mgmt__row';
/** Non-scrolling timeline strip inside a row (moves with the single owner). */
export const TIMELINE_CLASS = 'loc-mgmt__timeline';
/** Non-scrolling axis strip inside the sticky head. */
export const AXIS_CLASS = 'loc-mgmt__axis';

const SCROLLING = ['auto', 'scroll'];

/**
 * True when the management surface has exactly one scroll owner for both axes
 * and no nested X or Y scrollers (per-row or axis).
 * @param {ParentNode} root
 */
export function hasSingleScrollOwner(root) {
  if (!root) return false;
  const bodies = root.querySelectorAll(`.${SCROLL_OWNER_CLASS}`);
  if (bodies.length !== 1) return false;
  const body = bodies[0];
  const style = body.style || {};
  const overflowY = style.overflowY || body.getAttribute('data-overflow-y') || '';
  const overflowX = style.overflowX || body.getAttribute('data-overflow-x') || '';
  const ownsBoth = body.getAttribute('data-scroll-owner') === 'both'
    || (SCROLLING.includes(overflowY) && SCROLLING.includes(overflowX));
  if (!ownsBoth) return false;
  const nested = [...body.querySelectorAll('[data-overflow-y], [data-overflow-x]')]
    .filter(n => n !== body)
    .filter(n => SCROLLING.includes(n.getAttribute('data-overflow-y'))
      || SCROLLING.includes(n.getAttribute('data-overflow-x')));
  return nested.length === 0;
}

/**
 * F0 name kept: now asserts the single owner for BOTH axes (OI-0266).
 * @param {ParentNode} root
 */
export function hasSingleVerticalScrollOwner(root) {
  return hasSingleScrollOwner(root);
}

/**
 * Describe the F0 architecture for tests / docs.
 */
export function describeScrollArchitecture() {
  return {
    vertical: 'single-owner',
    horizontal: 'single-owner',
    ownerClass: SCROLL_OWNER_CLASS,
    rowClass: ROW_CLASS,
    timelineClass: TIMELINE_CLASS,
    axis: 'sticky-top',
    nameColumn: 'sticky-left',
    metricsColumn: 'sticky-left',
    perRowHorizontalScrollers: false,
    scrollLeftWriteBack: false,
    nameColumnIndependentY: false,
    metricsColumnIndependentY: false,
    sidebarIndependentY: false,
  };
}
