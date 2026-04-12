/** @file Application entry point — boot sequence per V2_APP_ARCHITECTURE.md */

import { init as initStore } from './data/store.js';
import { loadLocale } from './i18n/i18n.js';
import { route, initRouter } from './ui/router.js';
import { renderHeader } from './ui/header.js';
import { el } from './ui/dom.js';
import { renderDashboard } from './features/dashboard/index.js';
import { renderEventsScreen } from './features/events/index.js';
import { renderLocationsScreen } from './features/locations/index.js';
import { renderFeedScreen } from './features/feed/index.js';
import { renderAnimalsScreen } from './features/animals/index.js';
import { renderReportsScreen } from './features/reports/index.js';
import { renderSettingsScreen } from './features/settings/index.js';

/**
 * Boot the application.
 * Sequence: init store → load locale → register routes → render header → init router
 */
async function boot() {
  // 1. Init store — load from localStorage
  initStore();

  // 2. Load locale
  await loadLocale('en');

  // 3. Get app container
  const app = document.getElementById('app');

  // 4. Render header
  renderHeader(app);

  // 5. Create content area
  const content = el('main', { className: 'app-content' });
  app.appendChild(content);

  // 6. Register routes
  route('#/', renderDashboard);
  route('#/events', renderEventsScreen);
  route('#/locations', renderLocationsScreen);
  route('#/feed', renderFeedScreen);
  route('#/animals', renderAnimalsScreen);
  route('#/reports', renderReportsScreen);
  route('#/settings', renderSettingsScreen);

  // 7. Init router — renders the current hash route
  initRouter(content);
}

boot();
