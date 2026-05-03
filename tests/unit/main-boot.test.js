/** @file OI-0149 — boot-ordering invariant.
 *
 * `showApp()` must register routes + render the header + call
 * `initRouter(content)` BEFORE `adapter.pullAll(...)` resolves. The cold-boot
 * pull is fire-and-forget; first paint is unblocked. Mocks the heavy deps
 * imported by `src/main.js` and dynamically imports it so `boot()` runs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const events = [];
function record(name, payload) {
  events.push({ name, at: Date.now(), payload });
}

// Adapter.pullAll resolution is gated on this deferred, so the test can
// assert that `route('#/', ...)` and `initRouter(content)` happened before
// the pull actually completed.
let resolvePull;
const pullPending = new Promise((resolve) => { resolvePull = resolve; });

const fakeUser = { id: 'user-1', email: 'tim@example.com' };

function setupMocks() {
  // Router — capture route(...) registrations and the initRouter(content) call.
  vi.doMock('../../src/ui/router.js', () => {
    const routes = {};
    return {
      route: (hash, fn) => { routes[hash] = fn; record('route', { hash, fnName: fn?.name || null }); },
      initRouter: (container) => { record('initRouter', { hasContainer: !!container }); },
      navigate: vi.fn(),
      getRoutes: () => Object.keys(routes),
      requireDev: (fn) => fn,
    };
  });

  // pullAllRemote — block on the test-controlled deferred so we can interleave
  // assertions before the pull settles.
  vi.doMock('../../src/data/pull-remote.js', () => ({
    pullAllRemote: () => {
      record('pullAllRemote.invoked');
      return pullPending.then((result) => {
        record('pullAllRemote.resolved');
        return result;
      });
    },
    getLastPulledAt: () => null,
  }));

  // CustomSync — its flush() is awaited inside the `.then(() => pullAllRemote())`
  // chain. Resolve immediately so the chain reaches pullAllRemote.
  vi.doMock('../../src/data/custom-sync.js', () => ({
    CustomSync: class {
      flush() { record('syncAdapter.flush'); return Promise.resolve(); }
      isOnline() { return Promise.resolve(true); }
      getStatus() { return 'sync-ok'; }
    },
  }));

  // Store — no-op the side effects, capture init().
  vi.doMock('../../src/data/store.js', () => ({
    init: () => record('initStore'),
    setSyncAdapter: () => {},
    getSyncAdapter: () => null,
    mergeRemote: () => {},
    isCurrentUserDev: () => false,
    getOperation: () => null,
    subscribe: () => () => {},
  }));

  vi.doMock('../../src/data/one-time-fixes.js', () => ({
    closePaddockWindowOrphans: () => {},
  }));

  vi.doMock('../../src/i18n/i18n.js', () => ({
    loadLocale: () => Promise.resolve(),
    t: (key) => key,
  }));

  vi.doMock('../../src/features/auth/session.js', () => ({
    initSession: () => Promise.resolve(fakeUser),
    onAuthChange: () => {},
  }));

  vi.doMock('../../src/features/auth/index.js', () => ({
    renderAuthOverlay: () => {},
  }));

  vi.doMock('../../src/features/auth/invite-claim.js', () => ({
    extractInviteToken: () => null,
    clearInviteHash: () => {},
    claimInviteByToken: () => Promise.resolve({ success: true }),
    claimPendingInviteByEmail: () => Promise.resolve(),
    userHasOperation: () => Promise.resolve(true),
  }));

  vi.doMock('../../src/features/onboarding/index.js', () => ({
    needsOnboarding: () => false,
    renderOnboarding: () => {},
  }));

  vi.doMock('../../src/ui/header.js', () => ({
    renderHeader: () => record('renderHeader'),
  }));

  vi.doMock('../../src/utils/preferences.js', () => ({
    getFieldMode: () => false,
    setFieldMode: () => {},
    migrateUnitSystemFromLocalStorage: () => {},
  }));

  // Feature renderers — no-op stubs (route registration just needs the symbol).
  const rendererStub = () => {};
  vi.doMock('../../src/features/dashboard/index.js', () => ({ renderDashboard: rendererStub }));
  vi.doMock('../../src/features/events/index.js', () => ({ renderEventsScreen: rendererStub }));
  vi.doMock('../../src/features/locations/index.js', () => ({ renderLocationsScreen: rendererStub }));
  vi.doMock('../../src/features/feed/index.js', () => ({ renderFeedScreen: rendererStub }));
  vi.doMock('../../src/features/animals/index.js', () => ({ renderAnimalsScreen: rendererStub }));
  vi.doMock('../../src/features/reports/index.js', () => ({ renderReportsScreen: rendererStub }));
  vi.doMock('../../src/features/settings/index.js', () => ({ renderSettingsScreen: rendererStub }));
  vi.doMock('../../src/features/todos/index.js', () => ({ renderTodosScreen: rendererStub }));
  vi.doMock('../../src/features/surveys/index.js', () => ({ renderSurveysScreen: rendererStub }));
  vi.doMock('../../src/features/field-mode/index.js', () => ({ renderFieldModeHome: rendererStub }));
  vi.doMock('../../src/features/amendments/soil-tests.js', () => ({ renderSoilTestsScreen: rendererStub }));
  vi.doMock('../../src/features/amendments/entry.js', () => ({ renderAmendmentsScreen: rendererStub }));
  vi.doMock('../../src/features/amendments/manure.js', () => ({ renderManureScreen: rendererStub }));
  vi.doMock('../../src/features/amendments/npk-prices.js', () => ({ renderNpkPricesScreen: rendererStub }));
  vi.doMock('../../src/features/harvest/index.js', () => ({ renderHarvestScreen: rendererStub }));
  vi.doMock('../../src/features/feedback/index.js', () => ({ renderFeedbackScreen: rendererStub }));
  vi.doMock('../../src/features/feed/quality.js', () => ({ renderFeedQualityScreen: rendererStub }));
  vi.doMock('../../src/features/dev-mode/index.js', () => ({ renderDevHome: rendererStub }));
  vi.doMock('../../src/features/dev-mode/audit.js', () => ({ renderEventAudit: rendererStub }));
  vi.doMock('../../src/features/dev-mode/logs.js', () => ({ renderLogsViewer: rendererStub }));
  vi.doMock('../../src/features/dev-mode/schema.js', () => ({ renderSchemaReadout: rendererStub }));

  // Calc registries — side-effect imports; safe to no-op.
  vi.doMock('../../src/calcs/core.js', () => ({}));
  vi.doMock('../../src/calcs/feed-forage.js', () => ({}));
  vi.doMock('../../src/calcs/advanced.js', () => ({}));
  vi.doMock('../../src/calcs/capacity.js', () => ({}));
  vi.doMock('../../src/calcs/survey-bale-ring.js', () => ({}));
}

describe('main.js boot ordering — OI-0149', () => {
  beforeEach(() => {
    events.length = 0;
    vi.resetModules();
    setupMocks();
    // Fresh #app element so renderHeader/initRouter have somewhere to write.
    document.body.innerHTML = '<div id="app"></div>';
    window.location.hash = '#/';
  });

  it('registers route("#/", renderDashboard) and calls initRouter(content) BEFORE adapter.pullAll(...) resolves', async () => {
    // Dynamically import main.js — boot() runs synchronously at module bottom.
    await import('../../src/main.js');

    // Drain the microtask queue so boot() reaches its post-auth showApp(app)
    // call and showApp finishes synchronously (now non-async per OI-0149).
    for (let i = 0; i < 30; i++) await Promise.resolve();

    // BEFORE we resolve the pull, the route map and initRouter must already
    // be in place. This is the load-bearing assertion: paint precedes pull.
    const routeNames = events.filter(e => e.name === 'route').map(e => e.payload.hash);
    expect(routeNames).toContain('#/');
    expect(events.find(e => e.name === 'initRouter')).toBeTruthy();

    // pullAllRemote was invoked but has NOT yet resolved.
    expect(events.find(e => e.name === 'pullAllRemote.invoked')).toBeTruthy();
    expect(events.find(e => e.name === 'pullAllRemote.resolved')).toBeFalsy();

    // Indices: every route(...) AND initRouter must come before
    // pullAllRemote.resolved in the event log.
    const idxRouteRoot = events.findIndex(e => e.name === 'route' && e.payload.hash === '#/');
    const idxInitRouter = events.findIndex(e => e.name === 'initRouter');
    const idxPullInvoked = events.findIndex(e => e.name === 'pullAllRemote.invoked');
    expect(idxRouteRoot).toBeGreaterThanOrEqual(0);
    expect(idxInitRouter).toBeGreaterThan(idxRouteRoot);
    expect(idxPullInvoked).toBeGreaterThan(idxInitRouter);

    // Now release the pull and confirm it resolves cleanly without altering
    // the prior ordering.
    resolvePull({ pulled: 0, errors: 0 });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const idxPullResolved = events.findIndex(e => e.name === 'pullAllRemote.resolved');
    expect(idxPullResolved).toBeGreaterThan(idxInitRouter);
  });

  it('renderHeader runs before initRouter (header in place before first paint of route content)', async () => {
    await import('../../src/main.js');
    for (let i = 0; i < 30; i++) await Promise.resolve();

    const idxHeader = events.findIndex(e => e.name === 'renderHeader');
    const idxInitRouter = events.findIndex(e => e.name === 'initRouter');
    expect(idxHeader).toBeGreaterThanOrEqual(0);
    expect(idxInitRouter).toBeGreaterThan(idxHeader);

    resolvePull({ pulled: 0, errors: 0 });
  });
});
