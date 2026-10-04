/** @file Application entry point — boot sequence per V2_APP_ARCHITECTURE.md */

import { init as initStore, setSyncAdapter, getAll } from './data/store.js';
import { closePaddockWindowOrphans } from './data/one-time-fixes.js';
import { CustomSync } from './data/custom-sync.js';
import { pullAllRemote, pullEntitiesStrict } from './data/pull-remote.js';
import { flushLoggerBuffer } from './data/log-flush.js';
import { loadLocale } from './i18n/i18n.js';
import { route, initRouter, requireDev } from './ui/router.js';
import { renderHeader } from './ui/header.js';
import { el, clear } from './ui/dom.js';
import { initSession, onAuthChange, getUser } from './features/auth/session.js';
import { renderAuthOverlay } from './features/auth/index.js';
import { needsOnboarding, renderOnboarding } from './features/onboarding/index.js';
import {
  extractInviteToken, clearInviteHash, claimInviteByToken,
  claimPendingInviteByEmail, lookupOperationMembership,
} from './features/auth/invite-claim.js';
import { decideBootGate } from './features/auth/boot-gate.js';
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
import { renderFarmMapScreen } from './features/map/index.js';
import { renderFeedbackScreen } from './features/feedback/index.js';
import { renderFeedQualityScreen } from './features/feed/quality.js';
import { renderDevHome } from './features/dev-mode/index.js';
import { renderEventAudit } from './features/dev-mode/audit.js';
import { renderLogsViewer } from './features/dev-mode/logs.js';
import { renderSchemaReadout } from './features/dev-mode/schema.js';
import { getFieldMode, setFieldMode, migrateUnitSystemFromLocalStorage } from './utils/preferences.js';

import './calcs/core.js';
import './calcs/feed-forage.js';
import './calcs/advanced.js';
import './calcs/capacity.js';
import './calcs/survey-bale-ring.js';

let showAppGen = 0;
let lastRenderedUserId = null;
let appListenersBound = false;

async function boot() {
  await loadLocale('en');
  const app = document.getElementById('app');
  const inviteToken = extractInviteToken();
  const user = await initSession();

  if (user) {
    lastRenderedUserId = user.id;
    if (inviteToken) {
      await handleInviteClaim(app, inviteToken, user);
    } else {
      await claimIfNoMembership(user);
      showApp(app);
    }
  } else {
    if (inviteToken) showAuth(app, inviteToken);
    else showAuth(app);
  }

  onAuthChange(async (changedUser) => {
    if (changedUser && changedUser.id === lastRenderedUserId) return;
    lastRenderedUserId = changedUser?.id || null;
    clear(app);
    if (changedUser) {
      const storedToken = sessionStorage.getItem('gtho_invite_token');
      if (storedToken) {
        sessionStorage.removeItem('gtho_invite_token');
        await handleInviteClaim(app, storedToken, changedUser);
      } else {
        await claimIfNoMembership(changedUser);
        showApp(app);
      }
    } else {
      showAuth(app);
    }
  });
}

function showAuth(app, inviteToken) {
  clear(app);
  if (inviteToken) {
    sessionStorage.setItem('gtho_invite_token', inviteToken);
    clearInviteHash();
    app.appendChild(el('div', {
      className: 'invite-banner',
      'data-testid': 'invite-banner',
    }, [t('members.inviteBanner')]));
  }
  renderAuthOverlay(app, () => {
    // login()/signup() already notified onAuthChange, which owns boot.
    // Fallback if that listener did not start a boot for this user.
    const user = getUser();
    if (user && user.id === lastRenderedUserId) return;
    if (user) lastRenderedUserId = user.id;
    clear(app);
    showApp(app);
  });
}

async function handleInviteClaim(app, token, user) {
  clearInviteHash();
  const membership = await lookupOperationMembership(user.id);
  const alreadyMember = membership.status === 'member';
  const result = await claimInviteByToken(token, user.id);

  if (result.success) {
    showApp(app);
    setTimeout(() => {
      const toast = el('div', { className: 'export-toast', 'data-testid': 'invite-success-toast' }, [
        t('members.welcomeToast'),
      ]);
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }, 500);
  } else if (alreadyMember) {
    showApp(app);
    setTimeout(() => {
      const toast = el('div', { className: 'export-toast', 'data-testid': 'invite-already-member-toast' }, [
        t('members.alreadyMember'),
      ]);
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }, 500);
  } else {
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

function showApp(app) {
  const gen = ++showAppGen;
  initStore();
  try {
    if (!sessionStorage.getItem('gtho_session_id')) {
      sessionStorage.setItem('gtho_session_id', crypto.randomUUID());
    }
  } catch { /* sessionStorage not available */ }

  const syncAdapter = new CustomSync();
  setSyncAdapter(syncAdapter);
  closePaddockWindowOrphans();
  migrateUnitSystemFromLocalStorage();

  // Populated cache paints immediately. An empty cache is not "new user" —
  // confirm membership and hydrate operations before the wizard (OI-0191).
  // The full pull stays fire-and-forget after paint (OI-0149).
  if (needsOnboarding()) {
    resolveEmptyStore(app, syncAdapter, gen);
    return;
  }

  if (gen !== showAppGen) return;
  paintApp(app, syncAdapter);
}

async function claimIfNoMembership(user) {
  const membership = await lookupOperationMembership(user.id);
  if (membership.status !== 'none') return membership;
  await claimPendingInviteByEmail(user.email, user.id);
  return lookupOperationMembership(user.id);
}

async function resolveEmptyStore(app, syncAdapter, gen) {
  renderBootStatus(app, t('onboarding.checkingOperation'));
  const user = getUser();
  let membership = user
    ? await lookupOperationMembership(user.id)
    : { status: 'error', error: 'No user' };
  if (gen !== showAppGen) return;

  if (membership.status === 'none' && user) {
    await claimPendingInviteByEmail(user.email, user.id);
    if (gen !== showAppGen) return;
    membership = await lookupOperationMembership(user.id);
    if (gen !== showAppGen) return;
  }

  if (membership.status === 'member') {
    await pullEntitiesStrict(['operations', 'operationMembers']);
    if (gen !== showAppGen) return;
  }

  const decision = decideBootGate({
    localOperationCount: getAll('operations').length,
    membershipStatus: membership.status,
  });

  if (decision === 'wizard') {
    clear(app);
    const onboardingContainer = el('div', { className: 'app-content' });
    app.appendChild(onboardingContainer);
    renderOnboarding(onboardingContainer, () => {
      clear(app);
      showApp(app);
    });
    return;
  }

  if (decision !== 'app') {
    renderBootBlocked(app, () => showApp(app));
    return;
  }

  paintApp(app, syncAdapter);
}

function renderBootStatus(app, message) {
  clear(app);
  app.appendChild(el('div', {
    className: 'app-content',
    'data-testid': 'boot-status',
    style: { padding: 'var(--space-6)', textAlign: 'center' },
  }, [
    el('p', {}, [message]),
  ]));
}

function renderBootBlocked(app, onRetry) {
  clear(app);
  app.appendChild(el('div', {
    className: 'app-content',
    'data-testid': 'boot-blocked',
    style: { padding: 'var(--space-6)', textAlign: 'center', maxWidth: '32rem', margin: '0 auto' },
  }, [
    el('p', {}, [t('onboarding.existingOperationUnconfirmed')]),
    el('button', {
      className: 'btn btn-green',
      type: 'button',
      'data-testid': 'boot-retry',
      style: { marginTop: 'var(--space-4)' },
      onClick: onRetry,
    }, [t('onboarding.retry')]),
  ]));
}

function paintApp(app, syncAdapter) {
  clear(app);
  const urlParams = new window.URLSearchParams(window.location.search);
  if (urlParams.has('field')) {
    setFieldMode(true);
  } else if (getFieldMode()) {
    document.body.classList.add('field-mode');
  }

  renderHeader(app);
  const content = el('main', { className: 'app-content' });
  app.appendChild(content);

  route('#/', renderDashboard);
  route('#/field', renderFieldModeHome);
  route('#/events', renderEventsScreen);
  route('#/locations', renderLocationsScreen);
  route('#/map', renderFarmMapScreen);
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
  route('#/dev', requireDev(renderDevHome));
  route('#/dev/audit', requireDev(renderEventAudit));
  route('#/dev/logs', requireDev(renderLogsViewer));
  route('#/dev/schema', requireDev(renderSchemaReadout));

  initRouter(content);

  if (typeof window !== 'undefined' && !appListenersBound) {
    appListenersBound = true;
    window.addEventListener('online', () => {
      syncAdapter.flush().then(() => pullAllRemote());
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushLoggerBuffer({ unloading: true }).catch(() => {});
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      syncAdapter.flush().then(() => pullAllRemote());
    });
    window.addEventListener('pagehide', () => {
      flushLoggerBuffer({ unloading: true }).catch(() => {});
    });
    syncAdapter.flush().then(() => pullAllRemote());
  }
}

boot();
