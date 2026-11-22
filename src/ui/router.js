/** @file Hash-based router. See V2_APP_ARCHITECTURE.md §6.3 */

import { clear } from './dom.js';
import { isCurrentUserDev, getOperation } from '../data/store.js';

/** @type {Record<string, Function>} */
const routes = {};

/** @type {HTMLElement|null} */
let appContainer = null;

/** OI-0263 Ex1: hash the user was on before the latest in-app hash change (null on cold launch). */
let previousHash = null;

/**
 * Register a route.
 * @param {string} hash - e.g. '#/' or '#/events'
 * @param {Function} renderFn - Function that renders into the app container
 */
export function route(hash, renderFn) {
  routes[hash] = renderFn;
}

/**
 * Initialize the router.
 * @param {HTMLElement} container - The app container element
 */
export function initRouter(container) {
  appContainer = container;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

/**
 * Navigate to a hash.
 * @param {string} hash
 */
export function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Handle the current hash route.
 */
function handleRoute(e) {
  if (e && typeof e.oldURL === 'string') {
    const idx = e.oldURL.indexOf('#');
    previousHash = idx >= 0 ? e.oldURL.slice(idx) : '#/';
  }
  const rawHash = window.location.hash || '#/';
  const hash = rawHash.split('?')[0];
  const renderFn = routes[hash] || routes['#/'];

  if (appContainer && renderFn) {
    clear(appContainer);
    renderFn(appContainer);
  }
}

/**
 * OI-0263 Ex1: the hash before the latest hash change, or null on a cold launch.
 * @returns {string|null}
 */
export function getPreviousHash() {
  return previousHash;
}

/** Test seam: set/clear the remembered previous hash. */
export function _setPreviousHash(hash) {
  previousHash = hash ?? null;
}

/**
 * Get all registered routes (for testing).
 * @returns {string[]}
 */
export function getRoutes() {
  return Object.keys(routes);
}

/**
 * OI-0138: wrap a render function so that it silently redirects to `#/` when
 * the current user does not have `is_dev = true` on the active operation.
 * Used by the Dev Mode shelf routes (`#/dev`, `#/dev/audit`, `#/dev/logs`,
 * `#/dev/schema`). Centralizing the check here means the gate is grep-able
 * and impossible to forget when adding a new dev-mode route.
 *
 * @param {Function} renderFn
 * @returns {Function} guarded render function
 */
export function requireDev(renderFn) {
  return function guardedRender(container) {
    const opId = getOperation()?.id;
    if (!isCurrentUserDev(opId)) {
      navigate('#/');
      return;
    }
    return renderFn(container);
  };
}
