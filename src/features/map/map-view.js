/**
 * @file OI-0263 Ex1+Lf-B+Tb1 — Map as the third Locations & Rotation view.
 * History-safe routing: old `#/map` links redirect (replace, not push) to the
 * Map view with the draw/pin/view intent kept; Back/Close returns to the screen
 * that opened the map, or Locations & Rotation on a cold launch.
 */

import { navigate, getPreviousHash } from '../../ui/router.js';
import { MAP_VIEW_HASH, LIST_VIEW_HASH, isMapViewHash } from '../events/calendar-state.js';

/** Cold-launch / no-history fallback for Back/Close. */
export const MAP_BACK_FALLBACK_HASH = '#/events';

/**
 * Where Back/Close goes: the opener's hash, unless there is none (cold PWA
 * launch on `#/map`) or it is itself a map hash (would loop).
 * @param {string|null} [previous]
 * @returns {string}
 */
export function mapBackTarget(previous = getPreviousHash()) {
  if (previous && !isMapViewHash(previous)) return previous;
  return MAP_BACK_FALLBACK_HASH;
}

/** Back/Close handler for the map header. */
export function leaveMapView() {
  navigate(mapBackTarget());
}

/**
 * Legacy `#/map` route: swap the history entry for the Map view (no extra Back
 * step, no redirect loop) and render Locations & Rotation in place. The module
 * map intent (draw/pin/view) is untouched, so it carries across.
 * @param {HTMLElement} container
 * @param {(container: HTMLElement) => void} renderEventsScreen
 */
export function redirectLegacyMapRoute(container, renderEventsScreen) {
  history.replaceState(null, '', MAP_VIEW_HASH);
  renderEventsScreen(container);
}

/**
 * OI-0265 Rd1: legacy `#/locations` route — replace the history entry with the
 * Locations & Rotation List view (no extra Back step, no loop) and render it.
 * @param {HTMLElement} container
 * @param {(container: HTMLElement) => void} renderEventsScreen
 */
export function redirectLegacyLocationsRoute(container, renderEventsScreen) {
  history.replaceState(null, '', LIST_VIEW_HASH);
  renderEventsScreen(container);
}
