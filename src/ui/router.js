/** @file Hash-based router. See V2_APP_ARCHITECTURE.md §6.3 */

import { clear } from './dom.js';

/** @type {Record<string, Function>} */
const routes = {};

/** @type {HTMLElement|null} */
let appContainer = null;

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
function handleRoute() {
  const rawHash = window.location.hash || '#/';
  const hash = rawHash.split('?')[0];
  const renderFn = routes[hash] || routes['#/'];

  if (appContainer && renderFn) {
    clear(appContainer);
    renderFn(appContainer);
  }
}

/**
 * Get all registered routes (for testing).
 * @returns {string[]}
 */
export function getRoutes() {
  return Object.keys(routes);
}
