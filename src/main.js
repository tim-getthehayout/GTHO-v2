/* global sessionStorage */
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
import {
  extractInviteToken, clearInviteHash, claimInviteByToken,
  claimPendingInviteByEmail, userHasOperation,
} from './features/auth/invite-claim.js';
import { t } from './i18n/i18n.js';
import { renderDashboard } from './features/dashboard/index.js';
import { renderEventsScreen } from './features/events/index.js';
import { renderLocationsScreen } from './features/locations/index.js';
import { renderFeedScreen } from './features/feed/index.js';
import { renderAnimalsScreen } from './features/animals/index.js';
import { renderReportsScreen } from './features/reports/index.js';
import { renderSettingsScreen } from './features/settings/index.js';
import { renderTodosScreen } from './features/todos/index.js';
import { renderSurveysScreen } from './features/surveys/index.js';
import { renderFieldModeHome } from './features/field-mode/index.js';
import { renderSoilTestsScreen } from './features/amendments/soil-tests.js';
import { renderAmendmentsScreen } from './features/amendments/entry.js';
import { renderManureScreen } from './features/amendments/manure.js';
import { renderNpkPricesScreen } from './features/amendments/npk-prices.js';
import { renderHarvestScreen } from './features/harvest/index.js';
import { renderFeedbackScreen } from './features/feedback/index.js';
import { renderFeedQualityScreen } from './features/feed/quality.js';
import { getFieldMode, setFieldMode, migrateUnitSystemFromLocalStorage } from './utils/preferences.js';

// Register all calculations on import (CP-45/46/47, CP-54)
import './calcs/core.js';
import './calcs/feed-forage.js';
import './calcs/advanced.js';
import './calcs/capacity.js';

/**
 * Boot the application.
 * Sequence: load locale → check session → if auth'd show app, else show auth overlay
 */
async function boot() {
  // 1. Load locale first (needed for auth screen text)
  await loadLocale('en');

  // 2. Get app container
  const app = document.getElementById('app');

  // 3. Check for invite token in URL (CP-66)
  const inviteToken = extractInviteToken();

  // 4. Check existing session
  const user = await initSession();

  // Track the last rendered user ID — prevents onAuthChange from
  // re-rendering when the same user is still signed in (OI-0052).
  // Supabase fires INITIAL_SESSION + TOKEN_REFRESHED on load.
  let lastRenderedUserId = null;

  if (user) {
    lastRenderedUserId = user.id;
    if (inviteToken) {
      await handleInviteClaim(app, inviteToken, user);
    } else {
      const hasOp = await userHasOperation(user.id);
      if (!hasOp) {
        await claimPendingInviteByEmail(user.email, user.id);
      }
      showApp(app);
    }
  } else {
    if (inviteToken) {
      showAuth(app, inviteToken);
    } else {
      showAuth(app);
    }
  }

  // 5. Listen for auth state changes (logout, token expiry, sign-in)
  onAuthChange(async (changedUser) => {
    // Skip if same user still signed in (token refresh, initial session restore)
    if (changedUser && changedUser.id === lastRenderedUserId) {
      return;
    }

    lastRenderedUserId = changedUser?.id || null;
    clear(app);
    if (changedUser) {
      const storedToken = sessionStorage.getItem('gtho_invite_token');
      if (storedToken) {
        sessionStorage.removeItem('gtho_invite_token');
        await handleInviteClaim(app, storedToken, changedUser);
      } else {
        const hasOp = await userHasOperation(changedUser.id);
        if (!hasOp) {
          await claimPendingInviteByEmail(changedUser.email, changedUser.id);
        }
        showApp(app);
      }
    } else {
      showAuth(app);
    }
  });
}

/**
 * Show the auth overlay.
 * @param {HTMLElement} app
 * @param {string} [inviteToken] - If present, show invite context banner
 */
function showAuth(app, inviteToken) {
  clear(app);
  if (inviteToken) {
    // Store token for post-auth claim
    sessionStorage.setItem('gtho_invite_token', inviteToken);
    clearInviteHash();
    // Show context banner above auth
    app.appendChild(el('div', {
      className: 'invite-banner',
      'data-testid': 'invite-banner',
    }, [t('members.inviteBanner')]));
  }
  renderAuthOverlay(app, () => {
    clear(app);
    showApp(app);
  });
}

/**
 * Handle invite claim after authentication.
 * @param {HTMLElement} app
 * @param {string} token
 * @param {object} user
 */
async function handleInviteClaim(app, token, user) {
  clearInviteHash();

  // Check if user is already a member of any operation
  const alreadyMember = await userHasOperation(user.id);

  const result = await claimInviteByToken(token, user.id);

  if (result.success) {
    showApp(app);
    // Toast after app renders
    setTimeout(() => {
      const toast = el('div', { className: 'export-toast', 'data-testid': 'invite-success-toast' }, [
        t('members.welcomeToast'),
      ]);
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }, 500);
  } else if (alreadyMember) {
    // Already a member — just show the app
    showApp(app);
    setTimeout(() => {
      const toast = el('div', { className: 'export-toast', 'data-testid': 'invite-already-member-toast' }, [
        t('members.alreadyMember'),
      ]);
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }, 500);
  } else {
    // Invalid/expired token
    clear(app);
    app.appendChild(el('div', {
      className: 'invite-error-screen',
      'data-testid': 'invite-error',
      style: { padding: 'var(--space-6)', textAlign: 'center' },
    }, [
      el('h2', {}, [t('members.inviteInvalid')]),
      el('p', { style: { color: 'var(--text2)', marginTop: 'var(--space-3)' } }, [
        t('members.inviteInvalidDesc'),
      ]),
      el('button', {
        className: 'btn btn-green',
        style: { marginTop: 'var(--space-4)' },
        onClick: () => { clear(app); showApp(app); },
      }, [t('members.goToApp')]),
    ]));
  }
}

/**
 * Show the authenticated app shell.
 * @param {HTMLElement} app
 */
async function showApp(app) {
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
    await syncAdapter.flush();
    await pullAllRemote();
  }

  // Migrate legacy unit system from localStorage to operation (A44)
  migrateUnitSystemFromLocalStorage();

  // Check if onboarding needed (no operations for this user)
  if (needsOnboarding()) {
    clear(app);
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
  route('#/todos', renderTodosScreen);
  route('#/surveys', renderSurveysScreen);
  route('#/soil-tests', renderSoilTestsScreen);
  route('#/amendments', renderAmendmentsScreen);
  route('#/manure', renderManureScreen);
  route('#/npk-prices', renderNpkPricesScreen);
  route('#/harvest', renderHarvestScreen);
  route('#/feedback', renderFeedbackScreen);
  route('#/feed-quality', renderFeedQualityScreen);

  // Init router — renders the current hash route
  initRouter(content);
}

boot();
