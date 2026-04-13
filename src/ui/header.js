/** @file App header with nav links and field mode toggle */

import { el } from './dom.js';
import { t } from '../i18n/i18n.js';
import { navigate } from './router.js';
import { setFieldMode } from '../utils/preferences.js';

/**
 * Render the app header into the given container.
 * @param {HTMLElement} container
 */
export function renderHeader(container) {
  const nav = el('nav', { className: 'header-nav' }, [
    el('a', { href: '#/', className: 'nav-link' }, [t('nav.dashboard')]),
    el('a', { href: '#/events', className: 'nav-link' }, [t('nav.events')]),
    el('a', { href: '#/locations', className: 'nav-link' }, [t('nav.locations')]),
    el('a', { href: '#/animals', className: 'nav-link' }, [t('nav.animals')]),
    el('a', { href: '#/feed', className: 'nav-link' }, [t('nav.feed')]),
    el('a', { href: '#/reports', className: 'nav-link' }, [t('nav.reports')]),
    el('a', { href: '#/settings', className: 'nav-link' }, [t('nav.settings')]),
  ]);

  const header = el('header', { className: 'app-header' }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('div', { className: 'header-title' }, [t('app.name')]),
      el('button', {
        className: 'btn btn-green btn-xs',
        'data-testid': 'header-field-mode-toggle',
        onClick: () => {
          setFieldMode(true);
          navigate('#/field');
        },
      }, [t('fieldMode.enter')]),
    ]),
    nav,
  ]);

  container.appendChild(header);
}
