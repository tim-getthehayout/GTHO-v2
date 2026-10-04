/** @file Persistent PWA update bar. Not a toast. OI-0192. */

import { t } from '../i18n/i18n.js';
import { el } from '../ui/dom.js';

let bar = null;

export function showUpdateBanner({ onNow, onLater }) {
  if (bar && bar.isConnected) {
    bar._onNow = onNow;
    bar._onLater = onLater;
    return;
  }
  bar = el('div', {
    className: 'pwa-update-banner',
    'data-testid': 'pwa-update-banner',
  }, [
    el('p', { className: 'pwa-update-banner-text' }, [t('pwa.updateReady')]),
    el('div', { className: 'pwa-update-banner-actions' }, [
      el('button', {
        type: 'button',
        className: 'btn btn-green btn-sm',
        'data-testid': 'pwa-update-now',
        onClick: () => { if (bar && bar._onNow) bar._onNow(); },
      }, [t('pwa.updateNow')]),
      el('button', {
        type: 'button',
        className: 'btn btn-outline btn-sm',
        'data-testid': 'pwa-update-later',
        onClick: () => { if (bar && bar._onLater) bar._onLater(); },
      }, [t('pwa.updateLater')]),
    ]),
  ]);
  bar._onNow = onNow;
  bar._onLater = onLater;
  document.body.appendChild(bar);
}

export function hideUpdateBanner() {
  if (!bar) return;
  bar.remove();
  bar = null;
}
