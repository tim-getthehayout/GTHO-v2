/** @file Application entry point — boot sequence per V2_APP_ARCHITECTURE.md */

import { init as initStore, setSyncAdapter } from './data/store.js';
import { CustomSync } from './data/custom-sync.js';
import { pullAllRemote } from './data/pull-remote.js';
import { loadLocale } from './i18n/i18n.js';
import { route, initRouter } from './ui/router.js';
import { renderHeader } from './ui/header.js';
import { el, clear } from './ui/dom.js';
import { initSession, onAuthChange } from './features/auth/session.js';
import { renderAuthOverlay } from './features/auth/index.js';
import { needsOnboarding, renderOnboarding } from './features/onboarding/index.js';
import { renderDashboard } from './features/dashboard/index.js';
import { renderEventsScreen } from './features/events/index.js';
import { renderLocationsScreen } from './features/locations/index.js';
import { renderFeedScreen } from './features/feed/index.js';
import { renderAnimalsScreen } from './features/animals/index.js';
import { renderReportsScreen } from './features/reports/index.js';
import { renderSettingsScreen } from './features/settings/index.js';
import { renderSurveysScreen } from './features/surveys/index.js';
import { renderFieldModeHome } from './features/field-mode/index.js';
import { renderSoilTestsScreen } from './features/amendments/soil-tests.js';
import { renderAmendmentsScreen } from './features/amendments/entry.js';
import { renderManureScreen } from './features/amendments/manure.js';
import { renderNpkPricesScreen } from './features/amendments/npk-prices.js';
import { renderHarvestScreen } from './features/harvest/index.js';
import { renderFeedQualityScreen } from './features/feed/quality.js';
import { getFieldMode, setFieldMode } from './utils/preferences.js';

/**
 * Boot the application.
 * Sequence: load locale → check session → if auth'd show app, else show auth overlay
 */
async function boot() {
  // 1. Load locale first (needed for auth screen text)
  await loadLocale('en');

  // 2. Get app container
  const app = document.getElementById('app');

  // 3. Check existing session
  const user = await initSession();

  if (user) {
    showApp(app);
  } else {
    showAuth(app);
  }

  // 4. Listen for auth state changes (logout, token expiry)
  onAuthChange((changedUser) => {
    clear(app);
    if (changedUser) {
      showApp(app);
    } else {
      showAuth(app);
    }
  });
}

/**
 * Show the auth overlay.
 * @param {HTMLElement} app
 */
function showAuth(app) {
  clear(app);
  renderAuthOverlay(app, () => {
    clear(app);
    showApp(app);
  });
}

/**
 * Show the authenticated app shell.
 * @param {HTMLElement} app
 */
function showApp(app) {
  // Init store — load from localStorage
  initStore();

  // Wire sync adapter
  const syncAdapter = new CustomSync();
  setSyncAdapter(syncAdapter);

  // Listen for online/offline to flush queue then pull
  if (typeof window !== 'undefined') {
    window.addEventListener('online', async () => {
      await syncAdapter.flush();
      await pullAllRemote();
    });
    // Initial sync: flush pending queue, then pull remote data
    syncAdapter.flush().then(() => pullAllRemote());
  }

  // Check if onboarding needed (no operations for this user)
  if (needsOnboarding()) {
    const onboardingContainer = el('div', { className: 'app-content' });
    app.appendChild(onboardingContainer);
    renderOnboarding(onboardingContainer, () => {
      clear(app);
      showApp(app);
    });
    return;
  }

  // Check for field mode (URL param or preference)
  const urlParams = new window.URLSearchParams(window.location.search);
  if (urlParams.has('field')) {
    setFieldMode(true);
  } else if (getFieldMode()) {
    document.body.classList.add('field-mode');
  }

  // Render header
  renderHeader(app);

  // Create content area
  const content = el('main', { className: 'app-content' });
  app.appendChild(content);

  // Register routes
  route('#/', renderDashboard);
  route('#/field', renderFieldModeHome);
  route('#/events', renderEventsScreen);
  route('#/locations', renderLocationsScreen);
  route('#/feed', renderFeedScreen);
  route('#/animals', renderAnimalsScreen);
  route('#/reports', renderReportsScreen);
  route('#/settings', renderSettingsScreen);
  route('#/surveys', renderSurveysScreen);
  route('#/soil-tests', renderSoilTestsScreen);
  route('#/amendments', renderAmendmentsScreen);
  route('#/manure', renderManureScreen);
  route('#/npk-prices', renderNpkPricesScreen);
  route('#/harvest', renderHarvestScreen);
  route('#/feed-quality', renderFeedQualityScreen);

  // Init router — renders the current hash route
  initRouter(content);
}

boot();
