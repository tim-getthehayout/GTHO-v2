/** @file Todos screen — §17.9–§17.11. Full-screen list with 3-axis filtering. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, subscribe } from '../../data/store.js';
import { renderTodoCard } from './todo-card.js';
import { openTodoSheet } from './todo-sheet.js';

/** Unsubscribe functions */
let unsubs = [];

/** Filter state */
let statusFilters = { open: true, in_progress: true, closed: false };
let userFilter = null;   // null = all
let locationFilter = null; // null = all

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderTodosScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  statusFilters = { open: true, in_progress: true, closed: false };
  userFilter = null;
  locationFilter = null;

  const screenEl = el('div', { 'data-testid': 'todos-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('todos.title')]),
    ]),

    // Filter bars
    el('div', { 'data-testid': 'todos-filters' }),

    // Summary line
    el('div', { 'data-testid': 'todos-summary', className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }),

    // Todo list
    el('div', { 'data-testid': 'todos-list' }),

    // Add task button
    el('button', {
      className: 'btn btn-outline btn-sm',
      style: { marginTop: 'var(--space-4)' },
      'data-testid': 'todos-add-btn',
      onClick: () => openTodoSheet(),
    }, [t('todos.addTask')]),
  ]);

  container.appendChild(screenEl);
  renderFilters(container);
  renderList(container);

  unsubs.push(subscribe('todos', () => {
    renderFilters(container);
    renderList(container);
  }));
  unsubs.push(subscribe('todoAssignments', () => renderList(container)));
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function renderFilters(rootContainer) {
  const filterEl = rootContainer.querySelector('[data-testid="todos-filters"]');
  if (!filterEl) return;
  clear(filterEl);

  // Row 1: Status filters
  const statusRow = el('div', { className: 'filter-pills' });
  for (const [status, label] of [['open', t('todos.statusOpen')], ['in_progress', t('todos.statusInProgress')], ['closed', t('todos.statusClosed')]]) {
    statusRow.appendChild(el('button', {
      className: `fp${statusFilters[status] ? ' active' : ''}`,
      'data-testid': `todos-filter-${status}`,
      onClick: () => {
        statusFilters[status] = !statusFilters[status];
        // Ensure at least one active
        if (!statusFilters.open && !statusFilters.in_progress && !statusFilters.closed) {
          statusFilters[status] = true;
        }
        renderFilters(rootContainer);
        renderList(rootContainer);
      },
    }, [label]));
  }
  filterEl.appendChild(statusRow);

  // Row 2: User filters
  const members = getAll('operationMembers');
  if (members.length > 0) {
    const userRow = el('div', { className: 'filter-pills' });
    userRow.appendChild(el('button', {
      className: `fp${userFilter === null ? ' active' : ''}`,
      onClick: () => { userFilter = null; renderFilters(rootContainer); renderList(rootContainer); },
    }, [t('todos.filterAll')]));
    for (const member of members) {
      const name = member.displayName || member.email || member.userId;
      userRow.appendChild(el('button', {
        className: `fp${userFilter === member.userId ? ' active' : ''}`,
        onClick: () => { userFilter = member.userId; renderFilters(rootContainer); renderList(rootContainer); },
      }, [name]));
    }
    filterEl.appendChild(userRow);
  }

  // Row 3: Location filters
  const todos = getAll('todos');
  const todoLocationIds = [...new Set(todos.map(td => td.locationId).filter(Boolean))];
  const hasUnlinked = todos.some(td => !td.locationId);
  if (todoLocationIds.length > 0 || hasUnlinked) {
    const locRow = el('div', { className: 'filter-pills' });
    locRow.appendChild(el('button', {
      className: `fp${locationFilter === null ? ' active' : ''}`,
      onClick: () => { locationFilter = null; renderFilters(rootContainer); renderList(rootContainer); },
    }, [t('todos.filterAll')]));

    for (const locId of todoLocationIds) {
      const loc = getAll('locations').find(l => l.id === locId);
      const locName = loc ? loc.name : locId;
      locRow.appendChild(el('button', {
        className: `fp${locationFilter === locId ? ' active' : ''}`,
        onClick: () => { locationFilter = locId; renderFilters(rootContainer); renderList(rootContainer); },
      }, [locName]));
    }

    if (hasUnlinked) {
      locRow.appendChild(el('button', {
        className: `fp${locationFilter === '__none__' ? ' active' : ''}`,
        onClick: () => { locationFilter = '__none__'; renderFilters(rootContainer); renderList(rootContainer); },
      }, [t('todos.noLocation')]));
    }

    filterEl.appendChild(locRow);
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(rootContainer) {
  const listEl = rootContainer.querySelector('[data-testid="todos-list"]');
  const summaryEl = rootContainer.querySelector('[data-testid="todos-summary"]');
  if (!listEl) return;
  clear(listEl);

  let todos = getAll('todos');

  // Filter by status
  todos = todos.filter(td => statusFilters[td.status]);

  // Filter by user
  if (userFilter) {
    const assignments = getAll('todoAssignments');
    const assignedTodoIds = new Set(assignments.filter(a => a.userId === userFilter).map(a => a.todoId));
    todos = todos.filter(td => assignedTodoIds.has(td.id));
  }

  // Filter by location
  if (locationFilter === '__none__') {
    todos = todos.filter(td => !td.locationId);
  } else if (locationFilter) {
    todos = todos.filter(td => td.locationId === locationFilter);
  }

  // Sort newest first
  todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Summary line
  if (summaryEl) {
    clear(summaryEl);
    summaryEl.appendChild(el('span', {}, [t('todos.tasksShown', { count: todos.length })]));
  }

  if (!todos.length) {
    listEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'todos-empty' }, [t('todos.emptyFiltered')]));
    return;
  }

  const list = el('div', { className: 'todo-list' });
  for (const todo of todos) {
    list.appendChild(renderTodoCard(todo, false));
  }
  listEl.appendChild(list);
}

/**
 * Get count of non-closed todos (for badge).
 * @returns {number}
 */
export function getOpenTodoCount() {
  return getAll('todos').filter(td => td.status !== 'closed').length;
}
