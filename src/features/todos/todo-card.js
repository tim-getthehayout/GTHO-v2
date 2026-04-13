/** @file Todo card component — §17.11. Used in both dashboard (compact) and todos screen (full). */

import { el } from '../../ui/dom.js';
import { getAll } from '../../data/store.js';
import { openTodoSheet } from './todo-sheet.js';

/**
 * Status → color bar class mapping.
 */
const STATUS_BAR_COLORS = {
  open: 'var(--color-amber-base)',
  in_progress: 'var(--color-blue-base)',
  closed: 'var(--color-green-base)',
};

/**
 * Status → pill class mapping.
 */
const STATUS_PILL_CLASSES = {
  open: 'sp-open',
  in_progress: 'sp-progress',
  closed: 'sp-closed',
};

/**
 * Status → display label.
 */
const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
};

/**
 * Render a todo card.
 * @param {object} todo - Todo record
 * @param {boolean} compact - If true, hide detail line and note preview
 * @returns {HTMLElement}
 */
export function renderTodoCard(todo, compact = false) {
  const statusColor = STATUS_BAR_COLORS[todo.status] || STATUS_BAR_COLORS.open;
  const pillClass = STATUS_PILL_CLASSES[todo.status] || STATUS_PILL_CLASSES.open;
  const isClosed = todo.status === 'closed';

  // Build children
  const children = [];

  // Title + status pill row
  children.push(
    el('div', { className: 'todo-card-header' }, [
      el('div', { className: 'todo-card-title' }, [todo.title || '']),
      el('span', { className: `todo-pill ${pillClass}` }, [STATUS_LABELS[todo.status] || todo.status]),
    ])
  );

  // Detail line (full mode only)
  if (!compact) {
    const detailParts = [];
    if (todo.locationId) {
      const loc = getAll('locations').find(l => l.id === todo.locationId);
      if (loc) detailParts.push(`\uD83D\uDCCD ${loc.name}`);
    }
    if (todo.animalId) {
      const animal = getAll('animals').find(a => a.id === todo.animalId);
      if (animal) detailParts.push(`\uD83D\uDC04 ${animal.tagNum || animal.name || ''}`);
    }
    if (detailParts.length) {
      children.push(el('div', { className: 'todo-card-detail' }, [detailParts.join(' \u00B7 ')]));
    }

    // Note preview
    if (todo.note) {
      const preview = todo.note.length > 80 ? todo.note.slice(0, 80) + '\u2026' : todo.note;
      children.push(el('div', { className: 'todo-card-note' }, [preview]));
    }
  }

  // Assignee avatars
  const assignments = getAll('todoAssignments').filter(a => a.todoId === todo.id);
  if (assignments.length) {
    const members = getAll('operationMembers');
    const avatarRow = el('div', { className: 'todo-card-avatars' });
    for (const assignment of assignments) {
      const member = members.find(m => m.userId === assignment.userId);
      const initials = member?.displayName
        ? member.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        : '?';
      avatarRow.appendChild(el('div', { className: 'todo-avatar' }, [initials]));
    }
    children.push(avatarRow);
  }

  const card = el('div', {
    className: `card todo-card${isClosed ? ' closed' : ''}`,
    'data-testid': `todo-card-${todo.id}`,
    onClick: () => openTodoSheet(todo),
    style: { cursor: 'pointer' },
  }, [
    // Status color bar (left edge)
    el('div', { className: 'todo-card-bar', style: { background: statusColor } }),
    el('div', { className: 'todo-card-body' }, children),
  ]);

  return card;
}
