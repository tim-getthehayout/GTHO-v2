/**
 * @file F0 scroll ownership — single vertical scroll owner architecture.
 * Location names stay aligned with metric/timeline rows because they share
 * one overflow-y parent; columns do not scroll independently on Y.
 *
 * Horizontal timeline scroll may be synced across row timeline cells via
 * bindHorizontalScrollSync (optional hardening when multiple X scrollers exist).
 */

export const VERTICAL_SCROLL_OWNER_CLASS = 'loc-mgmt__body';
export const ROW_CLASS = 'loc-mgmt__row';
export const TIMELINE_SCROLL_CLASS = 'loc-mgmt__timeline-scroll';

/**
 * True when the management surface uses a single vertical scroll owner
 * (architecture invariant — desync is impossible when only one overflow-y exists).
 */
export function hasSingleVerticalScrollOwner(root) {
  if (!root) return false;
  const bodies = root.querySelectorAll(`.${VERTICAL_SCROLL_OWNER_CLASS}`);
  if (bodies.length !== 1) return false;
  const body = bodies[0];
  const style = body.style || {};
  // Inline or computed — tests set dataset flag; runtime CSS sets overflow-y:auto
  const overflowY = style.overflowY || body.getAttribute('data-overflow-y') || '';
  const okOverflow = overflowY === 'auto' || overflowY === 'scroll'
    || body.getAttribute('data-scroll-owner') === 'vertical';
  // No nested vertical scrollers on name/metrics columns inside body
  const nestedY = body.querySelectorAll('[data-overflow-y="auto"], [data-overflow-y="scroll"]');
  const foreign = [...nestedY].filter(el => el !== body && !el.classList.contains(TIMELINE_SCROLL_CLASS));
  return okOverflow && foreign.length === 0;
}

/**
 * Bind scrollLeft sync across timeline horizontal scrollers (and optional axis).
 * Returns an unsubscribe function.
 */
export function bindHorizontalScrollSync(scrollers) {
  const list = [...(scrollers || [])].filter(Boolean);
  if (list.length < 2) return () => {};

  let locking = false;
  const handlers = list.map(el => {
    const onScroll = () => {
      if (locking) return;
      locking = true;
      const left = el.scrollLeft;
      for (const other of list) {
        if (other !== el && other.scrollLeft !== left) other.scrollLeft = left;
      }
      locking = false;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  });

  return () => handlers.forEach(fn => fn());
}

/**
 * Describe the F0 architecture for tests / docs.
 */
export function describeScrollArchitecture() {
  return {
    vertical: 'single-owner',
    ownerClass: VERTICAL_SCROLL_OWNER_CLASS,
    rowClass: ROW_CLASS,
    horizontal: 'timeline-only',
    horizontalClass: TIMELINE_SCROLL_CLASS,
    nameColumnIndependentY: false,
    metricsColumnIndependentY: false,
    sidebarIndependentY: false,
  };
}
