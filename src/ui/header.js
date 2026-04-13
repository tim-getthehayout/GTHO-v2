/** @file App header with sidebar nav, mobile bottom nav, and farm name — §17.2 */

import { el } from './dom.js';
import { t } from '../i18n/i18n.js';
import { navigate } from './router.js';
import { setFieldMode } from '../utils/preferences.js';
import { getAll, subscribe } from '../data/store.js';
import { getOpenTodoCount } from '../features/todos/index.js';

/** Unsubscribe functions */
let unsubs = [];

/**
 * Render the app header + mobile bottom nav into the given container.
 * @param {HTMLElement} container
 */
export function renderHeader(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  // --- Farm name ---
  const farms = getAll('farms');
  const farmName = farms.length ? farms[0].name : t('app.name');

  // --- Sidebar nav (desktop) / horizontal nav (mobile) ---
  const todoCount = getOpenTodoCount();

  const nav = el('nav', { className: 'header-nav', 'data-testid': 'header-nav' }, [
    navLink('#/', t('nav.dashboard'), 'nav-dashboard'),
    navLink('#/events', t('nav.events'), 'nav-events'),
    navLink('#/locations', t('nav.locations'), 'nav-locations'),
    navLink('#/animals', t('nav.animals'), 'nav-animals'),
    navLink('#/feed', t('nav.feed'), 'nav-feed'),
    navLinkWithBadge('#/todos', t('nav.todos'), todoCount, 'nav-todos'),
    navLink('#/reports', t('nav.reports'), 'nav-reports'),
    navLink('#/settings', t('nav.settings'), 'nav-settings'),
  ]);

  const header = el('header', { className: 'app-header', 'data-testid': 'app-header' }, [
    el('div', { className: 'header-bar' }, [
      el('div', { className: 'header-left' }, [
        el('div', { className: 'header-title' }, [farmName]),
      ]),
      el('div', { className: 'header-right' }, [
        el('button', {
          className: 'btn btn-green btn-xs',
          'data-testid': 'header-field-mode-toggle',
          onClick: () => {
            setFieldMode(true);
            navigate('#/field');
          },
        }, [t('fieldMode.enter')]),
      ]),
    ]),
    nav,
  ]);

  container.appendChild(header);

  // --- Mobile bottom nav ---
  const bottomNav = renderBottomNav(todoCount);
  container.appendChild(bottomNav);

  // Update badge on todo changes
  unsubs.push(subscribe('todos', () => updateBadges()));
}

/**
 * Create a nav link element.
 */
function navLink(href, label, testId) {
  return el('a', { href, className: 'nav-link', 'data-testid': testId }, [label]);
}

/**
 * Create a nav link with a badge count.
 */
function navLinkWithBadge(href, label, count, testId) {
  const link = el('a', {
    href,
    className: 'nav-link nav-link-badge',
    'data-testid': testId,
  }, [label]);

  if (count > 0) {
    link.appendChild(el('span', { className: 'nav-badge', 'data-testid': 'todo-badge' }, [String(count)]));
  }

  return link;
}

/**
 * Render mobile bottom navigation — §17.2.
 */
function renderBottomNav(todoCount) {
  const items = [
    { hash: '#/', label: t('nav.home'), testId: 'bnav-home' },
    { hash: '#/animals', label: t('nav.animals'), testId: 'bnav-animals' },
    { hash: '#/todos', label: t('nav.todos'), testId: 'bnav-todos', badge: todoCount },
    { hash: '#/events', label: t('nav.events'), testId: 'bnav-events' },
    { hash: '#/locations', label: t('nav.locations'), testId: 'bnav-locations' },
    { hash: '#/feed', label: t('nav.feed'), testId: 'bnav-feed' },
    { hash: '#/settings', label: t('nav.settings'), testId: 'bnav-settings' },
  ];

  const nav = el('nav', { className: 'bottom-nav', 'data-testid': 'bottom-nav' });

  for (const item of items) {
    const btn = el('a', {
      href: item.hash,
      className: 'bnav-item',
      'data-testid': item.testId,
    }, [
      el('span', { className: 'bnav-label' }, [item.label]),
    ]);

    if (item.badge && item.badge > 0) {
      btn.appendChild(el('span', { className: 'nav-badge', 'data-testid': 'bnav-todo-badge' }, [String(item.badge)]));
    }

    nav.appendChild(btn);
  }

  return nav;
}

/**
 * Update todo badge counts in both navs.
 */
function updateBadges() {
  const count = getOpenTodoCount();

  // Desktop sidebar badge
  const desktopBadge = document.querySelector('[data-testid="todo-badge"]');
  if (desktopBadge) {
    desktopBadge.textContent = count > 0 ? String(count) : '';
    desktopBadge.style.display = count > 0 ? '' : 'none';
  } else if (count > 0) {
    // Add badge if not present
    const todosLink = document.querySelector('[data-testid="nav-todos"]');
    if (todosLink) {
      todosLink.appendChild(el('span', { className: 'nav-badge', 'data-testid': 'todo-badge' }, [String(count)]));
    }
  }

  // Mobile bottom nav badge
  const mobileBadge = document.querySelector('[data-testid="bnav-todo-badge"]');
  if (mobileBadge) {
    mobileBadge.textContent = count > 0 ? String(count) : '';
    mobileBadge.style.display = count > 0 ? '' : 'none';
  }
}
