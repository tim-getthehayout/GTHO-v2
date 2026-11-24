/**
 * @file #443 — always-visible horizontal scroll rail for the Rotation calendar.
 * Display-only. It sits under the OI-0266 single scroller (`.loc-mgmt__body`),
 * outside it, and spans only the timeline portion (after the pinned name +
 * metrics columns on desktop, after the row padding on phone).
 *
 * The rail never owns a scroll position: it READS `body.scrollLeft` to paint
 * the thumb (from one passive scroll listener, rAF-coalesced) and only WRITES
 * `body.scrollLeft` from its own pointer / button / key input. Nothing here
 * writes scrollLeft from a scroll event, so the OI-0266 no-write-back rule
 * holds. Re-measure on resize comes from the caller's single OI-0284
 * ResizeObserver (`sync()`), not a second observer.
 */

import { el } from '../../../ui/dom.js';

/** Smallest thumb so it stays grabbable on a very wide timeline (px). */
export const RAIL_MIN_THUMB_PX = 24;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Pure rail geometry from the scroller's measurements.
 * - visible = timeline width on screen (clientWidth minus the pinned columns)
 * - max = scrollable distance; ratio = visible ÷ (visible + max) = visible ÷ timeline width
 * - thumb width = ratio × track (≥ minThumb, ≤ track); left = position × free track
 * - pct = scroll position as 0–100 for aria-valuenow
 */
export function railGeometry({
  scrollLeft = 0, scrollWidth = 0, clientWidth = 0, origin = 0, trackWidth = 0,
  minThumb = RAIL_MIN_THUMB_PX,
} = {}) {
  const max = Math.max(0, Math.round(scrollWidth - clientWidth));
  const visible = Math.max(0, clientWidth - Math.max(0, origin));
  const overflow = max > 1 && visible > 0;
  const timeline = visible + max;
  const ratio = overflow && timeline > 0 ? visible / timeline : 1;
  const track = Math.max(0, trackWidth);
  const thumbWidth = track > 0 ? clamp(track * ratio, Math.min(minThumb, track), track) : 0;
  const pos = overflow ? clamp(scrollLeft / max, 0, 1) : 0;
  const thumbLeft = (track - thumbWidth) * pos;
  return {
    overflow, max, visible, ratio, thumbWidth, thumbLeft,
    pct: Math.round(pos * 100),
  };
}

/**
 * Build the rail for one render of the calendar surface.
 * @param {HTMLElement} body The single scroller (OI-0266).
 * @param {object} opts
 * @param {boolean} [opts.isPhone]
 * @param {string} opts.controlsId id of `body` (aria-controls)
 * @param {() => number} [opts.getOrigin] x of the timeline origin in the scroller (pinned columns width)
 * @param {number} [opts.stepPx] arrow-key step (one day, like the surface arrow keys; Shift = 7)
 * @returns {{ el: HTMLElement, sync: () => object, destroy: () => void }}
 */
export function createScrollRail(body, {
  isPhone = false, controlsId, getOrigin = () => 0, stepPx = 20,
} = {}) {
  const thumb = el('div', {
    className: 'loc-mgmt__rail-thumb',
    dataset: { testid: 'calendar-scroll-rail-thumb' },
  });
  const track = el('div', {
    className: 'loc-mgmt__rail-track',
    role: 'scrollbar',
    'aria-controls': controlsId,
    'aria-orientation': 'horizontal',
    'aria-label': 'Scroll the timeline sideways',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '0',
    tabindex: '0',
    dataset: { testid: 'calendar-scroll-rail-track' },
  }, [thumb]);

  let geo = railGeometry();
  const measure = () => railGeometry({
    scrollLeft: body.scrollLeft,
    scrollWidth: body.scrollWidth,
    clientWidth: body.clientWidth,
    origin: getOrigin(),
    trackWidth: track.clientWidth,
  });

  const rail = el('div', {
    className: ['loc-mgmt__rail', isPhone ? 'loc-mgmt__rail--phone' : ''].filter(Boolean).join(' '),
    dataset: { testid: 'calendar-scroll-rail' },
  });

  /** Read the scroller and paint (never writes scrollLeft). */
  function sync() {
    const origin = Math.max(0, Math.round(getOrigin()));
    rail.style.marginLeft = `${origin}px`;
    geo = measure();
    if (rail.hidden !== !geo.overflow) {
      rail.hidden = !geo.overflow;
      geo = measure(); // the track has a width only once the rail is shown
    }
    thumb.style.width = `${Math.round(geo.thumbWidth)}px`;
    thumb.style.left = `${Math.round(geo.thumbLeft)}px`;
    track.setAttribute('aria-valuenow', String(geo.pct));
    return geo;
  }

  /** The only writes: from the rail's own input. */
  function scrollTo(left) {
    const g = measure();
    body.scrollLeft = clamp(left, 0, g.max);
    sync();
  }
  const page = (dir) => {
    const g = measure();
    scrollTo(body.scrollLeft + dir * g.visible);
  };

  const prev = el('button', {
    type: 'button',
    className: 'loc-mgmt__rail-btn',
    'aria-label': 'Scroll the timeline back one screen',
    'aria-controls': controlsId,
    dataset: { testid: 'calendar-scroll-rail-prev' },
    onClick: () => page(-1),
  }, ['‹']);
  const next = el('button', {
    type: 'button',
    className: 'loc-mgmt__rail-btn',
    'aria-label': 'Scroll the timeline forward one screen',
    'aria-controls': controlsId,
    dataset: { testid: 'calendar-scroll-rail-next' },
    onClick: () => page(1),
  }, ['›']);

  // Drag the thumb (mouse, pen, touch) with pointer capture.
  let drag = null;
  thumb.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const g = measure();
    drag = { id: e.pointerId, x: e.clientX, left: body.scrollLeft, g };
    try { thumb.setPointerCapture?.(e.pointerId); } catch { /* not capturable (jsdom) */ }
    thumb.classList.add('loc-mgmt__rail-thumb--dragging');
  });
  thumb.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const free = Math.max(1, track.clientWidth - drag.g.thumbWidth);
    scrollTo(drag.left + ((e.clientX - drag.x) * drag.g.max) / free);
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    try { thumb.releasePointerCapture?.(drag.id); } catch { /* already released */ }
    drag = null;
    thumb.classList.remove('loc-mgmt__rail-thumb--dragging');
  };
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);
  thumb.addEventListener('lostpointercapture', endDrag);

  // Click (tap) the track beside the thumb: page one visible width toward it.
  track.addEventListener('pointerdown', (e) => {
    if (e.target === thumb || (e.button != null && e.button !== 0)) return;
    const g = measure();
    const x = e.clientX - track.getBoundingClientRect().left;
    if (x < g.thumbLeft) page(-1);
    else if (x > g.thumbLeft + g.thumbWidth) page(1);
  });

  // Keyboard when the rail is focused (same steps as the surface arrow keys).
  track.addEventListener('keydown', (e) => {
    const g = measure();
    let left = null;
    switch (e.key) {
      case 'ArrowLeft': left = body.scrollLeft - stepPx * (e.shiftKey ? 7 : 1); break;
      case 'ArrowRight': left = body.scrollLeft + stepPx * (e.shiftKey ? 7 : 1); break;
      case 'PageUp': left = body.scrollLeft - g.visible; break;
      case 'PageDown': left = body.scrollLeft + g.visible; break;
      case 'Home': left = 0; break;
      case 'End': left = g.max; break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation(); // the surface's own arrow-key handler must not step again
    scrollTo(left);
  });

  rail.append(prev, track, next);

  // Native scrolling (trackpad, Shift+wheel, swipe, Jump/Today) → repaint the
  // thumb. Read-only; coalesced to one paint per frame.
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    raf(() => {
      queued = false;
      if (rail.isConnected) sync();
    });
  };
  body.addEventListener('scroll', onScroll, { passive: true });

  return {
    el: rail,
    sync,
    destroy() {
      body.removeEventListener('scroll', onScroll);
      drag = null;
    },
  };
}
