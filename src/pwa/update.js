/* global __BUILD_STAMP__ */
/** @file PWA registration and the update decision. OI-0192. */

import { logger } from '../utils/logger.js';
import { hideUpdateBanner, showUpdateBanner } from './banner.js';

const ACCEPT_KEY = 'gtho_pwa_update_accepted';

/**
 * Decide whether to show the update bar, and which apply path it uses.
 * @param {{ localStamp: string, remoteStamp: string|null, hasWaitingWorker: boolean, updateDismissed: boolean, isDev: boolean }} input
 * @returns {'none'|'apply-worker'|'reload-document'}
 */
export function decideUpdateAction({
  localStamp,
  remoteStamp,
  hasWaitingWorker,
  updateDismissed,
  isDev,
}) {
  if (isDev) return 'none';
  if (updateDismissed) return 'none';
  if (hasWaitingWorker) return 'apply-worker';
  if (typeof remoteStamp === 'string' && remoteStamp.length > 0 && remoteStamp !== localStamp) {
    return 'reload-document';
  }
  return 'none';
}

function readLocalStamp() {
  return typeof __BUILD_STAMP__ === 'undefined' ? 'dev' : __BUILD_STAMP__;
}

let started = false;
let updateDismissed = false;
let reloadedForUpdate = false;
let registration = null;
let remoteStamp = null;

function waitingWorkerReady() {
  return !!(registration && registration.waiting && navigator.serviceWorker.controller);
}

async function pollRemoteStamp(base) {
  try {
    const res = await fetch(base + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || typeof body.stamp !== 'string' || body.stamp.length === 0) return null;
    return body.stamp;
  } catch {
    // A failed poll is not a banner. The waiting worker is the other signal.
    return null;
  }
}

function evaluate() {
  const action = decideUpdateAction({
    localStamp: readLocalStamp(),
    remoteStamp,
    hasWaitingWorker: waitingWorkerReady(),
    updateDismissed,
    isDev: readLocalStamp() === 'dev',
  });
  if (action === 'none') {
    hideUpdateBanner();
    return;
  }
  const stampForReload = remoteStamp;
  showUpdateBanner({
    onNow: () => applyUpdate(action, stampForReload),
    onLater: () => {
      updateDismissed = true;
      hideUpdateBanner();
    },
  });
}

async function checkForUpdate() {
  if (!registration) return;
  try {
    await registration.update();
  } catch {
    // Offline or a failed update check. The poll below still runs.
  }
  remoteStamp = await pollRemoteStamp(import.meta.env.BASE_URL);
  evaluate();
}

function applyUpdate(action, stampForReload) {
  try {
    sessionStorage.setItem(ACCEPT_KEY, '1');
  } catch {
    // sessionStorage can throw in private mode. The replace path still runs.
  }
  if (action === 'apply-worker') {
    const worker = registration && registration.waiting;
    if (worker) worker.postMessage('SKIP_WAITING');
    return;
  }
  if (action === 'reload-document' && stampForReload) {
    const url = new URL(window.location.href);
    url.searchParams.delete('update');
    url.searchParams.set('update', stampForReload);
    window.location.replace(url.pathname + url.search + url.hash);
  }
}

/**
 * Register the worker and start update checks. Not awaited by boot.
 * No-op when the baked stamp is `dev`, or when the page has no service worker.
 */
export function initPwa() {
  if (started) return;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (readLocalStamp() === 'dev') return;
  if (!('serviceWorker' in navigator)) return;
  started = true;

  // clients.claim() on the first activate also fires controllerchange.
  // Reload only after Update now set the session flag, and only once.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return;
    let accepted = false;
    try {
      accepted = sessionStorage.getItem(ACCEPT_KEY) === '1';
    } catch {
      // sessionStorage unavailable: leave accepted false so claim() cannot reload.
    }
    if (!accepted) return;
    reloadedForUpdate = true;
    try {
      sessionStorage.removeItem(ACCEPT_KEY);
    } catch {
      // Clearing the flag is what stops the next page from reloading again.
    }
    window.location.reload();
  });

  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker.register(base + 'sw.js', { scope: base })
    .then((reg) => {
      registration = reg;
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            evaluate();
          }
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        updateDismissed = false;
        checkForUpdate();
      });
      window.addEventListener('pageshow', () => {
        updateDismissed = false;
        checkForUpdate();
      });
      checkForUpdate();
    })
    .catch((err) => {
      logger.error('pwa', 'service worker registration failed', { error: String(err && err.message ? err.message : err) });
    });
}
