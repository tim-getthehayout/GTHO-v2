/** @file Field mode home screen — CP-34. V2_UX_FLOWS.md §16. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, subscribe } from '../../data/store.js';
import { setFieldMode } from '../../utils/preferences.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { navigate } from '../../ui/router.js';

let unsubs = [];

/**
 * Render the field mode home screen.
 * @param {HTMLElement} container
 */
export function renderFieldModeHome(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const screenEl = el('div', { 'data-testid': 'field-mode-screen' }, [
    // Field mode header
    renderFieldModeHeader(true),

    // Action tiles
    el('div', { className: 'field-mode-tiles', style: { marginTop: 'var(--space-5)' } }, [
      el('button', {
        className: 'field-mode-tile',
        'data-testid': 'field-mode-tile-feed',
        onClick: () => navigate('#/events'),
      }, [
        el('div', { className: 'field-mode-tile-icon' }, ['\uD83C\uDF3E']),
        t('fieldMode.feedAnimals'),
      ]),
      el('button', {
        className: 'field-mode-tile',
        'data-testid': 'field-mode-tile-harvest',
        onClick: () => navigate('#/feed'),
      }, [
        el('div', { className: 'field-mode-tile-icon' }, ['\uD83D\uDE9C']),
        t('fieldMode.harvest'),
      ]),
      el('button', {
        className: 'field-mode-tile',
        'data-testid': 'field-mode-tile-survey',
        onClick: () => navigate('#/surveys'),
      }, [
        el('div', { className: 'field-mode-tile-icon' }, ['\uD83D\uDCCB']),
        t('fieldMode.survey'),
      ]),
      el('button', {
        className: 'field-mode-tile',
        'data-testid': 'field-mode-tile-animals',
        onClick: () => navigate('#/animals'),
      }, [
        el('div', { className: 'field-mode-tile-icon' }, ['\uD83D\uDC04']),
        t('fieldMode.animals'),
      ]),
    ]),

    // Active events section
    el('div', { 'data-testid': 'field-mode-events' }),

    // Tasks section
    el('div', { 'data-testid': 'field-mode-tasks' }),
  ]);

  container.appendChild(screenEl);
  renderActiveEvents(container);
  renderTasks(container);

  unsubs.push(subscribe('events', () => renderActiveEvents(container)));
  unsubs.push(subscribe('eventPaddockWindows', () => renderActiveEvents(container)));
  unsubs.push(subscribe('eventGroupWindows', () => renderActiveEvents(container)));
  unsubs.push(subscribe('todos', () => renderTasks(container)));
}

/**
 * Render the field mode header.
 * @param {boolean} isHome — true = show "← Detail" exit, false = show "⌂ Home" return
 * @returns {HTMLElement}
 */
export function renderFieldModeHeader(isHome) {
  return el('div', { className: 'field-mode-header', 'data-testid': 'field-mode-header' }, [
    el('button', {
      className: 'field-mode-header-btn',
      'data-testid': isHome ? 'field-mode-exit' : 'field-mode-home-btn',
      onClick: () => {
        if (isHome) {
          setFieldMode(false);
          navigate('#/');
        } else {
          navigate('#/field');
        }
      },
    }, [isHome ? `\u2190 ${t('fieldMode.exit')}` : `\u2302 ${t('fieldMode.home')}`]),
    el('span', { className: 'field-mode-header-title' }, [t('fieldMode.title')]),
    el('span', {}),
  ]);
}

// ---------------------------------------------------------------------------
// Active events
// ---------------------------------------------------------------------------

function renderActiveEvents(rootContainer) {
  const section = rootContainer.querySelector('[data-testid="field-mode-events"]');
  if (!section) return;
  clear(section);

  const events = getAll('events').filter(e => !e.dateOut);
  const todayStr = new Date().toISOString().slice(0, 10);

  section.appendChild(el('h3', { className: 'settings-section-title' }, [t('fieldMode.activeEvents')]));

  if (!events.length) {
    section.appendChild(el('p', { className: 'form-hint' }, [t('fieldMode.noActiveEvents')]));
    return;
  }

  for (const evt of events) {
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
    const gws = getAll('eventGroupWindows').filter(w => w.eventId === evt.id && !w.dateLeft);
    const locNames = pws.map(w => {
      const loc = getById('locations', w.locationId);
      return loc ? loc.name : '?';
    }).join(', ');
    const groupNames = gws.map(w => {
      const g = getById('groups', w.groupId);
      return g ? `${g.name} (${w.headCount})` : '?';
    }).join(', ');
    const dayCount = evt.dateIn ? daysBetweenInclusive(evt.dateIn, todayStr) : 0;

    // Check if fed today
    const feedEntries = getAll('eventFeedEntries').filter(e => e.eventId === evt.id && e.date === todayStr);
    const fedToday = feedEntries.length > 0;

    section.appendChild(el('div', {
      className: 'card',
      style: { padding: 'var(--space-4)', marginBottom: 'var(--space-3)' },
      'data-testid': `field-mode-event-${evt.id}`,
    }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } }, [
          el('span', { className: `feed-dot ${fedToday ? 'feed-dot-fed' : 'feed-dot-unfed'}` }),
          el('div', {}, [
            el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [locNames || '?']),
            el('div', { className: 'form-hint' }, [groupNames]),
          ]),
        ]),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } }, [
          el('span', { className: 'badge badge-green' }, [`${dayCount}d`]),
          el('button', {
            className: 'btn btn-green btn-xs',
            'data-testid': `field-mode-move-${evt.id}`,
            onClick: () => navigate('#/events'),
          }, [t('event.moveWizard')]),
        ]),
      ]),
    ]));
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function renderTasks(rootContainer) {
  const section = rootContainer.querySelector('[data-testid="field-mode-tasks"]');
  if (!section) return;
  clear(section);

  const todos = getAll('todos').filter(td => td.status === 'open');

  section.appendChild(el('h3', {
    className: 'settings-section-title',
    style: { marginTop: 'var(--space-5)' },
  }, [t('fieldMode.tasks')]));

  if (!todos.length) {
    section.appendChild(el('p', { className: 'form-hint' }, [t('fieldMode.noTasks')]));
    return;
  }

  for (const todo of todos) {
    section.appendChild(el('div', {
      className: 'ft-row',
      'data-testid': `field-mode-task-${todo.id}`,
    }, [
      el('span', { className: 'ft-row-name' }, [todo.title]),
      todo.dueDate ? el('span', { className: 'ft-row-detail' }, [todo.dueDate]) : null,
    ].filter(Boolean)));
  }
}
