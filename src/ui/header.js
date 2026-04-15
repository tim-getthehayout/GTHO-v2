/* global __BUILD_STAMP__ */
/** @file App header — operation name, farm picker, sync, build stamp, user menu — GH-5 §17.2 */

import { el, clear } from './dom.js';
import { t } from '../i18n/i18n.js';
import { navigate } from './router.js';
import { setFieldMode } from '../utils/preferences.js';
import { getAll, subscribe, getSyncAdapter, getActiveFarmId, setActiveFarm } from '../data/store.js';
import { getOpenTodoCount } from '../features/todos/index.js';
import { getUser, logout } from '../features/auth/session.js';

/** Unsubscribe functions */
let unsubs = [];

/**
 * Render the app header + mobile bottom nav into the given container.
 * @param {HTMLElement} container
 */
export function renderHeader(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  const opName = operations.length ? operations[0].name : t('app.name');

  const farms = getAll('farms');
  const activeFarmId = getActiveFarmId();
  const activeFarm = activeFarmId ? farms.find(f => f.id === activeFarmId) : null;
  const farmLabel = activeFarm ? activeFarm.name : t('header.allFarms');
  const isMultiFarm = farms.length > 1;

  const todoCount = getOpenTodoCount();

  // --- Sidebar nav ---
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

  // --- Build stamp ---
  const buildVersion = (typeof __BUILD_STAMP__ !== 'undefined' && __BUILD_STAMP__ !== 'dev')
    ? __BUILD_STAMP__
    : (typeof document !== 'undefined' ? document.querySelector('meta[name="app-version"]')?.content || 'dev' : 'dev');

  // --- User initials ---
  const user = getUser();
  const email = user?.email || '';
  const initials = email ? email.slice(0, 2).toUpperCase() : '?';

  const header = el('header', { className: 'app-header', 'data-testid': 'app-header' }, [
    el('div', { className: 'header-bar' }, [
      // Left cluster: app name + operation name + farm picker
      el('div', { className: 'header-left' }, [
        el('div', { className: 'header-app-name', 'data-testid': 'header-app-name' }, [t('app.name')]),
        el('div', { className: 'header-op-name', 'data-testid': 'header-op-name' }, [opName]),
        isMultiFarm
          ? el('button', {
              className: `header-farm-picker ${!activeFarm ? 'header-farm-all' : ''}`,
              'data-testid': 'header-farm-picker',
              onClick: () => openFarmPicker(farms, container),
            }, [farmLabel, ' \u25BE'])
          : el('div', { className: 'header-farm-label', 'data-testid': 'header-farm-label' }, [farmLabel]),
      ]),
      // Right cluster: sync → build stamp → field mode → user menu
      el('div', { className: 'header-right' }, [
        renderSyncIndicator(),
        el('span', { className: 'header-build-stamp', 'data-testid': 'header-build-stamp' }, [buildVersion]),
        el('button', {
          className: 'btn btn-green btn-xs',
          'data-testid': 'header-field-mode-toggle',
          onClick: () => {
            setFieldMode(true);
            navigate('#/field');
          },
        }, [t('fieldMode.enter')]),
        el('button', {
          className: 'header-user-btn',
          'data-testid': 'header-user-menu',
          onClick: (e) => toggleUserMenu(e, email),
        }, [initials]),
      ].filter(Boolean)),
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

// ---------------------------------------------------------------------------
// Farm picker
// ---------------------------------------------------------------------------

function openFarmPicker(farms, rootContainer) {
  // Remove existing picker if open
  closeFarmPicker();

  const activeFarmId = getActiveFarmId();

  const overlay = el('div', { className: 'farm-picker-overlay', 'data-testid': 'farm-picker-overlay', onClick: closeFarmPicker });
  const menu = el('div', { className: 'farm-picker-menu', 'data-testid': 'farm-picker-menu' }, [
    el('div', { className: 'farm-picker-title' }, [t('header.switchFarm')]),
    // "All farms" option
    el('button', {
      className: `farm-picker-row ${!activeFarmId ? 'farm-picker-active' : ''}`,
      'data-testid': 'farm-picker-all',
      onClick: () => { setActiveFarm(null); closeFarmPicker(); rerenderApp(rootContainer); },
    }, [
      t('header.allFarms'),
      !activeFarmId ? ' \u2713' : '',
    ]),
    // Individual farms
    ...farms.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(farm =>
      el('button', {
        className: `farm-picker-row ${farm.id === activeFarmId ? 'farm-picker-active' : ''}`,
        'data-testid': `farm-picker-${farm.id}`,
        onClick: () => { setActiveFarm(farm.id); closeFarmPicker(); rerenderApp(rootContainer); },
      }, [
        farm.name,
        farm.id === activeFarmId ? ' \u2713' : '',
      ])
    ),
  ]);

  document.body.appendChild(overlay);
  document.body.appendChild(menu);
}

function closeFarmPicker() {
  document.querySelector('.farm-picker-overlay')?.remove();
  document.querySelector('.farm-picker-menu')?.remove();
}

function rerenderApp(rootContainer) {
  // Trigger a hash change to force re-render of the current route
  const hash = window.location.hash || '#/';
  window.location.hash = '';
  setTimeout(() => { window.location.hash = hash; }, 0);
}

// ---------------------------------------------------------------------------
// User menu popover
// ---------------------------------------------------------------------------

function toggleUserMenu(e, email) {
  const existing = document.querySelector('.user-menu-popover');
  if (existing) { existing.remove(); document.querySelector('.user-menu-backdrop')?.remove(); return; }

  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();

  const backdrop = el('div', { className: 'user-menu-backdrop', onClick: closeUserMenu });

  const adapter = getSyncAdapter();
  let hasUnsyncedWrites = false;
  try { hasUnsyncedWrites = adapter && adapter.getQueueLength && adapter.getQueueLength() > 0; } catch { /* ignore */ }

  const popover = el('div', {
    className: 'user-menu-popover',
    'data-testid': 'user-menu-popover',
    style: { top: `${rect.bottom + 4}px`, right: `${window.innerWidth - rect.right}px` },
  }, [
    el('div', { className: 'user-menu-email' }, [email || '—']),
    el('div', { className: 'user-menu-divider' }),
    el('button', {
      className: 'user-menu-row user-menu-logout',
      'data-testid': 'user-menu-logout',
      onClick: () => {
        if (hasUnsyncedWrites) {
          if (!window.confirm(t('header.logoutConfirm'))) return;
        }
        setFieldMode(false);
        closeUserMenu();
        logout();
      },
    }, [t('auth.logout')]),
  ]);

  document.body.appendChild(backdrop);
  document.body.appendChild(popover);
}

function closeUserMenu() {
  document.querySelector('.user-menu-popover')?.remove();
  document.querySelector('.user-menu-backdrop')?.remove();
}

// ---------------------------------------------------------------------------
// Sync indicator
// ---------------------------------------------------------------------------

function renderSyncIndicator() {
  const adapter = getSyncAdapter();
  let status;
  try { status = adapter ? adapter.getStatus() : 'offline'; } catch { status = 'offline'; }

  const dotClass = {
    idle: 'sync-ok', syncing: 'sync-pending', error: 'sync-err', offline: 'sync-off',
  }[status] || 'sync-off';

  return el('button', {
    className: 'header-sync-btn',
    'data-testid': 'header-sync-status',
    title: status,
    onClick: () => navigate('#/settings'),
  }, [el('span', { className: `sync-dot ${dotClass}` })]);
}

// ---------------------------------------------------------------------------
// Nav helpers
// ---------------------------------------------------------------------------

function navLink(href, label, testId) {
  return el('a', { href, className: 'nav-link', 'data-testid': testId }, [label]);
}

function navLinkWithBadge(href, label, count, testId) {
  const link = el('a', { href, className: 'nav-link nav-link-badge', 'data-testid': testId }, [label]);
  if (count > 0) {
    link.appendChild(el('span', { className: 'nav-badge', 'data-testid': 'todo-badge' }, [String(count)]));
  }
  return link;
}

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
    const btn = el('a', { href: item.hash, className: 'bnav-item', 'data-testid': item.testId }, [
      el('span', { className: 'bnav-label' }, [item.label]),
    ]);
    if (item.badge && item.badge > 0) {
      btn.appendChild(el('span', { className: 'nav-badge', 'data-testid': 'bnav-todo-badge' }, [String(item.badge)]));
    }
    nav.appendChild(btn);
  }
  return nav;
}

function updateBadges() {
  const count = getOpenTodoCount();
  const desktopBadge = document.querySelector('[data-testid="todo-badge"]');
  if (desktopBadge) {
    desktopBadge.textContent = count > 0 ? String(count) : '';
    desktopBadge.style.display = count > 0 ? '' : 'none';
  } else if (count > 0) {
    const todosLink = document.querySelector('[data-testid="nav-todos"]');
    if (todosLink) {
      todosLink.appendChild(el('span', { className: 'nav-badge', 'data-testid': 'todo-badge' }, [String(count)]));
    }
  }
  const mobileBadge = document.querySelector('[data-testid="bnav-todo-badge"]');
  if (mobileBadge) {
    mobileBadge.textContent = count > 0 ? String(count) : '';
    mobileBadge.style.display = count > 0 ? '' : 'none';
  }
}
