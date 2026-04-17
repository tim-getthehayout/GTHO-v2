/* global __BUILD_STAMP__ */
/** @file App header — operation name, farm picker, sync, build stamp, user menu — GH-5 §17.2 */

import { el, clear } from './dom.js';
import { t } from '../i18n/i18n.js';
import { navigate } from './router.js';
import { setFieldMode, getFieldMode } from '../utils/preferences.js';
import { getAll, add, subscribe, getSyncAdapter, getActiveFarmId, setActiveFarm } from '../data/store.js';
import { getOpenTodoCount } from '../features/todos/index.js';
import { getUser, logout } from '../features/auth/session.js';
import { Sheet } from './sheet.js';
import * as SubmissionEntity from '../entities/submission.js';
import { getFeedbackBadgeCount } from '../features/feedback/index.js';

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

  // --- Desktop sidebar (v1 parity — SP-5) ---
  const currentHash = window.location.hash || '#/';
  const sidebar = el('aside', { className: 'dsk-sidebar', 'data-testid': 'dsk-sidebar' }, [
    // Logo block
    el('div', { className: 'dsk-logo' }, [
      el('div', { className: 'dsk-logo-icon' }, [
        el('span', { style: { fontSize: '16px', lineHeight: '1' } }, ['\uD83C\uDF3F']),
      ]),
      el('div', {}, [
        el('div', { className: 'dsk-logo-text' }, ['Get The Hay Out']),
        el('div', { className: 'dsk-logo-sub' }, [opName]),
      ]),
    ]),
    // Nav items
    el('nav', { className: 'dsk-nav', 'data-testid': 'dsk-nav' }, [
      sidebarNavItem('#/', 'Dashboard', currentHash, 'nav-dashboard'),
      sidebarNavItem('#/animals', 'Animals', currentHash, 'nav-animals'),
      sidebarNavItem('#/events', 'Rotation Calendar', currentHash, 'nav-events'),
      sidebarNavItem('#/locations', 'Locations', currentHash, 'nav-locations'),
      sidebarNavItem('#/feed', 'Feed', currentHash, 'nav-feed'),
      sidebarNavItemBadge('#/todos', 'Tasks', todoCount, currentHash, 'nav-todos'),
      sidebarNavItem('#/reports', 'Reports', currentHash, 'nav-reports'),
      sidebarNavItem('#/settings', 'Settings', currentHash, 'nav-settings'),
      sidebarNavItemBadge('#/feedback', '\uD83D\uDCAC Feedback', getFeedbackBadgeCount(), currentHash, 'nav-feedback'),
    ]),
    // Sync status strip
    renderSyncStrip(),
  ]);

  // Old nav (still used for mobile via CSS)
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
      // Left cluster: farm picker only (SP-5 — app name moved to sidebar)
      el('div', { className: 'header-left' }, [
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
        renderFieldModePill(),
        el('button', {
          className: 'header-user-btn',
          'data-testid': 'header-user-menu',
          onClick: (e) => toggleUserMenu(e, email),
        }, [initials]),
      ].filter(Boolean)),
    ]),
    // SP-6: Feedback & Help sub-row
    el('div', {
      className: 'header-sub-row',
      style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '0 12px 4px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' },
    }, [
      el('button', {
        className: 'btn btn-outline btn-xs',
        style: { fontSize: '11px', fontWeight: '500', padding: '3px 10px' },
        'data-testid': 'header-feedback-btn',
        onClick: () => openFeedbackSheet('feedback', operations[0]?.id),
      }, ['\uD83D\uDCAC Feedback']),
      el('button', {
        className: 'btn btn-outline btn-xs',
        style: { fontSize: '11px', fontWeight: '500', padding: '3px 10px' },
        'data-testid': 'header-help-btn',
        onClick: () => openFeedbackSheet('support', operations[0]?.id),
      }, ['\uD83C\uDD98 Get Help']),
    ]),
    nav,
  ]);

  container.appendChild(sidebar);
  container.appendChild(header);

  // --- Mobile bottom nav ---
  const bottomNav = renderBottomNav(todoCount);
  container.appendChild(bottomNav);

  // Update badge on todo changes
  unsubs.push(subscribe('todos', () => updateBadges()));

  // Update field mode pill on route changes
  const pillContainer = header.querySelector('[data-testid="header-field-mode-toggle"]')?.parentElement;
  const updatePill = () => {
    const oldPill = header.querySelector('[data-testid="header-field-mode-toggle"]');
    if (oldPill && pillContainer) {
      const newPill = renderFieldModePill();
      oldPill.replaceWith(newPill);
    }
  };
  window.addEventListener('hashchange', updatePill);
  unsubs.push(() => window.removeEventListener('hashchange', updatePill));
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
  return el('a', {
    href,
    className: 'nav-link',
    'data-testid': testId,
    onClick: (e) => { e.preventDefault(); navigate(href); },
  }, [label]);
}

function navLinkWithBadge(href, label, count, testId) {
  const link = el('a', {
    href,
    className: 'nav-link nav-link-badge',
    'data-testid': testId,
    onClick: (e) => { e.preventDefault(); navigate(href); },
  }, [label]);
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
    const btn = el('a', {
      href: item.hash,
      className: 'bnav-item',
      'data-testid': item.testId,
      onClick: (e) => { e.preventDefault(); navigate(item.hash); },
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

// ---------------------------------------------------------------------------
// Field mode pill (SP-8)
// ---------------------------------------------------------------------------

function renderFieldModePill() {
  const isFieldMode = getFieldMode();
  const isFieldHome = (window.location.hash || '#/') === '#/field';

  let pillText, pillClass, pillHandler;

  if (!isFieldMode) {
    pillText = '\u229E Field';
    pillClass = 'btn btn-outline btn-xs';
    pillHandler = () => {
      window.sessionStorage.setItem('gtho_field_mode_return', window.location.hash || '#/');
      setFieldMode(true);
      navigate('#/field');
    };
  } else if (isFieldHome) {
    pillText = '\u2190 Detail';
    pillClass = 'btn btn-green btn-xs';
    pillHandler = () => {
      setFieldMode(false);
      const returnTo = window.sessionStorage.getItem('gtho_field_mode_return') || '#/';
      window.sessionStorage.removeItem('gtho_field_mode_return');
      // Navigate to a blank hash first to force the router to re-render
      // even if returnTo matches current hash (e.g., both #/)
      navigate('');
      setTimeout(() => navigate(returnTo), 10);
    };
  } else {
    pillText = '\u2302 Home';
    pillClass = 'btn btn-green btn-xs';
    pillHandler = () => navigate('#/field');
  }

  return el('button', {
    className: pillClass,
    'data-testid': 'header-field-mode-toggle',
    onClick: pillHandler,
  }, [pillText]);
}

// ---------------------------------------------------------------------------
// Sidebar nav helpers (SP-5)
// ---------------------------------------------------------------------------

function sidebarNavItem(href, label, currentHash, testId) {
  const isActive = currentHash === href || (href !== '#/' && currentHash.startsWith(href));
  return el('button', {
    className: `dsk-nav-item${isActive ? ' active' : ''}`,
    'data-testid': testId,
    onClick: () => navigate(href),
  }, [label]);
}

function sidebarNavItemBadge(href, label, count, currentHash, testId) {
  const isActive = currentHash === href || currentHash.startsWith(href);
  const children = [label];
  if (count > 0) children.push(el('span', { className: 'dsk-nav-badge' }, [String(count)]));
  return el('button', {
    className: `dsk-nav-item${isActive ? ' active' : ''}`,
    'data-testid': testId,
    onClick: () => navigate(href),
  }, children);
}

function renderSyncStrip() {
  const adapter = getSyncAdapter();
  let status;
  try { status = adapter ? adapter.getStatus() : 'offline'; } catch { status = 'offline'; }
  const dotClass = { idle: 'sync-ok', syncing: 'sync-pending', error: 'sync-err', offline: 'sync-off' }[status] || 'sync-off';
  const label = { idle: 'Synced', syncing: 'Syncing...', error: 'Sync error', offline: 'Offline' }[status] || 'Offline';
  const now = new Date();
  const timeStr = status === 'idle' ? ` ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';

  return el('div', { className: 'dsk-sync-strip', onClick: () => navigate('#/settings') }, [
    el('span', { className: `sync-dot ${dotClass}` }),
    el('span', {}, [`${label}${timeStr}`]),
  ]);
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

// ---------------------------------------------------------------------------
// Feedback & Help sheet (SP-6)
// ---------------------------------------------------------------------------

let feedbackSheet = null;

function ensureFeedbackSheetDOM() {
  if (document.getElementById('fb-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'fb-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => feedbackSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'fb-sheet-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

function getScreenFromHash() {
  const hash = window.location.hash || '#/';
  const map = { '#/': 'dashboard', '#/animals': 'animals', '#/events': 'rotation-calendar', '#/locations': 'locations', '#/feed': 'feed', '#/todos': 'todos', '#/reports': 'reports', '#/settings': 'settings', '#/field': 'field-mode' };
  return map[hash.split('?')[0]] || 'other';
}

function openFeedbackSheet(type, operationId) {
  ensureFeedbackSheetDOM();
  if (!feedbackSheet) feedbackSheet = new Sheet('fb-sheet-wrap');
  const panel = document.getElementById('fb-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const isFeedback = type === 'feedback';
  const title = isFeedback ? 'Leave feedback' : 'Get help';
  const placeholder = isFeedback ? 'What did you notice? What did you expect?' : 'Describe what you need help with\u2026';

  const screen = getScreenFromHash();
  let selectedCategory = null;

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, [title]));

  // Context tag
  panel.appendChild(el('div', { className: 'ctx-tag', style: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' } }, [screen]));

  // Category pills
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' } }, ['Category']));
  const categories = [
    { key: 'roadblock', label: '\uD83D\uDEA7 Roadblock', cls: 'cp-roadblock' },
    { key: 'bug', label: 'Bug', cls: 'cp-bug' },
    { key: 'ux', label: 'UX friction', cls: 'cp-ux' },
    { key: 'feature', label: 'Missing feature', cls: 'cp-feature' },
    { key: 'calc', label: 'Calculation', cls: 'cp-calc' },
    { key: 'idea', label: 'Idea', cls: 'cp-idea' },
    { key: 'question', label: 'Question', cls: 'cp-question' },
  ];
  const pillsEl = el('div', { className: 'cat-pills', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' } });

  function renderPills() {
    clear(pillsEl);
    for (const cat of categories) {
      const isActive = selectedCategory === cat.key;
      pillsEl.appendChild(el('button', {
        type: 'button',
        className: `cat-pill ${cat.cls}${isActive ? ' sel' : ''}`,
        style: { padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: cat.key === 'roadblock' ? '700' : '500', cursor: 'pointer', border: '0.5px solid var(--border2)', background: 'transparent', color: 'var(--text2)' },
        onClick: () => { selectedCategory = cat.key; renderPills(); },
      }, [cat.label]));
    }
  }
  renderPills();
  panel.appendChild(pillsEl);

  // Area dropdown
  const areaSelect = el('select', {}, [
    el('option', { value: '' }, ['\u2014 pick area \u2014']),
    ...['dashboard', 'animals', 'rotation-calendar', 'locations', 'feed', 'harvest', 'field-mode', 'reports', 'todos', 'settings', 'sync', 'other'].map(a =>
      el('option', { value: a, selected: a === screen }, [a.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())])),
  ]);
  panel.appendChild(el('div', { className: 'field', style: { marginTop: '10px' } }, [el('label', {}, ['Area']), areaSelect]));

  // Priority (Get Help only)
  let prioritySelect = null;
  if (!isFeedback) {
    prioritySelect = el('select', {}, [
      el('option', { value: 'normal' }, ['Normal']),
      el('option', { value: 'high' }, ['High \u2014 blocking my work']),
      el('option', { value: 'urgent' }, ['Urgent \u2014 data at risk']),
      el('option', { value: 'low' }, ['Low \u2014 when you get a chance']),
    ]);
    panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Priority']), prioritySelect]));
  }

  // Note
  const noteTextarea = el('textarea', { placeholder, style: { width: '100%', minHeight: '80px', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' } });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Note']), noteTextarea]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  // Buttons
  panel.appendChild(el('div', { className: 'btn-row' }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      if (!selectedCategory) { statusEl.appendChild(el('span', {}, ['Select a category'])); return; }
      if (!noteTextarea.value.trim()) { statusEl.appendChild(el('span', {}, ['Note is required'])); return; }
      try {
        const user = getUser();
        const rec = SubmissionEntity.create({
          operationId, submitterId: user?.id || null,
          type, category: selectedCategory,
          area: areaSelect.value || null, screen,
          priority: prioritySelect?.value || 'normal',
          note: noteTextarea.value.trim(),
          version: typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev',
        });
        add('submissions', rec, SubmissionEntity.validate, SubmissionEntity.toSupabaseShape, 'submissions');
        feedbackSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save note']),
    el('button', { className: 'btn btn-outline', onClick: () => feedbackSheet.close() }, ['Cancel']),
  ]));

  feedbackSheet.open();
}
