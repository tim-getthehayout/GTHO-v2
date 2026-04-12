/** @file Entity: todo_assignments — V2_SCHEMA_DESIGN.md §11.4 */

// Write-once join table: no created_at/updated_at pair. Only assigned_at is tracked.
// Unique constraint: (todo_id, user_id).

export const FIELDS = {
  id:         { type: 'uuid',        required: false, sbColumn: 'id' },
  todoId:     { type: 'uuid',        required: true,  sbColumn: 'todo_id' },
  userId:     { type: 'uuid',        required: true,  sbColumn: 'user_id' },
  assignedAt: { type: 'timestamptz', required: false, sbColumn: 'assigned_at' },
};

export function create(data = {}) {
  return {
    id:         data.id         ?? crypto.randomUUID(),
    todoId:     data.todoId     ?? null,
    userId:     data.userId     ?? null,
    assignedAt: data.assignedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.todoId) errors.push('todoId is required');
  if (!record.userId) errors.push('userId is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:          record.id,
    todo_id:     record.todoId,
    user_id:     record.userId,
    assigned_at: record.assignedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:         row.id,
    todoId:     row.todo_id,
    userId:     row.user_id,
    assignedAt: row.assigned_at,
  };
}
