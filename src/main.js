/** @file Application entry point — boot sequence per V2_APP_ARCHITECTURE.md */

import { init as initStore, setSyncAdapter } from './data/store.js';
import { closePaddockWindowOrphans } from './data/one-time-fixes.js';
import { CustomSync } from './data/custom-sync.js';
import { pullAllRemote } from './data/pull-remote.js';
import { flushLoggerBuffer } from './data/log-flush.js';
import { loadLocale } from './i18n/i18n.js';
import { route, initRouter, requireDev } from './ui/router.js';
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

async function boot() {
  await loadLocale('en');
  const app = document.getElementById('app');
  const inviteToken = extractInviteToken();
  const user = await initSession();
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
    clear(app);
    showApp(app);
  });
}

async function handleInviteClaim(app, token, user) {
  clearInviteHash();
  const alreadyMember = await userHasOperation(user.id);
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

  if (typeof window !== 'undefined') {
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
