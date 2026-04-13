/** @file Todo create/edit sheet — §17.10. Standard sheet for creating or editing a todo. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import * as store from '../../data/store.js';
import * as todoEntity from '../../entities/todo.js';
import * as todoAssignmentEntity from '../../entities/todo-assignment.js';

const sheet = new Sheet('todo-sheet-wrap');

/** Currently editing todo (null = create mode) */
let editingTodo = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open the todo sheet.
 * @param {object} [todo] - Existing todo for edit mode. Omit for create.
 * @param {object} [prefill] - Pre-population context { locationId, animalId }
 */
export function openTodoSheet(todo, prefill) {
  editingTodo = todo || null;
  ensureSheetDOM();
  renderSheetContent(prefill);
  sheet.open();
}

// ---------------------------------------------------------------------------
// DOM scaffold (created once)
// ---------------------------------------------------------------------------

function ensureSheetDOM() {
  if (document.getElementById('todo-sheet-wrap')) return;

  const wrap = el('div', { className: 'sheet-wrap', id: 'todo-sheet-wrap', 'data-testid': 'todo-sheet' }, [
    el('div', { className: 'sheet-backdrop', onClick: () => sheet.close() }),
    el('div', { className: 'sheet-panel' }, [
      el('div', { id: 'todo-sheet-content' }),
    ]),
  ]);

  document.body.appendChild(wrap);
}

// ---------------------------------------------------------------------------
// Sheet content
// ---------------------------------------------------------------------------

function renderSheetContent(prefill) {
  const contentEl = document.getElementById('todo-sheet-content');
  if (!contentEl) return;
  clear(contentEl);

  const isEdit = !!editingTodo;
  const todo = editingTodo || {};

  // Pre-fill values
  const titleVal = todo.title || '';
  const statusVal = todo.status || 'open';
  const locationVal = todo.locationId || prefill?.locationId || null;
  const animalVal = todo.animalId || prefill?.animalId || null;
  const dueDateVal = todo.dueDate || '';
  const noteVal = todo.note || '';

  // Get existing assignments for edit mode
  const existingAssignments = isEdit
    ? store.getAll('todoAssignments').filter(a => a.todoId === todo.id).map(a => a.userId)
    : [];

  // Track selected assignees
  const selectedAssignees = new Set(existingAssignments);

  // Title
  contentEl.appendChild(el('h2', { style: { fontSize: '18px', fontWeight: '600', marginBottom: 'var(--space-5)' } }, [
    isEdit ? t('todos.editTask') : t('todos.newTask'),
  ]));

  // Title input
  contentEl.appendChild(el('label', { className: 'form-label' }, [t('todos.fieldTitle')]));
  const titleInput = el('input', {
    className: 'auth-input',
    type: 'text',
    value: titleVal,
    placeholder: t('todos.titlePlaceholder'),
    'data-testid': 'todo-title-input',
  });
  contentEl.appendChild(titleInput);

  // Assignees (multi-select chips)
  const members = store.getAll('operationMembers');
  if (members.length > 0) {
    contentEl.appendChild(el('label', { className: 'form-label' }, [t('todos.fieldAssignees')]));
    const chipsContainer = el('div', { className: 'todo-assignee-chips', 'data-testid': 'todo-assignees' });

    for (const member of members) {
      const name = member.displayName || member.email || member.userId;
      const isSelected = selectedAssignees.has(member.userId);
      const chip = el('button', {
        className: `fp${isSelected ? ' active' : ''}`,
        'data-testid': `todo-assignee-${member.userId}`,
        onClick: () => {
          if (selectedAssignees.has(member.userId)) {
            selectedAssignees.delete(member.userId);
            chip.classList.remove('active');
          } else {
            selectedAssignees.add(member.userId);
            chip.classList.add('active');
          }
        },
      }, [name]);
      chipsContainer.appendChild(chip);
    }
    contentEl.appendChild(chipsContainer);
  }

  // Status select
  contentEl.appendChild(el('label', { className: 'form-label' }, [t('todos.fieldStatus')]));
  const statusSelect = el('select', { className: 'auth-select', 'data-testid': 'todo-status-select' }, [
    el('option', { value: 'open', ...(statusVal === 'open' ? { selected: 'selected' } : {}) }, [t('todos.statusOpen')]),
    el('option', { value: 'in_progress', ...(statusVal === 'in_progress' ? { selected: 'selected' } : {}) }, [t('todos.statusInProgress')]),
    el('option', { value: 'closed', ...(statusVal === 'closed' ? { selected: 'selected' } : {}) }, [t('todos.statusClosed')]),
  ]);
  contentEl.appendChild(statusSelect);

  // Location select
  const locations = store.getAll('locations');
  contentEl.appendChild(el('label', { className: 'form-label' }, [t('todos.fieldLocation')]));
  const locationSelect = el('select', { className: 'auth-select', 'data-testid': 'todo-location-select' }, [
    el('option', { value: '' }, ['\u2014 none \u2014']),
    ...locations.map(loc =>
      el('option', { value: loc.id, ...(locationVal === loc.id ? { selected: 'selected' } : {}) }, [loc.name])
    ),
  ]);
  contentEl.appendChild(locationSelect);

  // Animal select
  const animals = store.getAll('animals').filter(a => a.status !== 'culled');
  contentEl.appendChild(el('label', { className: 'form-label' }, [t('todos.fieldAnimal')]));
  const animalSelect = el('select', { className: 'auth-select', 'data-testid': 'todo-animal-select' }, [
    el('option', { value: '' }, ['\u2014 none \u2014']),
    ...animals.map(a =>
      el('option', { value: a.id, ...(animalVal === a.id ? { selected: 'selected' } : {}) }, [
        `${a.tagNum || ''} ${a.name || ''}`.trim() || a.id,
      ])
    ),
  ]);
  contentEl.appendChild(animalSelect);

  // Due date
  contentEl.appendChild(el('label', { className: 'form-label' }, [t('todos.fieldDueDate')]));
  const dueDateInput = el('input', {
    className: 'auth-input',
    type: 'date',
    value: dueDateVal,
    'data-testid': 'todo-due-date-input',
  });
  contentEl.appendChild(dueDateInput);

  // Note
  contentEl.appendChild(el('label', { className: 'form-label' }, [t('todos.fieldNote')]));
  const noteInput = el('textarea', {
    className: 'auth-input',
    rows: '3',
    placeholder: t('todos.notePlaceholder'),
    'data-testid': 'todo-note-input',
  });
  noteInput.value = noteVal;
  contentEl.appendChild(noteInput);

  // Error display
  const errorEl = el('div', { className: 'auth-error', 'data-testid': 'todo-error', style: { marginTop: 'var(--space-3)' } });
  contentEl.appendChild(errorEl);

  // Action buttons
  const actions = el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-outline', 'data-testid': 'todo-cancel-btn', onClick: () => sheet.close() }, [t('action.cancel')]),
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'todo-save-btn',
      onClick: () => saveTodo(titleInput, statusSelect, locationSelect, animalSelect, dueDateInput, noteInput, errorEl, selectedAssignees),
    }, [t('action.save')]),
  ]);
  contentEl.appendChild(actions);

  // Delete button (edit mode only)
  if (isEdit) {
    contentEl.appendChild(el('button', {
      className: 'btn btn-red btn-sm',
      style: { marginTop: 'var(--space-4)' },
      'data-testid': 'todo-delete-btn',
      onClick: () => deleteTodo(),
    }, [t('action.delete')]));
  }
}

// ---------------------------------------------------------------------------
// Save / Delete
// ---------------------------------------------------------------------------

function saveTodo(titleInput, statusSelect, locationSelect, animalSelect, dueDateInput, noteInput, errorEl, selectedAssignees) {
  const title = titleInput.value.trim();
  if (!title) {
    clear(errorEl);
    errorEl.appendChild(el('span', {}, [t('todos.titleRequired')]));
    return;
  }

  const operations = store.getAll('operations');
  const operationId = operations.length ? operations[0].id : null;

  if (editingTodo) {
    // Update
    store.update('todos', editingTodo.id, {
      title,
      status: statusSelect.value,
      locationId: locationSelect.value || null,
      animalId: animalSelect.value || null,
      dueDate: dueDateInput.value || null,
      note: noteInput.value || null,
    }, todoEntity.validate, todoEntity.toSupabaseShape, 'todos');

    // Sync assignments: remove old, add new
    const oldAssignments = store.getAll('todoAssignments').filter(a => a.todoId === editingTodo.id);
    for (const old of oldAssignments) {
      if (!selectedAssignees.has(old.userId)) {
        store.remove('todoAssignments', old.id, 'todo_assignments');
      }
    }
    const oldUserIds = new Set(oldAssignments.map(a => a.userId));
    for (const userId of selectedAssignees) {
      if (!oldUserIds.has(userId)) {
        const assignment = todoAssignmentEntity.create({ todoId: editingTodo.id, userId });
        store.add('todoAssignments', assignment, todoAssignmentEntity.validate, todoAssignmentEntity.toSupabaseShape, 'todo_assignments');
      }
    }
  } else {
    // Create
    const newTodo = todoEntity.create({ title, operationId, status: statusSelect.value, locationId: locationSelect.value || null, animalId: animalSelect.value || null, dueDate: dueDateInput.value || null, note: noteInput.value || null });
    store.add('todos', newTodo, todoEntity.validate, todoEntity.toSupabaseShape, 'todos');

    // Create assignments
    for (const userId of selectedAssignees) {
      const assignment = todoAssignmentEntity.create({ todoId: newTodo.id, userId });
      store.add('todoAssignments', assignment, todoAssignmentEntity.validate, todoAssignmentEntity.toSupabaseShape, 'todo_assignments');
    }
  }

  sheet.close();
}

function deleteTodo() {
  if (!editingTodo) return;

  // Remove assignments first
  const assignments = store.getAll('todoAssignments').filter(a => a.todoId === editingTodo.id);
  for (const a of assignments) {
    store.remove('todoAssignments', a.id, 'todo_assignments');
  }

  // Remove todo
  store.remove('todos', editingTodo.id, 'todos');
  editingTodo = null;
  sheet.close();
}
